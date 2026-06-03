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

  return (
    <div style={{ maxWidth: 450, padding: '4px 0' }}>
      {/* Title & Refresh Button */}
      <Space style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }} align="center">
        <Text type="secondary" style={{ fontSize: 12 }}>
          请戴上耳机麦克风，确保呼入呼出通话音质良好。
        </Text>
        <Button
          type="text"
          size="small"
          icon={<ReloadOutlined spin={loading} />}
          onClick={refreshDevices}
          loading={loading}
        >
          刷新设备
        </Button>
      </Space>

      {/* 1. Device selection controls */}
      <Card size="small" style={{ marginBottom: 12, background: 'rgba(255,255,255,0.015)' }}>
        <Space direction="vertical" style={{ width: '100%' }} size={10}>
          <div>
            <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              <SoundOutlined style={{ color: '#1677ff', marginRight: 4 }} />
              输出设备 (听筒/扬声器)
            </Text>
            <Select
              size="small"
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
            <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              <AudioOutlined style={{ color: '#722ed1', marginRight: 4 }} />
              输入设备 (麦克风)
            </Text>
            <Select
              size="small"
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
        <Card size="small" title={<span style={{ fontSize: 13 }}><SoundOutlined /> 扬声器测试</span>}>
          <Paragraph style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 8 }}>
            点击“播放测试声音”，确认您的耳机听筒或扬声器能否清晰地听到音乐声。
          </Paragraph>
          <Button
            type="primary"
            ghost
            size="small"
            icon={<PlayCircleOutlined />}
            loading={isPlayingSound}
            onClick={handleTestSpeaker}
            disabled={speakers.length === 0}
          >
            {isPlayingSound ? '正在播放...' : '播放测试声音'}
          </Button>
        </Card>

        {/* Microphone checking */}
        <Card 
          size="small" 
          title={<span style={{ fontSize: 13 }}><AudioOutlined /> 麦克风测试</span>}
          extra={
            micTestStatus === 'success' ? (
              <Tag color="success" icon={<CheckCircleOutlined />}>检测正常</Tag>
            ) : micTestStatus === 'fail' ? (
              <Tag color="error" icon={<CloseCircleOutlined />}>检测失败</Tag>
            ) : micTestStatus === 'testing' ? (
              <Tag color="processing">请说话...</Tag>
            ) : null
          }
        >
          <Paragraph style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 8 }}>
            点击“开始测试”后对麦克风说话，如果下方电平条产生动态波动，则麦克风工作正常。
          </Paragraph>

          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            <Button
              size="small"
              type={isTestingMic ? 'primary' : 'default'}
              danger={isTestingMic}
              icon={<AudioOutlined />}
              onClick={handleMicTestToggle}
              disabled={mics.length === 0}
            >
              {isTestingMic ? '停止测试' : '开始测试'}
            </Button>

            {/* Volume indicator */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <Text style={{ fontSize: 11, color: '#8c8c8c' }}>实时输入音量</Text>
                {isTestingMic && <Text style={{ fontSize: 11, color: '#52c41a' }}>{micVolume}%</Text>}
              </div>
              <Progress
                percent={isTestingMic ? micVolume : 0}
                size="small"
                status={isTestingMic ? "active" : "normal"}
                strokeColor={{
                  '0%': '#10b981',
                  '100%': '#3b82f6',
                }}
                format={() => ''}
              />
            </div>
          </Space>

          {/* Test Fail warning message */}
          {micTestStatus === 'fail' && (
            <Alert
              message="未检测到音量起伏，请检查耳机物理开关、连线，或开启系统麦克风访问权限。"
              type="error"
              showIcon
              style={{ marginTop: 8, fontSize: 11, padding: '4px 8px' }}
            />
          )}

          {/* Test Success message */}
          {micTestStatus === 'success' && (
            <Alert
              message="麦克风检测成功！音量电平正常，可保障呼叫质量。"
              type="success"
              showIcon
              style={{ marginTop: 8, fontSize: 11, padding: '4px 8px' }}
            />
          )}
        </Card>
      </Space>

      {/* Speaker capability disclaimer for browsers */}
      {!hasAudioOutputSupport() && (
        <div style={{ marginTop: 10 }}>
          <Text type="secondary" style={{ fontSize: 10 }}>
            注：当前环境仅支持系统默认扬声器，无法在此选择其他输出设备通道。
          </Text>
        </div>
      )}
    </div>
  )
}

export default DeviceCheck
