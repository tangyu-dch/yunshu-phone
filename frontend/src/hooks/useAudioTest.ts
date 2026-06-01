import { useState, useEffect, useCallback } from 'react'
import { callAudio } from '../utils/audio'

/**
 * Hook for testing audio autoplay capability and providing an unlock action.
 *
 * On mount, tests whether the browser allows audio playback without user gesture.
 * If blocked, the consumer should show UI prompting the user to click, then
 * call `unlockAudio()` which retries inside the user-gesture context.
 */
export function useAudioTest() {
  const [audioReady, setAudioReady] = useState(false)
  const [audioBlocked, setAudioBlocked] = useState(false)
  const [tested, setTested] = useState(false)

  useEffect(() => {
    // Skip if already tested this session (singleton keeps state)
    if (callAudio.autoplayAllowed) {
      setAudioReady(true)
      setAudioBlocked(false)
      setTested(true)
      return
    }

    callAudio.testAutoplay().then((allowed) => {
      setAudioReady(allowed)
      setAudioBlocked(!allowed)
      setTested(true)
    })
  }, [])

  /**
   * Attempt to unlock audio. Must be called inside a user-gesture handler.
   * Updates state to reflect the result.
   */
  const unlockAudio = useCallback(async () => {
    const ok = await callAudio.unlock()
    setAudioReady(ok)
    setAudioBlocked(!ok)
    return ok
  }, [])

  return { audioReady, audioBlocked, tested, unlockAudio }
}
