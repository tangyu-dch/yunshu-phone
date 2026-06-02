import { useCallback, useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { ConfigProvider, theme, Modal, App as AntdApp } from 'antd'
import { ExclamationCircleOutlined } from '@ant-design/icons'
import zhCN from 'antd/locale/zh_CN'

import Login from './components/login/Login'
import Index from './components/index/Index'
import UpdateDialog from './components/common/UpdateDialog'
import { RootState } from './store'
import { logout } from './store/userSlice'
import { EventsOn } from '@wailsjs/runtime/runtime'
import * as AppBridge from '@wailsjs/go/bridge/AppBridge'

function App() {
  const dispatch = useDispatch()
  const isLoggedIn = useSelector((s: RootState) => s.user.isLoggedIn)
  const [exitModalOpen, setExitModalOpen] = useState(false)
  const { message } = AntdApp.useApp()

  useEffect(() => {
    EventsOn('app:forceLogout', () => {
      dispatch(logout())
      window.location.hash = '#/login'
    })

    EventsOn('app:closeRequest', () => {
      setExitModalOpen(true)
    })

    EventsOn('app:closeBlocked', (msg: string) => {
      message.warning(msg || '通话中无法关闭')
    })
  }, [dispatch, message])

  const handleExitConfirm = useCallback(() => {
    setExitModalOpen(false)
    AppBridge.ConfirmExit().catch(() => {})
  }, [])

  const handleExitCancel = useCallback(() => {
    setExitModalOpen(false)
  }, [])

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#6366f1',
          colorBgBase: '#18181b',
          colorTextBase: '#ffffff',
          borderRadius: 10,
        },
        components: {
          Card: {
            colorBgContainer: 'rgba(39, 39, 42, 0.4)',
            colorBorderSecondary: 'rgba(255, 255, 255, 0.06)',
          },
          Collapse: {
            colorBgContainer: 'rgba(39, 39, 42, 0.2)',
            colorBorder: 'rgba(255, 255, 255, 0.06)',
          },
          Message: {
            colorBgElevated: 'rgba(39, 39, 42, 0.95)',
            colorText: '#ffffff',
            colorBorder: 'rgba(255, 255, 255, 0.08)',
          },
          Notification: {
            colorBgElevated: 'rgba(28, 28, 30, 0.95)',
            colorText: '#ffffff',
            colorBorder: 'rgba(255, 255, 255, 0.08)',
          },
        },
      }}
    >
      <AntdApp>
        <HashRouter>
          <UpdateDialog />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/index"
              element={isLoggedIn ? <Index /> : <Navigate to="/login" replace />}
            />
            <Route path="*" element={<Navigate to={isLoggedIn ? '/index' : '/login'} replace />} />
          </Routes>
          <Modal
            title={
              <span style={{ fontWeight: 600, fontSize: 15 }}>
                <ExclamationCircleOutlined style={{ marginRight: 8, color: '#f59e0b' }} />
                确认退出
              </span>
            }
            open={exitModalOpen}
            onOk={handleExitConfirm}
            onCancel={handleExitCancel}
            okText="退出"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            className="exit-confirm-modal no-drag"
            width={340}
            centered
          >
            <p style={{ margin: '8px 0 0', fontSize: 14, color: 'rgba(255, 255, 255, 0.75)', lineHeight: 1.6 }}>
              确定要退出云枢吗？
            </p>
          </Modal>
        </HashRouter>
      </AntdApp>
    </ConfigProvider>
  )
}

export default App
