import React, { useCallback, useEffect, useState } from 'react'
import { List, Button, Progress, Tag, Space, Typography, Tooltip } from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  AudioOutlined,
  SoundOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  AudioDevice,
  getAudioDevices,
  testMicrophone,
  hasAudioOutputSupport,
} from '../../utils/device'

const { Text } = Typography

/**
 * Compact component that lists detected audio devices (speakers + microphones),
 * allows the user to test the microphone, and shows a live volume meter.
 */
const DeviceCheck: React.FC = () => {
  const [devices, setDevices] = useState<AudioDevice[]>([])
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [micVolume, setMicVolume] = useState<number | null>(null)
  const [micTestOk, setMicTestOk] = useState<boolean | null>(null)

  const mics = devices.filter((d) => d.kind === 'audioinput')
  const speakers = devices.filter((d) => d.kind === 'audiooutput')

  const refreshDevices = useCallback(async () => {
    setLoading(true)
    try {
      const list = await getAudioDevices()
      setDevices(list)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshDevices()
  }, [refreshDevices])

  const handleTestMic = useCallback(async () => {
    setTesting(true)
    setMicVolume(null)
    setMicTestOk(null)
    try {
      const deviceId = mics[0]?.deviceId
      const result = await testMicrophone(deviceId)
      setMicTestOk(result.success)
      if (result.success) {
        setMicVolume(result.volume)
      }
    } finally {
      setTesting(false)
    }
  }, [mics])

  const statusIcon = (ok: boolean | null) => {
    if (ok === null) return null
    return ok ? (
      <CheckCircleOutlined style={{ color: '#52c41a' }} />
    ) : (
      <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
    )
  }

  return (
    <div style={{ maxWidth: 420 }}>
      <Space style={{ marginBottom: 8, width: '100%', justifyContent: 'space-between' }} align="center">
        <Text strong style={{ fontSize: 13 }}>
          音频设备
        </Text>
        <Tooltip title="刷新设备列表">
          <Button
            type="text"
            size="small"
            icon={<ReloadOutlined spin={loading} />}
            onClick={refreshDevices}
            loading={loading}
          />
        </Tooltip>
      </Space>

      <List
        size="small"
        dataSource={[
          ...speakers.map((d) => ({ ...d, _type: 'speaker' as const })),
          ...mics.map((d) => ({ ...d, _type: 'mic' as const })),
        ]}
        locale={{ emptyText: '未检测到音频设备' }}
        renderItem={(item) => (
          <List.Item style={{ padding: '4px 0' }}>
            <Space size={6}>
              {item._type === 'speaker' ? (
                <SoundOutlined style={{ color: '#1677ff' }} />
              ) : (
                <AudioOutlined style={{ color: '#722ed1' }} />
              )}
              <Text style={{ fontSize: 12 }}>{item.label}</Text>
              <Tag
                color={item._type === 'speaker' ? 'blue' : 'purple'}
                style={{ fontSize: 11, lineHeight: '16px', padding: '0 4px' }}
              >
                {item._type === 'speaker' ? '扬声器' : '麦克风'}
              </Tag>
            </Space>
          </List.Item>
        )}
      />

      {/* Speaker output support note */}
      {!hasAudioOutputSupport() && speakers.length === 0 && (
        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
          当前环境不支持选择音频输出设备
        </Text>
      )}

      {/* Microphone test section */}
      <div style={{ marginTop: 12 }}>
        <Space>
          <Button
            size="small"
            icon={<AudioOutlined />}
            loading={testing}
            onClick={handleTestMic}
            disabled={mics.length === 0}
          >
            测试麦克风
          </Button>
          {statusIcon(micTestOk)}
        </Space>

        {micVolume !== null && (
          <div style={{ marginTop: 8 }}>
            <Text style={{ fontSize: 11, color: '#8c8c8c' }}>音量电平</Text>
            <Progress
              percent={micVolume}
              size="small"
              strokeColor={micVolume > 10 ? '#52c41a' : '#d9d9d9'}
              format={(p) => `${p}`}
            />
          </div>
        )}

        {micTestOk === false && (
          <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
            麦克风测试失败，请检查设备连接或权限设置。
          </Text>
        )}
      </div>
    </div>
  )
}

export default DeviceCheck
