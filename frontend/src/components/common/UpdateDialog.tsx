import React, { useState, useEffect, useCallback } from 'react'
import { Modal, Button, Progress, Typography, message } from 'antd'
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
  }, [handleUpdateAvailable, handleUpdateCheck])

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
        <span>
          <CloudDownloadOutlined style={{ marginRight: 8, color: '#1890ff' }} />
          发现新版本
        </span>
      }
      open={visible}
      closable={!updateInfo?.forceUpdate}
      maskClosable={!updateInfo?.forceUpdate}
      onCancel={handleLater}
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
              <Text strong style={styles.versionLabel}>最新版本：</Text>
              <Text type="success" strong>v{updateInfo.version}</Text>
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
                <Text type="warning">此版本为强制更新，必须更新才能继续使用</Text>
              </div>
            )}
          </>
        )}

        {downloading && progress && (
          <div style={styles.progressBox}>
            <Progress
              percent={progress.percent}
              status={progress.status === 'error' ? 'exception' : 'active'}
              strokeColor={{ from: '#667eea', to: '#764ba2' }}
            />
            <Text type="secondary" style={styles.progressText}>
              {progress.message}
            </Text>
          </div>
        )}

        {isReady && (
          <div style={styles.readyBox}>
            <Text type="success">更新已下载完成，点击"立即重启"完成更新</Text>
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
    marginBottom: 12,
  },
  versionLabel: {
    marginRight: 4,
  },
  changelogBox: {
    background: '#f6f7fb',
    borderRadius: 8,
    padding: '10px 14px',
    marginBottom: 12,
  },
  changelog: {
    margin: 0,
    fontSize: 13,
    color: '#555',
    lineHeight: 1.6,
  },
  forceWarning: {
    background: '#fff7e6',
    borderRadius: 6,
    padding: '8px 12px',
    marginBottom: 12,
    border: '1px solid #ffd591',
  },
  progressBox: {
    marginTop: 16,
  },
  progressText: {
    fontSize: 12,
    display: 'block',
    marginTop: 4,
  },
  readyBox: {
    marginTop: 16,
    padding: '10px 14px',
    background: '#f6ffed',
    borderRadius: 6,
    border: '1px solid #b7eb8f',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
  },
  btnPrimary: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    border: 'none',
  },
}

export default UpdateDialog
