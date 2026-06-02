import React, { useEffect, useState } from 'react'
import { Form, Input, Button, message } from 'antd'
import { UserOutlined, LockOutlined, ShopOutlined, CheckCircleFilled, SettingOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { login } from '@/store/userSlice'
import * as AppBridge from '@wailsjs/go/bridge/AppBridge'
import { config } from '@wailsjs/go/models'
import { Modal } from 'antd'

interface LoginForm {
  account: string
  username: string
  password: string
}

const LS_KEY = 'yunshu_login_form'

const Login: React.FC = () => {
  const [form] = Form.useForm<LoginForm>()
  const [loading, setLoading] = useState(false)
  const [settingsVisible, setSettingsVisible] = useState(false)
  const [settingsForm] = Form.useForm()
  const navigate = useNavigate()
  const dispatch = useDispatch()

  // Auto-fill from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        form.setFieldsValue(parsed)
      }
    } catch {
      // ignore
    }

    // Load current config
    AppBridge.GetConfig().then((cfg) => {
      settingsForm.setFieldsValue({
        apiUrl: cfg.api_base_url,
        wsUrl: cfg.ws_base_url,
        sipProxy: cfg.sip_proxy,
      })
    })
  }, [form, settingsForm])

  const handleSaveSettings = async () => {
    try {
      const values = await settingsForm.validateFields()
      await AppBridge.SetCustomEnvironment(values.apiUrl, values.wsUrl, values.sipProxy)
      await AppBridge.SetEnvironment('custom')
      message.success('配置已保存')
      setSettingsVisible(false)
    } catch (e) {
      // validation failed
    }
  }

  const handleSubmit = async (values: LoginForm) => {
    setLoading(true)
    try {
      // Save form values to localStorage for auto-fill
      localStorage.setItem(LS_KEY, JSON.stringify({
        account: values.account,
        username: values.username,
        password: values.password,
      }))

      const result = await AppBridge.Login({
        account: values.account,
        username: values.username,
        password: values.password,
      })

      // Go Login throws on failure, so if we get here it's a success
      if (!result) {
        message.error('登录失败，请检查账号密码')
        return
      }

      // Dispatch login to Redux
      dispatch(login({
        isLoggedIn: true,
        userInfo: result.userInfo ?? {
          id: 0,
          username: values.username,
          seatNumber: '',
          roleDetail: { permissions: [] },
        },
        token: result.token ?? '',
        inactivityDurationSec: result.inactivityDurationSec ?? 300,
      }))

      // Start header monitor for agent status events
      AppBridge.StartHeaderMonitor().catch(() => {})

      message.success('登录成功')
      navigate('/index')
    } catch (err: any) {
      const msg = err?.message || err?.toString?.() || '登录失败，请稍后重试'
      message.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.wrapper}>
      {/* Background aurora lights */}
      <div style={styles.aurora1} />
      <div style={styles.aurora2} />

      <div style={styles.card}>
        {/* Dedicated Top Draggable Titlebar Bar (Red Box area) */}
        <div 
          className="drag-region" 
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '42px',
            zIndex: 10,
            display: 'flex',
            justifyContent: 'flex-end',
            paddingRight: '12px',
            alignItems: 'center'
          }}
        >
          <div className="no-drag" style={{ cursor: 'pointer' }} onClick={() => setSettingsVisible(true)}>
            <SettingOutlined style={{ color: 'rgba(255, 255, 255, 0.45)', fontSize: 16 }} />
          </div>
        </div>

        {/* Logo and title */}
        <div style={styles.header}>
          <div style={styles.logoOuter}>
            <i className="iconfont icon-huchu" style={styles.logo} />
          </div>
          <h1 style={styles.title}>云枢</h1>
          <p style={styles.subtitle}>智能外呼系统 • 桌面版</p>
        </div>

        {/* Login form */}
        <Form
          form={form}
          onFinish={handleSubmit}
          layout="vertical"
          size="large"
          style={styles.form}
          className="no-drag"
        >
          <Form.Item
            name="account"
            rules={[{ required: true, message: '请输入商户账号' }]}
            style={{ marginBottom: 18 }}
          >
            <Input
              prefix={<ShopOutlined style={{ color: 'rgba(255, 255, 255, 0.45)' }} />}
              placeholder="商户账号"
              allowClear
              className="glass-input"
            />
          </Form.Item>

          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
            style={{ marginBottom: 18 }}
          >
            <Input
              prefix={<UserOutlined style={{ color: 'rgba(255, 255, 255, 0.45)' }} />}
              placeholder="用户名"
              allowClear
              className="glass-input"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
            style={{ marginBottom: 26 }}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: 'rgba(255, 255, 255, 0.45)' }} />}
              placeholder="密码"
              className="glass-input"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={styles.submitBtn}
              className="login-submit-btn"
            >
              登 录
            </Button>
          </Form.Item>
        </Form>

        {/* Brand signature */}
        <div style={styles.footer}>
          <CheckCircleFilled style={{ color: '#10b981', fontSize: 11, marginRight: 4 }} />
          <span>VoIP 网络加密安全连通已启用</span>
        </div>
      </div>

      {/* Settings Modal */}
      <Modal
        title="服务端配置"
        open={settingsVisible}
        onOk={handleSaveSettings}
        onCancel={() => setSettingsVisible(false)}
        okText="保存并应用"
        cancelText="取消"
        className="no-drag"
        destroyOnClose
      >
        <Form form={settingsForm} layout="vertical">
          <Form.Item
            name="apiUrl"
            label="API 服务端地址 (HTTP/HTTPS)"
            rules={[{ required: true, message: '请输入 API 地址' }]}
          >
            <Input placeholder="例如: https://dolphinapi.51zhulie.com" />
          </Form.Item>
          <Form.Item
            name="wsUrl"
            label="WebSocket 地址 (WS/WSS)"
            rules={[{ required: true, message: '请输入 WebSocket 地址' }]}
          >
            <Input placeholder="例如: wss://dolphinapi.51zhulie.com/cc/ws/websocket" />
          </Form.Item>
          <Form.Item
            name="sipProxy"
            label="SIP 注册地址 (IP/域名)"
            rules={[{ required: true, message: '请输入 SIP 注册地址' }]}
          >
            <Input placeholder="例如: 127.0.0.1 或 sip.yunshu.local" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: 'relative',
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    overflow: 'hidden',
    fontFamily: "'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  aurora1: {
    position: 'absolute',
    width: 250,
    height: 250,
    background: 'radial-gradient(circle, rgba(99, 102, 241, 0.45) 0%, rgba(99, 102, 241, 0) 70%)',
    top: '10%',
    left: '10%',
    zIndex: 1,
    filter: 'blur(30px)',
    animation: 'pulse-slow 8s infinite alternate',
  },
  aurora2: {
    position: 'absolute',
    width: 300,
    height: 300,
    background: 'radial-gradient(circle, rgba(236, 72, 153, 0.3) 0%, rgba(236, 72, 153, 0) 70%)',
    bottom: '10%',
    right: '5%',
    zIndex: 1,
    filter: 'blur(40px)',
    animation: 'pulse-slow 10s infinite alternate-reverse',
  },
  card: {
    position: 'relative',
    height: '100vh',
    width: '100vw',
    padding: '36px 28px 24px',
    background: 'rgba(24, 24, 27, 0.75)', // Luxury glassmorphism translucent charcoal
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.1)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    zIndex: 2,
    textAlign: 'center',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: 24,
  },
  logoOuter: {
    width: 68,
    height: 68,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(79, 70, 229, 0.2) 100%)',
    border: '1px solid rgba(99, 102, 241, 0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    boxShadow: '0 0 20px rgba(99, 102, 241, 0.25)',
  },
  logo: {
    fontSize: 34,
    background: 'linear-gradient(135deg, #a5b4fc 0%, #818cf8 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    display: 'block',
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: '#ffffff',
    margin: 0,
    letterSpacing: 2,
    lineHeight: 1.2,
  },
  subtitle: {
    fontSize: 12,
    color: '#a1a1aa',
    marginTop: 5,
    marginBottom: 0,
    fontWeight: 400,
    letterSpacing: 0.5,
  },
  form: {
    marginTop: 6,
    textAlign: 'left' as const,
  },
  submitBtn: {
    height: 42,
    fontSize: 15,
    fontWeight: 600,
    borderRadius: 10,
    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
    border: 'none',
    boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
    color: '#ffffff',
    cursor: 'pointer',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  footer: {
    marginTop: 20,
    fontSize: 10,
    color: '#71717a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    letterSpacing: 0.2,
  },
}

