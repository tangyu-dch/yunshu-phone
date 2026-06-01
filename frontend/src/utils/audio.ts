import ringingUrl from '../assets/sounds/ringing.wav'
import answeredUrl from '../assets/sounds/answered.wav'
import hangupUrl from '../assets/sounds/hangup.wav'

/**
 * Audio player for call tones.
 * Preloads all sounds at init to minimize latency.
 * Handles browser autoplay restrictions by detecting blocking and
 * providing an unlock mechanism tied to user gestures.
 */
class CallAudio {
  private ringing: HTMLAudioElement
  private answered: HTMLAudioElement
  private hangup: HTMLAudioElement
  private ringingLoop: boolean = false

  /** Whether autoplay is known to be allowed (no user-gesture block). */
  autoplayAllowed: boolean = false

  constructor() {
    this.ringing = new Audio(ringingUrl)
    this.answered = new Audio(answeredUrl)
    this.hangup = new Audio(hangupUrl)

    // Preload
    this.ringing.preload = 'auto'
    this.answered.preload = 'auto'
    this.hangup.preload = 'auto'
  }

  // ─── Autoplay detection & unlock ─────────────────────────────────────────

  /**
   * Test whether the browser allows audio autoplay (no user-gesture required).
   * Plays a silent clip and resolves `true` on success, `false` if blocked.
   */
  async testAutoplay(): Promise<boolean> {
    try {
      const testAudio = new Audio(answeredUrl)
      testAudio.volume = 0
      await testAudio.play()
      testAudio.pause()
      this.autoplayAllowed = true
      return true
    } catch {
      this.autoplayAllowed = false
      return false
    }
  }

  /**
   * Attempt to unlock the audio context by playing a silent buffer.
   * MUST be called inside a user-gesture event handler (click / tap).
   * Sets `autoplayAllowed = true` on success.
   */
  async unlock(): Promise<boolean> {
    try {
      // Play a tiny silent buffer via AudioContext (most reliable unlock method)
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (AudioCtx) {
        const ctx = new AudioCtx()
        const buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.connect(ctx.destination)
        source.start(0)
        // Give the context a tick to resume, then close it
        await new Promise<void>((resolve) => setTimeout(resolve, 50))
        await ctx.close()
      }

      // Also try playing a real sound file silently — this is what the browser
      // actually gates behind the user-gesture policy for <audio> elements.
      const silent = new Audio(answeredUrl)
      silent.volume = 0.01 // near-silent
      await silent.play()
      silent.pause()

      this.autoplayAllowed = true
      return true
    } catch (e) {
      console.warn('[Audio] unlock failed:', e)
      this.autoplayAllowed = false
      return false
    }
  }

  /**
   * Ensure audio is ready to play.
   * If autoplay is not yet allowed, attempts to unlock (which only succeeds
   * inside a user gesture). Callers should already have shown UI to prompt
   * a user click before calling this.
   */
  async ensureReady(): Promise<void> {
    if (this.autoplayAllowed) return
    // Attempt unlock — will only succeed if called within a user gesture.
    await this.unlock()
  }

  // ─── Playback methods ────────────────────────────────────────────────────

  /** Play ringing tone (loops until stopped) */
  async playRinging() {
    await this.ensureReady()
    this.stopAll()
    this.ringingLoop = true
    this.ringing.loop = true
    this.ringing.currentTime = 0
    this.ringing.play().catch(e => console.warn('[Audio] ringing play failed:', e))
  }

  /** Play answered tone (once) */
  async playAnswered() {
    await this.ensureReady()
    this.stopAll()
    this.answered.currentTime = 0
    this.answered.play().catch(e => console.warn('[Audio] answered play failed:', e))
  }

  /** Play hangup tone (once) */
  async playHangup() {
    await this.ensureReady()
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
}

// Singleton instance
export const callAudio = new CallAudio()
