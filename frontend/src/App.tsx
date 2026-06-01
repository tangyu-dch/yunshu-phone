import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'

import Login from './components/login/Login'
import Index from './components/index/Index'
import UpdateDialog from './components/common/UpdateDialog'
import { RootState } from './store'
import { EventsOn } from '../wailsjs/runtime/runtime'

function App() {
  const isLoggedIn = useSelector((s: RootState) => s.user.isLoggedIn)

  useEffect(() => {
    EventsOn('app:forceLogout', () => {
      window.location.hash = '#/login'
    })

    EventsOn('app:closeBlocked', (msg: string) => {
      console.warn('[App]', msg)
    })
  }, [])

  return (
    <ConfigProvider locale={zhCN}>
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
