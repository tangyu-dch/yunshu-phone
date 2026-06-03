import React, { useState, useEffect, useCallback } from 'react'
import { Modal, Button, Progress, Typography, App as AntdApp } from 'antd'
import { CloudDownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import { EventsOn, EventsOff } from '@wailsjs/runtime/runtime'
import * as UpdateBridge from '@wailsjs/go/bridge/UpdateBridge'

const { Text, Paragraph } = Typography

interface UpdateInfo {
  version: string
  downloadUrl: string
  changelog: string
  forceUpdate: boolean
}

interface UpdateProgress {
  status: 'downloading' | 'ready' | 'error'
  percent: number
  message: string
}

const UpdateDialog: React.FC = () => {
  const [visible, setVisible] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState<UpdateProgress | null>(null)
  const [checking, setChecking] = useState(false)
  const { message } = AntdApp.useApp()

  const handleUpdateAvailable = useCallback((info: UpdateInfo) => {
    setUpdateInfo(info)
    setVisible(true)
    setProgress(null)
    setDownloading(false)
  }, [])

  const handleUpdateCheck = useCallback(async () => {
    // Backend signaled that a version check is needed (e.g., 426 response)
    setChecking(true)
    try {
      const info = await UpdateBridge.CheckForUpdate()
      if (info) {
        setUpdateInfo(info as UpdateInfo)
        setVisible(true)
        setProgress(null)
        setDownloading(false)
      }
    } catch (err) {
      console.error('[UpdateDialog] Check failed:', err)
    } finally {
      setChecking(false)
    }
  }, [])

  // Inject custom stylesheet for dark theme glassmorphic modal
  useEffect(() => {
    const styleSheet = document.createElement('style');
    styleSheet.setAttribute('id', 'update-dialog-styles');
    styleSheet.textContent = `
      .update-modal .ant-modal-content {
        background: rgba(24, 24, 27, 0.85) !important;
        border: 1px solid rgba(255, 255, 255, 0.08) !important;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.08) !important;
        backdrop-filter: blur(24px) !important;
        -webkit-backdrop-filter: blur(24px) !important;
      }
      .update-modal .ant-modal-header {
        background: transparent !important;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06) !important;
        padding: 20px 24px 16px !important;
      }
      .update-modal .ant-modal-body {
        padding: 16px 24px 20px !important;
      }
      .update-modal .ant-modal-footer {
        background: transparent !important;
        border-top: 1px solid rgba(255, 255, 255, 0.06) !important;
        padding: 12px 24px 16px !important;
      }
      .update-modal .ant-modal-footer .ant-btn-primary {
        background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%) !important;
        border: none !important;
        border-radius: 8px !important;
        font-weight: 600 !important;
        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35) !important;
      }
      .update-modal .ant-modal-footer .ant-btn-primary:hover {
        transform: translateY(-1px) !important;
        box-shadow: 0 6px 16px rgba(99, 102, 241, 0.45) !important;
      }
      .update-modal .ant-modal-footer .ant-btn-default {
        background: rgba(255, 255, 255, 0.06) !important;
        border: 1px solid rgba(255, 255, 255, 0.1) !important;
        border-radius: 8px !important;
        color: rgba(255, 255, 255, 0.75) !important;
        font-weight: 500 !important;
      }
      .update-modal .ant-modal-footer .ant-btn-default:hover {
        background: rgba(255, 255, 255, 0.1) !important;
        color: #ffffff !important;
      }
      .update-modal .ant-modal-close {
        color: rgba(255, 255, 255, 0.45) !important;
      }
      .update-modal .ant-modal-close:hover {
        color: #ffffff !important;
      }
    `;
    document.head.appendChild(styleSheet);
    return () => {
      styleSheet.remove();
    }
  }, []);

  useEffect(() => {
    EventsOn('update:available', handleUpdateAvailable)
    EventsOn('update:check', handleUpdateCheck)
    EventsOn('update:progress', (data: UpdateProgress) => {
      setProgress(data)
      if (data.status === 'ready') {
        setDownloading(false)
      } else if (data.status === 'error') {
        setDownloading(false)
        message.error(data.message || '更新失败')
      }
    })

    return () => {
      EventsOff('update:available')
      EventsOff('update:check')
      EventsOff('update:progress')
    }
  }, [handleUpdateAvailable, handleUpdateCheck, message])

  const handleUpdateNow = async () => {
    if (!updateInfo?.downloadUrl) {
      message.error('下载地址无效')
      return
    }

    setDownloading(true)
    setProgress({ status: 'downloading', percent: 0, message: '正在下载...' })

    try {
      await UpdateBridge.DownloadUpdate(updateInfo.downloadUrl)
    } catch (err: any) {
      const msg = err?.message || err?.toString?.() || '下载失败'
      message.error(msg)
      setDownloading(false)
      setProgress({ status: 'error', percent: 0, message: msg })
    }
  }

  const handleRestart = () => {
    UpdateBridge.RestartApp()
  }

  const handleLater = () => {
    if (updateInfo?.forceUpdate) {
      message.warning('此版本为强制更新，无法跳过')
      return
    }
    setVisible(false)
    setUpdateInfo(null)
    setProgress(null)
  }

  const isReady = progress?.status === 'ready'

  return (
    <Modal
      title={
        <span style={{ color: '#ffffff', fontWeight: 600, fontSize: 15 }}>
          <CloudDownloadOutlined style={{ marginRight: 8, color: '#a5b4fc' }} />
          发现新版本
        </span>
      }
      open={visible}
      closable={!updateInfo?.forceUpdate}
      maskClosable={!updateInfo?.forceUpdate}
      onCancel={handleLater}
      className="no-drag update-modal"
      footer={
        <div style={styles.footer}>
          {isReady ? (
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={handleRestart}
              style={styles.btnPrimary}
            >
              立即重启
            </Button>
          ) : (
            <>
              <Button
                onClick={handleLater}
                disabled={downloading || updateInfo?.forceUpdate}
              >
                {updateInfo?.forceUpdate ? '无法跳过' : '稍后再说'}
              </Button>
              <Button
                type="primary"
                onClick={handleUpdateNow}
                loading={downloading}
                disabled={downloading}
                style={styles.btnPrimary}
              >
                {downloading ? '下载中...' : '立即更新'}
              </Button>
            </>
          )}
        </div>
      }
      width={360}
      centered
    >
      <div style={styles.content}>
        {updateInfo && (
          <>
            <div style={styles.versionRow}>
              <span style={styles.versionLabel}>最新版本：</span>
              <span style={styles.versionText}>v{updateInfo.version}</span>
            </div>

            {updateInfo.changelog && (
              <div style={styles.changelogBox}>
                <Paragraph
                  style={styles.changelog}
                  ellipsis={{ rows: 4, expandable: true, symbol: '展开' }}
                >
                  {updateInfo.changelog}
                </Paragraph>
              </div>
            )}

            {updateInfo.forceUpdate && (
              <div style={styles.forceWarning}>
                <span style={{ color: '#ef4444', fontSize: 12, fontWeight: 500 }}>
                  此版本为强制更新，必须更新才能继续使用
                </span>
              </div>
            )}
          </>
        )}

        {downloading && progress && (
          <div style={styles.progressBox}>
            <Progress
              percent={progress.percent}
              status={progress.status === 'error' ? 'exception' : 'active'}
              strokeColor={{ from: '#6366f1', to: '#4f46e5' }}
            />
            <span style={styles.progressText}>
              {progress.message}
            </span>
          </div>
        )}

        {isReady && (
          <div style={styles.readyBox}>
            <span style={{ color: '#10b981', fontSize: 13, fontWeight: 500 }}>
              更新已下载完成，点击"立即重启"完成更新
            </span>
          </div>
        )}
      </div>
    </Modal>
  )
}

const styles: Record<string, React.CSSProperties> = {
  content: {
    paddingTop: 8,
  },
  versionRow: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: 16,
  },
  versionLabel: {
    marginRight: 8,
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 13,
  },
  versionText: {
    color: '#10b981',
    fontWeight: 600,
    fontSize: 14,
  },
  changelogBox: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: 8,
    padding: '12px 14px',
    marginBottom: 12,
  },
  changelog: {
    margin: 0,
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 1.6,
  },
  forceWarning: {
    background: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 6,
    padding: '8px 12px',
    marginBottom: 12,
    border: '1px solid rgba(239, 68, 68, 0.2)',
  },
  progressBox: {
    marginTop: 16,
  },
  progressText: {
    fontSize: 12,
    display: 'block',
    marginTop: 4,
    color: 'rgba(255, 255, 255, 0.45)',
  },
  readyBox: {
    marginTop: 16,
    padding: '10px 14px',
    background: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 6,
    border: '1px solid rgba(16, 185, 129, 0.2)',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
  },
  btnPrimary: {
    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
    border: 'none',
  },
}

export default UpdateDialog
