import React, { useState, useEffect } from 'react'
import { Modal, Typography } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'
import { EventsOn, EventsOff } from '@wailsjs/runtime/runtime'
import * as UpdateBridge from '@wailsjs/go/bridge/UpdateBridge'
import logo from '@/assets/images/logo.png'

const { Text, Title, Paragraph } = Typography

const AboutDialog: React.FC = () => {
  const [visible, setVisible] = useState(false)
  const [version, setVersion] = useState('1.0.0')

  useEffect(() => {
    // Listen for the menu event to show the About dialog
    EventsOn('app:showAbout', async () => {
      try {
        const v = await UpdateBridge.GetCurrentVersion()
        if (v) {
          setVersion(v)
        }
      } catch (err) {
        console.error('[AboutDialog] Failed to get version:', err)
      }
      setVisible(true)
    })

    return () => {
      EventsOff('app:showAbout')
    }
  }, [])

  // Inject glassmorphic style overrides for the modal
  useEffect(() => {
    const styleSheet = document.createElement('style')
    styleSheet.setAttribute('id', 'about-dialog-styles')
    styleSheet.textContent = `
      .about-modal .ant-modal-content {
        background: rgba(24, 24, 27, 0.88) !important;
        border: 1px solid rgba(255, 255, 255, 0.08) !important;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.08) !important;
        backdrop-filter: blur(24px) !important;
        -webkit-backdrop-filter: blur(24px) !important;
        border-radius: 12px !important;
      }
      .about-modal .ant-modal-header {
        background: transparent !important;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06) !important;
        padding: 18px 24px 14px !important;
      }
      .about-modal .ant-modal-body {
        padding: 24px 24px 28px !important;
      }
      .about-modal .ant-modal-close {
        color: rgba(255, 255, 255, 0.45) !important;
      }
      .about-modal .ant-modal-close:hover {
        color: #ffffff !important;
      }
    `
    document.head.appendChild(styleSheet)
    return () => {
      styleSheet.remove()
    }
  }, [])

  return (
    <Modal
      title={
        <span style={{ color: '#ffffff', fontWeight: 600, fontSize: 15 }}>
          <InfoCircleOutlined style={{ marginRight: 8, color: '#6366f1' }} />
          关于云枢
        </span>
      }
      open={visible}
      onCancel={() => setVisible(false)}
      footer={null}
      width={360}
      centered
      className="no-drag about-modal"
    >
      <div style={styles.container}>
        {/* Logo and App Title */}
        <div style={styles.header}>
          <div style={styles.logoWrapper}>
            <img src={logo} style={styles.logoIcon} alt="logo" />
          </div>
          <Title level={4} style={styles.title}>云枢呼叫终端</Title>
          <Text style={styles.versionText}>版本：v{version}</Text>
        </div>

        {/* Divider */}
        <div style={styles.divider} />

        {/* Content */}
        <Paragraph style={styles.description}>
          云枢呼叫终端是专为新一代企业级高并发、强交互通信场景设计的分布式智能客服与呼叫中心桌面软电话终端。支持电信级低时延音频通话、VAD 静音检测以及 AI 流程实时语音流编排接入。
        </Paragraph>

        {/* Copyright */}
        <div style={styles.footer}>
          <Text style={styles.copyright}>
            © 2026 云枢 (Yunshu) 保留所有权利
          </Text>
        </div>
      </div>
    </Modal>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: 16,
  },
  logoWrapper: {
    width: 56,
    height: 56,
    borderRadius: 14,
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
    marginBottom: 16,
  },
  logoIcon: {
    width: '75%',
    height: '75%',
    objectFit: 'contain',
  },
  title: {
    margin: '0 0 6px 0 !important',
    color: '#ffffff !important',
    fontWeight: 700,
    letterSpacing: 1,
  },
  versionText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.45)',
  },
  divider: {
    width: '100%',
    height: 1,
    background: 'rgba(255, 255, 255, 0.08)',
    margin: '8px 0 18px 0',
  },
  description: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 1.6,
    textAlign: 'justify',
    margin: '0 0 24px 0',
  },
  footer: {
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
  },
  copyright: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.35)',
  },
}

export default AboutDialog
