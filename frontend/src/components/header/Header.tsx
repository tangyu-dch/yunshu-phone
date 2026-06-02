import React, { useEffect, useState } from 'react'
import { Dropdown, Tooltip, Modal } from 'antd'
import type { MenuProps } from 'antd'
import DeviceCheck from '../common/DeviceCheck'
import {
  MinusOutlined,
  ReloadOutlined,
  CloseOutlined,
  UserOutlined,
  LogoutOutlined,
  AudioOutlined,
} from '@ant-design/icons'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { RootState } from '../../store'
import { logout } from '../../store/userSlice'
import * as AppBridge from '../../../wailsjs/go/bridge/AppBridge'
import { EventsOn, EventsOff } from '../../../wailsjs/runtime/runtime'

type AgentStatus = 'online' | 'away'

const Header: React.FC = () => {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const userInfo = useSelector((s: RootState) => s.user.userInfo)
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('online')
  const [isDeviceCheckOpen, setIsDeviceCheckOpen] = useState(false)

  // Listen to agent status events from Go backend
  useEffect(() => {
    EventsOn('agent:status', (status: string) => {
      if (status === 'leave') {
        setAgentStatus('away')
      } else {
        setAgentStatus('online')
      }
    })
    return () => {
      EventsOff('agent:status')
    }
  }, [])

  const handleMinimize = () => {
    AppBridge.MinimizeWindow().catch(() => {})
  }

  const handleRefresh = () => {
    window.location.reload()
  }

  const handleClose = () => {
    AppBridge.CloseWindow().catch(() => {})
  }

  const handleLogout = async () => {
    try {
      await AppBridge.Logout()
    } catch {
      // ignore logout errors
    } finally {
      dispatch(logout())
      navigate('/login')
    }
  }

  const menuItems: MenuProps['items'] = [
    {
      key: 'headset-check',
      icon: <AudioOutlined />,
      label: '耳麦检测',
      onClick: () => {
        setIsDeviceCheckOpen(true)
      },
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      danger: true,
      onClick: handleLogout,
    },
  ]

  const isOnline = agentStatus === 'online'

  return (
    <div style={styles.header}>
      {/* Left: App title */}
      <div style={styles.left}>

        <div style={styles.appIconWrapper}>
          <i className="iconfont icon-huchu" style={styles.appIcon} />
        </div>
        <span style={styles.appTitle}>云枢</span>
      </div>

      {/* Right: User info + status + window controls */}
      <div style={styles.right}>
        {/* User info with dropdown */}
        <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
          <div style={styles.userArea} className="header-user-area">
            {/* Status indicator with breathing halo */}
            <Tooltip title={isOnline ? '在线' : '离开'}>
              <span
                style={{
                  ...styles.statusDot,
                  background: isOnline ? '#10b981' : '#f59e0b',
                }}
                className={isOnline ? 'status-breathing-success' : 'status-breathing-warning'}
              />
            </Tooltip>
            <UserOutlined style={styles.userIcon} />
            <span style={styles.username}>
              {userInfo?.username || '未登录'}
            </span>
          </div>
        </Dropdown>
      </div>

      <Modal
        title="音频设备检测与设置"
        open={isDeviceCheckOpen}
        onCancel={() => setIsDeviceCheckOpen(false)}
        footer={null}
        width={400}
        destroyOnClose
        centered
        className="no-drag"
      >
        <DeviceCheck />
      </Modal>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    height: 42,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'rgba(24, 24, 27, 0.2)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    flexShrink: 0,
    boxShadow: 'none',
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 76,
  },
  appIconWrapper: {
    width: 24,
    height: 24,
    borderRadius: 6,
    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.25) 0%, rgba(79, 70, 229, 0.25) 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appIcon: {
    fontSize: 15,
    color: '#a5b4fc',
  },
  appTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#ffffff',
    letterSpacing: 1,
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  userArea: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    display: 'inline-block',
    flexShrink: 0,
  },
  userIcon: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.65)',
  },
  username: {
    fontSize: 12,
    fontWeight: 600,
    color: '#e4e4e7',
    maxWidth: 90,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  windowControls: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
  },
  controlBtn: {
    width: 32,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'transparent',
    color: 'rgba(255, 255, 255, 0.65)',
    cursor: 'pointer',
    borderRadius: 6,
    transition: 'all 0.15s',
    outline: 'none',
  },
}

// Inject status breathing keyframes & header styles into head
const styleSheet = document.createElement('style');
styleSheet.textContent = `
@keyframes breathing-pulse-success {
  0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
  70% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
  100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
}
@keyframes breathing-pulse-warning {
  0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.4); }
  70% { box-shadow: 0 0 0 6px rgba(245, 158, 11, 0); }
  100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
}
.status-breathing-success {
  animation: breathing-pulse-success 2s infinite ease-in-out;
}
.status-breathing-warning {
  animation: breathing-pulse-warning 2s infinite ease-in-out;
}
.header-user-area:hover {
  background: rgba(255, 255, 255, 0.06) !important;
}
.header-control-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
}
`;
document.head.appendChild(styleSheet);

export default Header
