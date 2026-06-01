import React, { useEffect, useState } from 'react'
import { Dropdown, Tooltip } from 'antd'
import type { MenuProps } from 'antd'
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
        // Trigger headset detection — can be extended
        console.log('Headset check triggered')
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
    <div style={styles.header} className="drag-region">
      {/* Left: App title */}
      <div style={styles.left} className="drag-region">
        <i className="iconfont icon-haitundianhu" style={styles.appIcon} />
        <span style={styles.appTitle}>云枢</span>
      </div>

      {/* Right: User info + status + window controls */}
      <div style={styles.right} className="no-drag">
        {/* User info with dropdown */}
        <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
          <div style={styles.userArea}>
            {/* Status indicator */}
            <Tooltip title={isOnline ? '在线' : '离开'}>
              <span
                style={{
                  ...styles.statusDot,
                  background: isOnline ? '#52c41a' : '#faad14',
                }}
              />
            </Tooltip>
            <UserOutlined style={styles.userIcon} />
            <span style={styles.username}>
              {userInfo?.username || '未登录'}
            </span>
          </div>
        </Dropdown>

        {/* Window controls */}
        <div style={styles.windowControls}>
          <Tooltip title="最小化" placement="bottom">
            <button style={styles.controlBtn} onClick={handleMinimize}>
              <MinusOutlined style={{ fontSize: 12 }} />
            </button>
          </Tooltip>
          <Tooltip title="刷新" placement="bottom">
            <button style={styles.controlBtn} onClick={handleRefresh}>
              <ReloadOutlined style={{ fontSize: 12 }} />
            </button>
          </Tooltip>
          <Tooltip title="关闭" placement="bottom">
            <button
              style={styles.controlBtn}
              className="close-btn"
              onClick={handleClose}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#e81123'
                e.currentTarget.style.color = '#fff'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = '#666'
              }}
            >
              <CloseOutlined style={{ fontSize: 12 }} />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    height: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: '#fff',
    borderBottom: '1px solid #f0f0f0',
    padding: '0 4px 0 12px',
    flexShrink: 0,
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  appIcon: {
    fontSize: 20,
    color: '#667eea',
  },
  appTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#1a1a2e',
    letterSpacing: 1,
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  userArea: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderRadius: 4,
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    display: 'inline-block',
    flexShrink: 0,
  },
  userIcon: {
    fontSize: 14,
    color: '#888',
  },
  username: {
    fontSize: 13,
    color: '#333',
    maxWidth: 100,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  windowControls: {
    display: 'flex',
    alignItems: 'center',
    marginLeft: 4,
  },
  controlBtn: {
    width: 36,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'transparent',
    color: '#666',
    cursor: 'pointer',
    borderRadius: 4,
    transition: 'background 0.15s, color 0.15s',
    outline: 'none',
  },
}

export default Header
