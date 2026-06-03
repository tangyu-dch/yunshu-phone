/**
 * Audio device detection and microphone testing utilities.
 * Uses the Web MediaDevices API.
 */

export interface AudioDevice {
  deviceId: string
  label: string
  kind: 'audioinput' | 'audiooutput'
}

/**
 * Request microphone permission from the user.
 * Returns `true` if permission was granted, `false` otherwise.
 * The media stream is immediately released.
 */
export async function requestMediaPermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach((t) => t.stop())
    return true
  } catch {
    return false
  }
}

/**
 * Enumerate audio input (microphone) and output (speaker) devices.
 *
 * If device labels are empty (permission not yet granted), this will
 * first request microphone permission and then re-enumerate so that
 * meaningful labels are available.
 */
export async function getAudioDevices(): Promise<AudioDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return []
  }

  let devices = await navigator.mediaDevices.enumerateDevices()
  const audioDevices = devices.filter(
    (d) => d.kind === 'audioinput' || d.kind === 'audiooutput'
  )

  // If labels are empty or no devices found, request permission and re-enumerate
  const hasLabels = audioDevices.some((d) => d.label.length > 0)
  if (!hasLabels || audioDevices.length === 0) {
    const granted = await requestMediaPermission()
    if (granted) {
      devices = await navigator.mediaDevices.enumerateDevices()
    }
  }

  return devices
    .filter((d) => d.kind === 'audioinput' || d.kind === 'audiooutput')
    .map((d) => ({
      deviceId: d.deviceId,
      label: d.label || (d.kind === 'audioinput' ? '麦克风' : '扬声器'),
      kind: d.kind as 'audioinput' | 'audiooutput',
    }))
}

/**
 * Open a microphone stream, measure the average volume over ~1 second,
 * and return a normalised volume level (0–100).
 *
 * @param deviceId - Optional device ID to select a specific microphone.
 * @returns `{ success, volume }` where volume is 0–100.
 */
export async function testMicrophone(
  deviceId?: string
): Promise<{ success: boolean; volume: number }> {
  try {
    const constraints: MediaStreamConstraints = {
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    }
    const stream = await navigator.mediaDevices.getUserMedia(constraints)
    const track = stream.getAudioTracks()[0]
    if (!track) {
      return { success: false, volume: 0 }
    }

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    const ctx = new AudioCtx()
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)

    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    const samples: number[] = []

    // Collect samples over ~1 second (20 × 50ms)
    await new Promise<void>((resolve) => {
      let count = 0
      const interval = setInterval(() => {
        analyser.getByteFrequencyData(dataArray)
        // Average amplitude across all frequency bins
        const avg =
          dataArray.reduce((sum, v) => sum + v, 0) / dataArray.length
        samples.push(avg)
        count++
        if (count >= 20) {
          clearInterval(interval)
          resolve()
        }
      }, 50)
    })

    // Clean up
    stream.getTracks().forEach((t) => t.stop())
    await ctx.close()

    // Normalise to 0–100 (byte values 0–255)
    const avgAmplitude = samples.reduce((a, b) => a + b, 0) / samples.length
    const volume = Math.min(100, Math.round((avgAmplitude / 255) * 100))

    return { success: true, volume }
  } catch (e) {
    console.warn('[Device] microphone test failed:', e)
    return { success: false, volume: 0 }
  }
}

/**
 * Check whether the current environment supports selecting an audio output
 * device (i.e. `setSinkId` on `<audio>` elements).
 */
export function hasAudioOutputSupport(): boolean {
  return 'setSinkId' in HTMLAudioElement.prototype
}

/**
 * Play a synthesized high-end test chime using Web Audio API.
 * Respects the selected deviceId if setSinkId is supported.
 */
export function playTestSound(deviceId?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      const ctx = new AudioCtx()
      
      // Create oscillator and gain node
      const osc1 = ctx.createOscillator()
      const osc2 = ctx.createOscillator()
      const gainNode = ctx.createGain()
      
      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(480, ctx.currentTime) // F4
      osc1.frequency.exponentialRampToValueAtTime(960, ctx.currentTime + 0.12)
      
      osc2.type = 'sine'
      osc2.frequency.setValueAtTime(600, ctx.currentTime) // D5
      osc2.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.12)
      
      // Control volume envelopes
      gainNode.gain.setValueAtTime(0, ctx.currentTime)
      gainNode.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05)
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
      
      osc1.connect(gainNode)
      osc2.connect(gainNode)
      
      // Set sink ID if supported
      if (deviceId && 'setSinkId' in HTMLAudioElement.prototype) {
        // Create an audio destination node that can bind sinkId
        // In standard Web Audio, we bind setSinkId to HTMLAudioElement,
        // so we route Web Audio into a MediaStreamAudioDestinationNode
        // and play it via an Audio element to respect the sinkId selection.
        const dest = ctx.createMediaStreamDestination()
        gainNode.connect(dest)
        
        const audio = new Audio()
        audio.srcObject = dest.stream
        ;(audio as any).setSinkId(deviceId)
          .then(() => {
            audio.play()
            osc1.start()
            osc2.start()
            osc1.stop(ctx.currentTime + 0.6)
            osc2.stop(ctx.currentTime + 0.6)
            setTimeout(() => {
              ctx.close()
              audio.pause()
              audio.srcObject = null
              resolve()
            }, 700)
          })
          .catch((err: any) => {
            console.warn('[Device] failed to setSinkId for Web Audio:', err)
            // Fallback to default destination
            gainNode.connect(ctx.destination)
            osc1.start()
            osc2.start()
            osc1.stop(ctx.currentTime + 0.6)
            osc2.stop(ctx.currentTime + 0.6)
            setTimeout(() => {
              ctx.close()
              resolve()
            }, 700)
          })
      } else {
        gainNode.connect(ctx.destination)
        osc1.start()
        osc2.start()
        osc1.stop(ctx.currentTime + 0.6)
        osc2.stop(ctx.currentTime + 0.6)
        setTimeout(() => {
          ctx.close()
          resolve()
        }, 700)
      }
    } catch (e) {
      reject(e)
    }
  })
}

