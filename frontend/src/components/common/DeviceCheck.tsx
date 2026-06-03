import React, { useCallback, useEffect, useState, useRef } from 'react'
import { Button, Tag, Space, Typography, Select, Divider } from 'antd'
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

const { Text } = Typography
const { Option } = Select

/**
 * DeviceCheck 组件提供音频输入（麦克风）和输出（扬声器）设备的检测与设置。
 * 该设计专注于在“云枢”呼叫终端极其有限的客户端窗口高度（540px）内，
 * 呈现极其紧凑、无滚动条、高度精致且具备玻璃摩砂（Glassmorphism）视觉效果的界面。
 */
const DeviceCheck: React.FC = () => {
  const [devices, setDevices] = useState<AudioDevice[]>([])
  const [loading, setLoading] = useState(false)
  
  // 选中的设备 ID
  const [selectedMic, setSelectedMic] = useState<string>('')
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>('')
  
  // 测试状态
  const [isPlayingSound, setIsPlayingSound] = useState(false)
  const [isTestingMic, setIsTestingMic] = useState(false)
  
  // 麦克风输入分贝与测试结果
  const [micVolume, setMicVolume] = useState<number>(0)
  const [maxVolumeObserved, setMaxVolumeObserved] = useState<number>(0)
  const [micTestStatus, setMicTestStatus] = useState<'idle' | 'testing' | 'success' | 'fail'>('idle')

  // 麦克风流媒体和 AudioContext 引用
  const micStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  const mics = devices.filter((d) => d.kind === 'audioinput')
  const speakers = devices.filter((d) => d.kind === 'audiooutput')

  // 组件挂载时，动态注入云枢专属的极简样式定义，包括 Modal 暗色模糊背景与下拉面板的深度定制
  useEffect(() => {
    const id = 'device-check-styles'
    if (!document.getElementById(id)) {
      const style = document.createElement('style')
      style.id = id
      style.textContent = `
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-indigo {
          0% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4); }
          70% { box-shadow: 0 0 0 6px rgba(99, 102, 241, 0); }
          100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
        }
        @keyframes pulse-red {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
          70% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        .premium-select .ant-select-selector {
          background: rgba(255, 255, 255, 0.02) !important;
          border: 1px solid rgba(255, 255, 255, 0.08) !important;
          border-radius: 6px !important;
          color: #f4f4f5 !important;
          height: 32px !important;
          padding: 0 10px !important;
          font-size: 12px !important;
          transition: all 0.2s !important;
        }
        .premium-select.ant-select-focused .ant-select-selector,
        .premium-select:hover .ant-select-selector {
          border-color: #6366f1 !important;
          box-shadow: 0 0 6px rgba(99, 102, 241, 0.15) !important;
        }
        .premium-select .ant-select-arrow {
          color: rgba(255, 255, 255, 0.4) !important;
          font-size: 10px !important;
        }
        .premium-select .ant-select-selection-item {
          line-height: 30px !important;
        }
        .btn-premium {
          border-radius: 6px !important;
          font-weight: 500 !important;
          transition: all 0.2s !important;
        }
        .btn-premium:hover {
          transform: translateY(-0.5px);
        }
        .btn-pulse-speaker {
          animation: pulse-indigo 1.5s infinite;
        }
        .btn-pulse-mic {
          animation: pulse-red 1.5s infinite;
        }
        
        /* 下拉选项弹窗的美化定制，对齐云枢暗色毛玻璃设计 */
        .premium-select-dropdown {
          background: rgba(24, 24, 27, 0.96) !important;
          border: 1px solid rgba(255, 255, 255, 0.08) !important;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5) !important;
          border-radius: 8px !important;
          padding: 4px !important;
          backdrop-filter: blur(16px) !important;
          -webkit-backdrop-filter: blur(16px) !important;
        }
        .premium-select-dropdown .ant-select-item {
          color: rgba(255, 255, 255, 0.7) !important;
          font-size: 11px !important;
          padding: 6px 10px !important;
          border-radius: 4px !important;
          transition: all 0.15s ease !important;
        }
        .premium-select-dropdown .ant-select-item-option-active {
          background: rgba(255, 255, 255, 0.06) !important;
          color: #ffffff !important;
        }
        .premium-select-dropdown .ant-select-item-option-selected {
          background: rgba(99, 102, 241, 0.15) !important;
          color: #6366f1 !important;
          font-weight: 600 !important;
        }
        .premium-select-dropdown .ant-select-empty {
          color: rgba(255, 255, 255, 0.35) !important;
          font-size: 11px !important;
          padding: 8px !important;
        }
        
        /* 深度穿透覆盖 Ant Modal 的暗色毛玻璃与渐变边框，对齐整体云枢科技质感 */
        .device-check-modal .ant-modal-content {
          background: rgba(20, 20, 23, 0.95) !important;
          border: 1px solid rgba(255, 255, 255, 0.08) !important;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.06) !important;
          backdrop-filter: blur(24px) !important;
          -webkit-backdrop-filter: blur(24px) !important;
          border-radius: 12px !important;
        }
        .device-check-modal .ant-modal-header {
          background: transparent !important;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
          padding: 12px 14px 8px !important;
        }
        .device-check-modal .ant-modal-body {
          padding: 12px 14px 14px !important;
        }
        .device-check-modal .ant-modal-close {
          color: rgba(255, 255, 255, 0.45) !important;
          top: 12px !important;
        }
        .device-check-modal .ant-modal-close:hover {
          color: #ffffff !important;
        }
      `
      document.head.appendChild(style)
    }
  }, [])

  // 获取并刷新本地音频硬件列表
  const refreshDevices = useCallback(async () => {
    setLoading(true)
    try {
      const list = await getAudioDevices()
      setDevices(list)
      
      const currentMics = list.filter((d) => d.kind === 'audioinput')
      const currentSpeakers = list.filter((d) => d.kind === 'audiooutput')

      // 若未选择过设备，默认选中首个检测到的设备
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

  // 扬声器提示音播放测试
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

  // 停止麦克风声学动态测试，并计算测试结果
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

    // 根据测试过程中捕捉到的最大音量振幅判断设备是否工作良好
    if (micTestStatus === 'testing') {
      if (maxVolumeObserved > 10) {
        setMicTestStatus('success')
      } else {
        setMicTestStatus('fail')
      }
    }
    setMicVolume(0)
  }, [micTestStatus, maxVolumeObserved])

  // 卸载组件时安全回收流媒体资源
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

  // 开启实时麦克风检测，捕捉实时分贝信号
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

      // 通过 WebGL 动画帧渲染函数提取实时频谱值，映射至 0–100 的数值范围
      const updateVolume = () => {
        if (!micStreamRef.current) return

        analyser.getByteFrequencyData(dataArray)
        
        // 计算当前高低频的总平均能量
        const total = dataArray.reduce((sum, v) => sum + v, 0)
        const avg = total / dataArray.length
        
        // 放大低分贝区域波动，使其在正常说话时也有明显的视觉电平效果
        const currentVol = Math.min(100, Math.round((avg / 150) * 100))
        
        setMicVolume(currentVol)
        setMaxVolumeObserved((prev) => {
          const nextMax = Math.max(prev, currentVol)
          if (nextMax > 12) {
            setMicTestStatus('testing') 
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

  // 渲染极简高拟真度的 LED 级电平波形计
  const renderVolumeMeter = () => {
    const barCount = 18
    const activeBars = isTestingMic ? Math.ceil((micVolume / 100) * barCount) : 0
    return (
      <div style={{ display: 'flex', gap: 3, alignItems: 'center', height: 6, margin: '6px 0' }}>
        {Array.from({ length: barCount }).map((_, idx) => {
          const isActive = idx < activeBars
          let color = 'rgba(255, 255, 255, 0.06)'
          let glow = 'none'
          if (isActive) {
            if (idx < 11) {
              color = '#10b981' // 正常声级：深翡翠绿
              glow = '0 0 6px rgba(16, 185, 129, 0.4)'
            } else if (idx < 15) {
              color = '#f59e0b' // 警示声级：琥珀橙
              glow = '0 0 6px rgba(245, 158, 11, 0.4)'
            } else {
              color = '#ef4444' // 过载声级：珊瑚红
              glow = '0 0 6px rgba(239, 68, 68, 0.4)'
            }
          }
          return (
            <div
              key={idx}
              style={{
                flex: 1,
                height: '100%',
                backgroundColor: color,
                borderRadius: 1.5,
                boxShadow: glow,
                transition: 'background-color 0.05s, box-shadow 0.05s',
              }}
            />
          )
        })}
      </div>
    )
  }

  // 若在加载中且设备列表尚为空，渲染优雅的转圈态
  if (loading && devices.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
        textAlign: 'center',
        animation: 'fadeIn 0.2s ease-in-out',
      }}>
        <ReloadOutlined spin style={{ fontSize: 24, color: '#6366f1', marginBottom: 12 }} />
        <Text style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.65)' }}>正在检测“云枢”音频设备...</Text>
      </div>
    )
  }

  // 无设备时的 fallback 状态，做极简化高度控制
  if (!loading && mics.length === 0 && speakers.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        textAlign: 'center',
        animation: 'fadeIn 0.3s ease-in-out',
      }}>
        <div style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 12,
          boxShadow: '0 0 16px rgba(239, 68, 68, 0.12)',
        }}>
          <AudioOutlined style={{ fontSize: 20, color: '#ef4444' }} />
        </div>
        <Text style={{ fontSize: 13, fontWeight: 600, color: '#f4f4f5', display: 'block', marginBottom: 4 }}>
          未检测到音频设备
        </Text>
        <Text type="secondary" style={{ fontSize: 10, display: 'block', marginBottom: 16, maxWidth: 260, lineHeight: 1.4 }}>
          请接入耳麦或麦克风设备。如果已接入，请在 macOS 系统“设置 - 隐私与安全性 - 麦克风”中确认已允许本应用访问。
        </Text>
        <Button
          type="primary"
          icon={<ReloadOutlined spin={loading} />}
          onClick={refreshDevices}
          loading={loading}
          style={{
            borderRadius: 6,
            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
            border: 'none',
            boxShadow: '0 4px 10px rgba(79, 70, 229, 0.25)',
            height: 28,
            fontSize: 12,
            padding: '0 14px',
          }}
        >
          重新检测
        </Button>
      </div>
    )
  }

  return (
    <div style={{ padding: '2px 0 0 0', animation: 'fadeIn 0.25s ease-in-out', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 顶部引导说明与刷新按钮 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.45)' }}>
          请戴上耳机麦克风，确保呼叫音质清晰。
        </span>
        <Button
          type="text"
          size="small"
          icon={<ReloadOutlined spin={loading} />}
          onClick={refreshDevices}
          loading={loading}
          style={{ color: '#6366f1', padding: '0 4px', fontSize: 11, height: 20 }}
        >
          刷新
        </Button>
      </div>

      {/* 设备选单配置区块：全宽叠放布局 */}
      <div style={{ 
        display: 'flex',
        flexDirection: 'column',
        gap: 10
      }}>
        {/* 输出扬声器选择 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <SoundOutlined style={{ color: '#6366f1', fontSize: 13 }} />
            <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255, 255, 255, 0.7)' }}>输出设备 (听筒/扬声器)</span>
          </div>
          <Select
            size="small"
            className="premium-select"
            popupClassName="premium-select-dropdown"
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

        {/* 输入麦克风选择 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <AudioOutlined style={{ color: '#8b5cf6', fontSize: 13 }} />
            <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255, 255, 255, 0.7)' }}>输入设备 (麦克风)</span>
          </div>
          <Select
            size="small"
            className="premium-select"
            popupClassName="premium-select-dropdown"
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
      </div>

      <Divider style={{ margin: '6px 0', borderColor: 'rgba(255, 255, 255, 0.05)' }} />

      {/* 实时动态测试区块：扁平列表行 */}
      <div style={{ 
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}>
        {/* 扬声器播放测试 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#f4f4f5' }}>扬声器测试</div>
            <div style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.35)' }}>播放测试音确认耳机有声音</div>
          </div>
          <Button
            type="default"
            size="small"
            icon={<PlayCircleOutlined />}
            loading={isPlayingSound}
            onClick={handleTestSpeaker}
            disabled={speakers.length === 0}
            className={`btn-premium ${isPlayingSound ? 'btn-pulse-speaker' : ''}`}
            style={{
              height: 26,
              fontSize: 11,
              borderRadius: 6,
              background: isPlayingSound ? 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' : 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              color: '#fff',
              padding: '0 12px',
            }}
          >
            {isPlayingSound ? '播放中' : '测试音'}
          </Button>
        </div>

        {/* 麦克风录音与波形测试 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#f4f4f5' }}>麦克风测试</div>
              <div style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.35)' }}>发出声音，确认下方电平有跳变</div>
            </div>
            <Button
              size="small"
              icon={<AudioOutlined />}
              onClick={handleMicTestToggle}
              disabled={mics.length === 0}
              className={`btn-premium ${isTestingMic ? 'btn-pulse-mic' : ''}`}
              style={{
                height: 26,
                fontSize: 11,
                borderRadius: 6,
                background: isTestingMic ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                color: '#fff',
                padding: '0 12px',
              }}
            >
              {isTestingMic ? '停止' : '开始'}
            </Button>
          </div>

          {/* 波形电平计 */}
          {renderVolumeMeter()}
        </div>
      </div>

      {/* 极简式内联反馈通知条（代替高占位的 Alert） */}
      {micTestStatus === 'fail' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          borderRadius: 6,
          background: 'rgba(239, 68, 68, 0.06)',
          border: '1px solid rgba(239, 68, 68, 0.12)',
          fontSize: 10,
          color: '#ef4444',
          animation: 'fadeIn 0.2s ease-in-out'
        }}>
          <CloseCircleOutlined />
          <span>无声音输入，请检查物理开关与麦克风权限。</span>
        </div>
      )}

      {micTestStatus === 'success' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          borderRadius: 6,
          background: 'rgba(16, 185, 129, 0.06)',
          border: '1px solid rgba(16, 185, 129, 0.12)',
          fontSize: 10,
          color: '#10b981',
          animation: 'fadeIn 0.2s ease-in-out'
        }}>
          <CheckCircleOutlined />
          <span>麦克风检测成功，拾音正常。</span>
        </div>
      )}

      {/* 针对部分浏览器的免责声明 */}
      {!hasAudioOutputSupport() && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 4 }}>
          <Text type="secondary" style={{ fontSize: 9, color: 'rgba(255, 255, 255, 0.2)', display: 'block', textAlign: 'center' }}>
            注：当前环境由系统默认管理音轨出口，不支持手动指定。
          </Text>
        </div>
      )}
    </div>
  )
}

export default DeviceCheck
