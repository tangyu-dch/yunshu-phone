import React, { useState } from 'react'
import { Alert, Typography } from 'antd'
import { SoundOutlined } from '@ant-design/icons'
import { useAudioTest } from '../../hooks/useAudioTest'

const { Text } = Typography

/**
 * A fixed banner shown at the top of the app when audio autoplay is blocked.
 * Clicking the banner triggers a user-gesture unlock and dismisses itself.
 */
const AudioUnlockOverlay: React.FC = () => {
  const { audioBlocked, tested, unlockAudio } = useAudioTest()
  const [unlocking, setUnlocking] = useState(false)

  // Don't render if audio is already allowed, or test hasn't finished yet
  if (!tested || !audioBlocked) return null

  const handleClick = async () => {
    setUnlocking(true)
    await unlockAudio()
    setUnlocking(false)
  }

  return (
    <div
      onClick={handleClick}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <Alert
        type="warning"
        showIcon
        icon={<SoundOutlined style={{ fontSize: 16 }} />}
        message={
          <Text strong style={{ color: '#d48806' }}>
            {unlocking
              ? '正在启用通话提示音...'
              : '点击此处启用通话提示音（浏览器需要您的操作以允许播放声音）'}
          </Text>
        }
        banner
        closable={false}
        style={{
          backgroundColor: '#fffbe6',
          borderBottom: '1px solid #ffe58f',
        }}
      />
    </div>
  )
}

export default AudioUnlockOverlay
