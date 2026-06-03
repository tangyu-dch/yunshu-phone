import React, { useCallback, useEffect, useState, useRef } from 'react'
import { Button, Progress, Tag, Space, Typography, Card, Select, Alert, Divider } from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  AudioOutlined,
  SoundOutlined,
  ReloadOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons'
import {
  AudioDevice,
  getAudioDevices,
  hasAudioOutputSupport,
  playTestSound,
} from '@/utils/device'

const { Text, Paragraph } = Typography
const { Option } = Select

const DeviceCheck: React.FC = () => {
  const [devices, setDevices] = useState<AudioDevice[]>([])
  const [loading, setLoading] = useState(false)
  
  // Selected devices
  const [selectedMic, setSelectedMic] = useState<string>('')
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>('')
  
  // Testing states
  const [isPlayingSound, setIsPlayingSound] = useState(false)
  const [isTestingMic, setIsTestingMic] = useState(false)
  
  // Volume and results
  const [micVolume, setMicVolume] = useState<number>(0)
  const [maxVolumeObserved, setMaxVolumeObserved] = useState<number>(0)
  const [micTestStatus, setMicTestStatus] = useState<'idle' | 'testing' | 'success' | 'fail'>('idle')

  // Audio refs for real-time tracking
  const micStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  const mics = devices.filter((d) => d.kind === 'audioinput')
  const speakers = devices.filter((d) => d.kind === 'audiooutput')

  // Inject style block on mount
  useEffect(() => {
    const id = 'device-check-styles'
    if (!document.getElementById(id)) {
      const style = document.createElement('style')
      style.id = id
      style.textContent = `
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-indigo {
          0% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4); }
          70% { box-shadow: 0 0 0 8px rgba(99, 102, 241, 0); }
          100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
        }
        @keyframes pulse-red {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
          70% { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        .premium-card {
          background: rgba(255, 255, 255, 0.015) !important;
          border: 1px solid rgba(255, 255, 255, 0.05) !important;
          border-radius: 12px !important;
          box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.02), 0 4px 16px rgba(0, 0, 0, 0.25) !important;
          transition: all 0.2s ease-in-out !important;
        }
        .premium-card:hover {
          border-color: rgba(255, 255, 255, 0.1) !important;
          background: rgba(255, 255, 255, 0.025) !important;
        }
        .premium-card .ant-card-head {
          border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
          min-height: 38px !important;
          padding: 0 12px !important;
        }
        .premium-card .ant-card-head-title {
          padding: 8px 0 !important;
          font-weight: 600 !important;
          color: #f4f4f5 !important;
        }
        .premium-card .ant-card-body {
          padding: 12px !important;
        }
        .premium-card .ant-card-extra {
          padding: 8px 0 !important;
        }
        .premium-select .ant-select-selector {
          background: rgba(255, 255, 255, 0.02) !important;
          border: 1px solid rgba(255, 255, 255, 0.08) !important;
          border-radius: 8px !important;
          color: #f4f4f5 !important;
          height: 32px !important;
          transition: all 0.2s !important;
        }
        .premium-select.ant-select-focused .ant-select-selector,
        .premium-select:hover .ant-select-selector {
          border-color: #6366f1 !important;
          box-shadow: 0 0 8px rgba(99, 102, 241, 0.15) !important;
        }
        .premium-select .ant-select-arrow {
          color: rgba(255, 255, 255, 0.4) !important;
        }
        .btn-premium {
          border-radius: 8px !important;
          font-weight: 500 !important;
          transition: all 0.2s !important;
        }
        .btn-premium:hover {
          transform: translateY(-1px);
        }
        .btn-pulse-speaker {
          animation: pulse-indigo 1.5s infinite;
        }
        .btn-pulse-mic {
          animation: pulse-red 1.5s infinite;
        }
      `
      document.head.appendChild(style)
    }
  }, [])

  // Fetch and populate audio devices
  const refreshDevices = useCallback(async () => {
    setLoading(true)
    try {
      const list = await getAudioDevices()
      setDevices(list)
      
      const currentMics = list.filter((d) => d.kind === 'audioinput')
      const currentSpeakers = list.filter((d) => d.kind === 'audiooutput')

      // Set default selected devices if not already set
      if (currentMics.length > 0 && (!selectedMic || !list.some(d => d.deviceId === selectedMic))) {
        setSelectedMic(currentMics[0].deviceId)
      }
      if (currentSpeakers.length > 0 && (!selectedSpeaker || !list.some(d => d.deviceId === selectedSpeaker))) {
        setSelectedSpeaker(currentSpeakers[0].deviceId)
      }
    } finally {
      setLoading(false)
    }
  }, [selectedMic, selectedSpeaker])

  useEffect(() => {
    refreshDevices()
  }, [])

  // Speaker testing handler
  const handleTestSpeaker = async () => {
    setIsPlayingSound(true)
    try {
      await playTestSound(selectedSpeaker)
    } catch (err) {
      console.error('[Device] Test sound failed:', err)
    } finally {
      setIsPlayingSound(false)
    }
  }

  // Stop microphone test
  const stopMicTest = useCallback(() => {
    setIsTestingMic(false)
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop())
      micStreamRef.current = null
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }

    // Evaluate test results
    if (micTestStatus === 'testing') {
      if (maxVolumeObserved > 10) {
        setMicTestStatus('success')
      } else {
        setMicTestStatus('fail')
      }
    }
    setMicVolume(0)
  }, [micTestStatus, maxVolumeObserved])

  // Cleanup mic stream on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => track.stop())
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {})
      }
    }
  }, [])

  // Start microphone real-time test
  const startMicTest = async () => {
    setIsTestingMic(true)
    setMicVolume(0)
    setMaxVolumeObserved(0)
    setMicTestStatus('testing')

    try {
      const constraints: MediaStreamConstraints = {
        audio: selectedMic ? { deviceId: { exact: selectedMic } } : true,
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      micStreamRef.current = stream

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      const ctx = new AudioCtx()
      audioContextRef.current = ctx

      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)

      const dataArray = new Uint8Array(analyser.frequencyBinCount)

      // Real-time animation loop to measure decibels
      const updateVolume = () => {
        if (!micStreamRef.current) return

        analyser.getByteFrequencyData(dataArray)
        
        // Compute average frequency power
        const total = dataArray.reduce((sum, v) => sum + v, 0)
        const avg = total / dataArray.length
        
        // Normalize 0-255 amplitude to 0-100 progress scale
        const currentVol = Math.min(100, Math.round((avg / 150) * 100))
        
        setMicVolume(currentVol)
        setMaxVolumeObserved((prev) => {
          const nextMax = Math.max(prev, currentVol)
          // If level jumps above threshold, indicate immediate testing success
          if (nextMax > 12) {
            setMicTestStatus('testing') // Keep testing state, but will register success on finish
          }
          return nextMax
        })

        animationFrameRef.current = requestAnimationFrame(updateVolume)
      }

      animationFrameRef.current = requestAnimationFrame(updateVolume)
    } catch (err) {
      console.warn('[Device] microphone access failed:', err)
      setMicTestStatus('fail')
      setIsTestingMic(false)
    }
  }

  const handleMicTestToggle = () => {
    if (isTestingMic) {
      stopMicTest()
    } else {
      startMicTest()
    }
  }

  const renderVolumeMeter = () => {
    const barCount = 18
    const activeBars = isTestingMic ? Math.ceil((micVolume / 100) * barCount) : 0
    return (
      <div style={{ display: 'flex', gap: 3, alignItems: 'center', height: 10, margin: '8px 0' }}>
        {Array.from({ length: barCount }).map((_, idx) => {
          const isActive = idx < activeBars
          let color = 'rgba(255, 255, 255, 0.08)'
          let glow = 'none'
          if (isActive) {
            if (idx < 11) {
              color = '#10b981' // Green
              glow = '0 0 6px rgba(16, 185, 129, 0.5)'
            } else if (idx < 15) {
              color = '#f59e0b' // Yellow/Orange
              glow = '0 0 6px rgba(245, 158, 11, 0.5)'
            } else {
              color = '#ef4444' // Red/Coral
              glow = '0 0 6px rgba(239, 68, 68, 0.5)'
            }
          }
          return (
            <div
              key={idx}
              style={{
                flex: 1,
                height: '100%',
                backgroundColor: color,
                borderRadius: 2,
                boxShadow: glow,
                transition: 'background-color 0.05s, box-shadow 0.05s',
              }}
            />
          )
        })}
      </div>
    )
  }

  if (loading && devices.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 16px',
        textAlign: 'center',
        animation: 'fadeIn 0.2s ease-in-out',
      }}>
        <ReloadOutlined spin style={{ fontSize: 32, color: '#6366f1', marginBottom: 16 }} />
        <Text style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.65)' }}>正在检测音频设备...</Text>
      </div>
    )
  }

  if (!loading && mics.length === 0 && speakers.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 16px',
        textAlign: 'center',
        animation: 'fadeIn 0.3s ease-in-out',
      }}>
        <div style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
          boxShadow: '0 0 16px rgba(239, 68, 68, 0.15)',
        }}>
          <AudioOutlined style={{ fontSize: 24, color: '#ef4444' }} />
        </div>
        <Text style={{ fontSize: 14, fontWeight: 600, color: '#f4f4f5', display: 'block', marginBottom: 6 }}>
          未检测到音频设备
        </Text>
        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 20, maxWidth: 280, lineHeight: 1.5 }}>
          请接入耳麦或麦克风设备。如果已接入，请在 macOS 系统“设置 - 隐私与安全性 - 麦克风”中确认已允许本应用访问。
        </Text>
        <Button
          type="primary"
          icon={<ReloadOutlined spin={loading} />}
          onClick={refreshDevices}
          loading={loading}
          style={{
            borderRadius: 8,
            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
            border: 'none',
            boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)',
            height: 32,
            padding: '0 16px',
          }}
        >
          重新检测
        </Button>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 450, padding: '4px 0', animation: 'fadeIn 0.25s ease-in-out' }}>
      {/* Title & Refresh Button */}
      <Space style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }} align="center">
        <Text type="secondary" style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.45)' }}>
          请戴上耳麦，确保您的呼叫及通话音质良好。
        </Text>
        <Button
          type="text"
          size="small"
          icon={<ReloadOutlined spin={loading} />}
          onClick={refreshDevices}
          loading={loading}
          style={{ color: 'rgba(255, 255, 255, 0.65)', fontSize: 12 }}
        >
          刷新
        </Button>
      </Space>

      {/* 1. Device selection controls */}
      <Card size="small" className="premium-card" style={{ marginBottom: 12 }}>
        <Space direction="vertical" style={{ width: '100%' }} size={10}>
          <div>
            <Text style={{ fontSize: 11, display: 'block', marginBottom: 4, color: 'rgba(255, 255, 255, 0.65)' }}>
              <SoundOutlined style={{ color: '#6366f1', marginRight: 4 }} />
              输出设备 (听筒/扬声器)
            </Text>
            <Select
              size="small"
              className="premium-select"
              style={{ width: '100%' }}
              placeholder="选择音频输出设备"
              value={selectedSpeaker}
              onChange={(v) => setSelectedSpeaker(v)}
              disabled={speakers.length === 0}
            >
              {speakers.map((d) => (
                <Option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </Option>
              ))}
              {speakers.length === 0 && <Option value="">未检测到输出设备</Option>}
            </Select>
          </div>

          <div>
            <Text style={{ fontSize: 11, display: 'block', marginBottom: 4, color: 'rgba(255, 255, 255, 0.65)' }}>
              <AudioOutlined style={{ color: '#8b5cf6', marginRight: 4 }} />
              输入设备 (麦克风)
            </Text>
            <Select
              size="small"
              className="premium-select"
              style={{ width: '100%' }}
              placeholder="选择音频输入设备"
              value={selectedMic}
              onChange={(v) => setSelectedMic(v)}
              disabled={mics.length === 0}
            >
              {mics.map((d) => (
                <Option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </Option>
              ))}
              {mics.length === 0 && <Option value="">未检测到输入设备</Option>}
            </Select>
          </div>
        </Space>
      </Card>

      {/* 2. Speaker and Microphone Test Panels */}
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        
        {/* Speaker checking */}
        <Card 
          size="small" 
          className="premium-card"
          title={<span style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><SoundOutlined style={{ color: '#6366f1' }} /> 扬声器测试</span>}
        >
          <Paragraph style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.45)', marginBottom: 8, lineHeight: 1.4 }}>
            点击“播放测试声音”，确认您的耳机听筒或扬声器能否清晰地听到提示音。
          </Paragraph>
          <Button
            type="default"
            size="small"
            icon={<PlayCircleOutlined />}
            loading={isPlayingSound}
            onClick={handleTestSpeaker}
            disabled={speakers.length === 0}
            className={`btn-premium ${isPlayingSound ? 'btn-pulse-speaker' : ''}`}
            style={{
              height: 28,
              borderRadius: 6,
              background: isPlayingSound ? 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' : 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#fff',
              padding: '0 12px',
            }}
          >
            {isPlayingSound ? '正在播放...' : '播放测试声音'}
          </Button>
        </Card>

        {/* Microphone checking */}
        <Card 
          size="small" 
          className="premium-card"
          title={<span style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><AudioOutlined style={{ color: '#8b5cf6' }} /> 麦克风测试</span>}
          extra={
            micTestStatus === 'success' ? (
              <Tag color="success" style={{ borderRadius: 4, border: 'none', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', margin: 0, padding: '0 6px', fontSize: 11 }} icon={<CheckCircleOutlined />}>检测正常</Tag>
            ) : micTestStatus === 'fail' ? (
              <Tag color="error" style={{ borderRadius: 4, border: 'none', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', margin: 0, padding: '0 6px', fontSize: 11 }} icon={<CloseCircleOutlined />}>检测失败</Tag>
            ) : micTestStatus === 'testing' ? (
              <Tag color="processing" style={{ borderRadius: 4, border: 'none', background: 'rgba(99, 102, 241, 0.15)', color: '#6366f1', margin: 0, padding: '0 6px', fontSize: 11 }}>请说话...</Tag>
            ) : null
          }
        >
          <Paragraph style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.45)', marginBottom: 8, lineHeight: 1.4 }}>
            点击“开始测试”后对麦克风说话，如果下方电平条产生动态波动，则麦克风工作正常。
          </Paragraph>

          <Space direction="vertical" style={{ width: '100%' }} size={10}>
            <Button
              size="small"
              icon={<AudioOutlined />}
              onClick={handleMicTestToggle}
              disabled={mics.length === 0}
              className={`btn-premium ${isTestingMic ? 'btn-pulse-mic' : ''}`}
              style={{
                height: 28,
                borderRadius: 6,
                background: isTestingMic ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#fff',
                padding: '0 12px',
              }}
            >
              {isTestingMic ? '停止测试' : '开始测试'}
            </Button>

            {/* Segmented Volume Meter */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, alignItems: 'center' }}>
                <Text style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.45)' }}>实时输入音量</Text>
                {isTestingMic && <Text style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>{micVolume}%</Text>}
              </div>
              {renderVolumeMeter()}
            </div>
          </Space>

          {/* Test Fail warning message */}
          {micTestStatus === 'fail' && (
            <Alert
              message="未检测到音量起伏，请检查耳机物理开关、连线，或开启系统麦克风访问权限。"
              type="error"
              showIcon
              style={{ marginTop: 10, fontSize: 10, padding: '4px 8px', borderRadius: 6, background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.1)' }}
            />
          )}

          {/* Test Success message */}
          {micTestStatus === 'success' && (
            <Alert
              message="麦克风检测成功！音量电平正常，可保障呼叫质量。"
              type="success"
              showIcon
              style={{ marginTop: 10, fontSize: 10, padding: '4px 8px', borderRadius: 6, background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.1)' }}
            />
          )}
        </Card>
      </Space>

      {/* Speaker capability disclaimer for browsers */}
      {!hasAudioOutputSupport() && (
        <div style={{ marginTop: 10, padding: '0 4px' }}>
          <Text type="secondary" style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.3)' }}>
            注：当前环境仅支持系统默认扬声器，无法在此选择其他输出设备通道。
          </Text>
        </div>
      )}
    </div>
  )
}

export default DeviceCheck