// Inject keyframes and global styles for input overlays in document head
const styleSheet = document.createElement('style');
styleSheet.textContent = `
@keyframes pulse-slow {
  0% { transform: scale(1) translate(0, 0); opacity: 0.8; }
  100% { transform: scale(1.15) translate(10px, 10px); opacity: 0.5; }
}
.glass-input.ant-input-wrapper,
.glass-input.ant-input-affix-wrapper {
  background: rgba(255, 255, 255, 0.04) !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  border-radius: 10px !important;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
}
.glass-input.ant-input-affix-wrapper-focused,
.glass-input.ant-input-affix-wrapper:focus,
.glass-input.ant-input-affix-wrapper:hover {
  background: rgba(255, 255, 255, 0.06) !important;
  border-color: rgba(99, 102, 241, 0.6) !important;
  box-shadow: 0 0 10px rgba(99, 102, 241, 0.2) !important;
}
.glass-input input {
  color: #ffffff !important;
  background: transparent !important;
}
.glass-input input::placeholder {
  color: rgba(255, 255, 255, 0.35) !important;
}
.glass-input .ant-input-clear-icon {
  color: rgba(255, 255, 255, 0.45) !important;
}
.glass-input .ant-input-password-icon {
  color: rgba(255, 255, 255, 0.45) !important;
}
.login-submit-btn:hover {
  transform: translateY(-1.5px) !important;
  box-shadow: 0 6px 18px rgba(99, 102, 241, 0.5) !important;
  opacity: 0.95;
}
.login-submit-btn:active {
  transform: translateY(0.5px) !important;
}
`;
document.head.appendChild(styleSheet);

export default Login
