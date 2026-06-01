import ringingUrl from '../assets/sounds/ringing.wav'
import answeredUrl from '../assets/sounds/answered.wav'
import hangupUrl from '../assets/sounds/hangup.wav'

/**
 * Audio player for call tones.
 * Preloads all sounds at init to minimize latency.
 */
class CallAudio {
  private ringing: HTMLAudioElement
  private answered: HTMLAudioElement
  private hangup: HTMLAudioElement
  private ringingLoop: boolean = false

  constructor() {
    this.ringing = new Audio(ringingUrl)
    this.answered = new Audio(answeredUrl)
    this.hangup = new Audio(hangupUrl)

    // Preload
    this.ringing.preload = 'auto'
    this.answered.preload = 'auto'
    this.hangup.preload = 'auto'
  }

  /** Play ringing tone (loops until stopped) */
  playRinging() {
    this.stopAll()
    this.ringingLoop = true
    this.ringing.loop = true
    this.ringing.currentTime = 0
    this.ringing.play().catch(e => console.warn('[Audio] ringing play failed:', e))
  }

  /** Play answered tone (once) */
  playAnswered() {
    this.stopAll()
    this.answered.currentTime = 0
    this.answered.play().catch(e => console.warn('[Audio] answered play failed:', e))
  }

  /** Play hangup tone (once) */
  playHangup() {
    this.stopAll()
    this.hangup.currentTime = 0
    this.hangup.play().catch(e => console.warn('[Audio] hangup play failed:', e))
  }

  /** Stop all sounds */
  stopAll() {
    this.ringing.pause()
    this.ringing.currentTime = 0
    this.ringingLoop = false

    this.answered.pause()
    this.answered.currentTime = 0

    this.hangup.pause()
    this.hangup.currentTime = 0
  }

  /** Test if audio autoplay is allowed */
  async testAutoplay(): Promise<boolean> {
    try {
      const testAudio = new Audio(answeredUrl)
      testAudio.volume = 0
      await testAudio.play()
      testAudio.pause()
      return true
    } catch {
      return false
    }
  }
}

// Singleton instance
export const callAudio = new CallAudio()
