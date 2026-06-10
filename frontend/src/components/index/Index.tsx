import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Tabs, Modal, Typography, Space } from 'antd';
import {
  PhoneOutlined,
  UnorderedListOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { EventsOn, EventsOff } from '@wailsjs/runtime/runtime';
import { RootState } from '@/store';

import Header from '@/components/header/Header';
import PhoneCall from './components/PhoneCall';
import CallRecords, { CallRecordsHandle } from './components/CallRecords';
import AudioUnlockOverlay from '@/components/common/AudioUnlockOverlay';
import { requestMediaPermission } from '@/utils/device';

const { Text } = Typography;

const TAB_PHONE = 'phone';
const TAB_RECORDS = 'records';

const Index: React.FC = () => {
  // ─── 登录进入后，立即自动发起麦克风授权检测与请求（一次性授权） ───────────
  useEffect(() => {
    requestMediaPermission().then((granted) => {
      if (granted) {
        console.log('[麦克风] 权限检查成功：已获授权');
      } else {
        console.warn('[麦克风] 权限检查警告：未获得麦克风授权，可能会影响通话');
      }
    }).catch((err) => {
      console.error('[麦克风] 自动申请授权异常:', err);
    });
  }, []);
  const permissions = useSelector(
    (s: RootState) => s.user.userInfo?.roleDetail?.permissions ?? []
  );
  const isAutoCall = useSelector((s: RootState) => s.app.isAutoCall);
  const wsStatus = useSelector((s: RootState) => s.app.wsStatus);
  const sipStatus = useSelector((s: RootState) => s.app.sipStatus);
  const connReady = useSelector((s: RootState) => s.app.connReady);

  const banner = useMemo(() => {
    if (!connReady) return null;
    
    if (wsStatus === 'reconnecting') {
      return {
        type: 'warning',
        text: '⚠️ 控制通道已断开，正在尝试重连，自动外呼和部分功能可能暂时受阻...',
        bg: 'linear-gradient(135deg, rgba(245, 158, 11, 0.75) 0%, rgba(217, 119, 6, 0.75) 100%)',
        border: '1px solid rgba(245, 158, 11, 0.25)',
      };
    }
    if (wsStatus === 'disconnected' || wsStatus === 'error') {
      return {
        type: 'error',
        text: '❌ 控制中枢 (WS) 连接已断开，自动外呼已暂停。请检查网络，或在拨号盘重试连接。',
        bg: 'linear-gradient(135deg, rgba(239, 68, 68, 0.75) 0%, rgba(220, 38, 38, 0.75) 100%)',
        border: '1px solid rgba(239, 68, 68, 0.25)',
      };
    }
    if (sipStatus === 'disconnected' || sipStatus === 'failed') {
      return {
        type: 'error',
        text: '❌ 电话服务通道 (SIP) 已断开，您当前无法拨打/接听电话。系统正在自动重连...',
        bg: 'linear-gradient(135deg, rgba(239, 68, 68, 0.75) 0%, rgba(220, 38, 38, 0.75) 100%)',
        border: '1px solid rgba(239, 68, 68, 0.25)',
      };
    }
    return null;
  }, [connReady, wsStatus, sipStatus]);

  const [activeTab, setActiveTab] = useState<string>(TAB_PHONE);
  const [inactivityModalVisible, setInactivityModalVisible] = useState(false);

  const recordsRef = useRef<CallRecordsHandle>(null);

  const canViewRecords = permissions.includes('dial-pad:record-view');

  // ─── ws:callPhone → auto-switch to phone tab ────────────────────────────
  useEffect(() => {
    EventsOn('ws:callPhone', () => {
      setActiveTab(TAB_PHONE);
    });

    // ─── Mouse inactivity modal ────────────────────────────────────────────
    EventsOn('mouse:inactive', () => {
      if (isAutoCall) {
        setInactivityModalVisible(true);
      }
    });

    EventsOn('mouse:active', () => {
      setInactivityModalVisible(false);
    });

    return () => {
      EventsOff('ws:callPhone');
      EventsOff('mouse:inactive');
      EventsOff('mouse:active');
    };
  }, [isAutoCall]);

  const handleDismissInactivity = useCallback(() => {
    setInactivityModalVisible(false);
  }, []);

  // ─── Build tab items ────────────────────────────────────────────────────
  const tabItems = [
    {
      key: TAB_PHONE,
      label: (
        <Space size={4}>
          <PhoneOutlined />
          <span>呼出</span>
        </Space>
      ),
      children: <PhoneCall />,
    },
    ...(canViewRecords
      ? [
          {
            key: TAB_RECORDS,
            label: (
              <Space size={4}>
                <UnorderedListOutlined />
                <span>拨打记录</span>
              </Space>
            ),
            children: <CallRecords ref={recordsRef} />,
          },
        ]
      : []),
  ];

  return (
    <div style={styles.card}>
      {/* Dedicated Top Draggable Titlebar Bar (Red Box area) */}
      <div 
        className="drag-region" 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: '150px', // Leave 150px on the right for the interactive merchant user dropdown and controls!
          height: '30px',
          zIndex: 10,
        }}
      />

      {/* Audio autoplay unlock banner — fixed at top, auto-dismisses */}
      <AudioUnlockOverlay />

      <Header />

      {banner && (
        <div 
          style={{
            margin: '0 16px 8px',
            padding: '8px 16px',
            borderRadius: '8px',
            background: banner.bg,
            border: banner.border,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            animation: 'banner-pulse 2.2s infinite ease-in-out',
            zIndex: 5,
          }}
        >
          <span style={{ color: '#ffffff', fontSize: '12px', fontWeight: 500, letterSpacing: '0.2px', textAlign: 'center' }}>
            {banner.text}
          </span>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'hidden', padding: '0 16px' }} className="no-drag">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => {
            setActiveTab(key);
            // Refresh records when switching to that tab
            if (key === TAB_RECORDS) {
              recordsRef.current?.refreshData();
            }
          }}
          items={tabItems}
          style={{ height: '100%' }}
          size="small"
        />
      </div>

      {/* Mouse inactivity warning modal */}
      <Modal
        open={inactivityModalVisible}
        title={
          <Space>
            <ExclamationCircleOutlined style={{ color: '#faad14' }} />
            <span>操作提醒</span>
          </Space>
        }
        centered
        closable={false}
        maskClosable={false}
        footer={null}
        width={360}
        className="no-drag"
      >
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <Text type="secondary">
            检测到您长时间未操作，自动拨号任务可能已暂停。
            <br />
            请移动鼠标或点击任意区域以恢复工作。
          </Text>
        </div>
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <a onClick={handleDismissInactivity} style={{ fontSize: 14 }}>
            我知道了
          </a>
        </div>
      </Modal>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  card: {
    position: 'relative',
    height: '100vh',
    width: '100vw',
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(24, 24, 27, 0.75)',
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.1)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    zIndex: 2,
    overflow: 'hidden',
    fontFamily: "'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
};

// Inject keyframes for warning banner pulse
const styleSheet = document.createElement('style');
styleSheet.textContent = `
@keyframes banner-pulse {
  0% { opacity: 0.95; transform: scale(1); }
  50% { opacity: 0.85; transform: scale(0.997); }
  100% { opacity: 0.95; transform: scale(1); }
}
`;
document.head.appendChild(styleSheet);

export default Index;
