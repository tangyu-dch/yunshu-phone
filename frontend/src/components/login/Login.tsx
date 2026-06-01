import React, { useEffect, useState } from 'react'
import { Form, Input, Button, message } from 'antd'
import { UserOutlined, LockOutlined, ShopOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { login } from '../../store/userSlice'
import * as AppBridge from '../../../wailsjs/go/bridge/AppBridge'

interface LoginForm {
  account: string
  username: string
  password: string
}

const LS_KEY = 'yunshu_login_form'

const Login: React.FC = () => {
  const [form] = Form.useForm<LoginForm>()
  const [loading, setLoading] = useState(false)
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
  }, [form])

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
      <div style={styles.card}>
        {/* Logo and title */}
        <div style={styles.header}>
          <i className="iconfont icon-haitundianhu" style={styles.logo} />
          <h1 style={styles.title}>云枢</h1>
          <p style={styles.subtitle}>智能外呼系统</p>
        </div>

        {/* Login form */}
        <Form
          form={form}
          onFinish={handleSubmit}
          layout="vertical"
          size="large"
          style={styles.form}
        >
          <Form.Item
            name="account"
            rules={[{ required: true, message: '请输入商户账号' }]}
          >
            <Input
              prefix={<ShopOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="商户账号"
              allowClear
            />
          </Form.Item>

          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input
              prefix={<UserOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="用户名"
              allowClear
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="密码"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={styles.submitBtn}
            >
              登 录
            </Button>
          </Form.Item>
        </Form>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
  card: {
    width: 380,
    padding: '40px 36px 32px',
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.18)',
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: 32,
  },
  logo: {
    fontSize: 48,
    color: '#667eea',
    display: 'block',
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 600,
    color: '#1a1a2e',
    margin: 0,
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 13,
    color: '#999',
    marginTop: 6,
    marginBottom: 0,
  },
  form: {
    marginTop: 8,
  },
  submitBtn: {
    height: 44,
    fontSize: 16,
    fontWeight: 500,
    borderRadius: 8,
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    border: 'none',
  },
}

export default Login
