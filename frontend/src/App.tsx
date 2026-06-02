import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'

import Login from './components/login/Login'
import Index from './components/index/Index'
import UpdateDialog from './components/common/UpdateDialog'
import { RootState } from './store'
import { logout } from './store/userSlice'
import { EventsOn } from '@wailsjs/runtime/runtime'

function App() {
  const dispatch = useDispatch()
  const isLoggedIn = useSelector((s: RootState) => s.user.isLoggedIn)

  useEffect(() => {
    EventsOn('app:forceLogout', () => {
      dispatch(logout())
      window.location.hash = '#/login'
    })

    EventsOn('app:closeBlocked', (msg: string) => {
      console.warn('[App]', msg)
    })
  }, [dispatch])

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
        },
      }}
    >
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
      </HashRouter>
    </ConfigProvider>
  )
}

export default App
