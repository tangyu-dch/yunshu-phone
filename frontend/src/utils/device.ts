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

  // If labels are empty, request permission and re-enumerate
  const hasLabels = audioDevices.some((d) => d.label.length > 0)
  if (!hasLabels && audioDevices.length > 0) {
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
