import React, { useEffect, useRef, useState, useCallback } from 'react';
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

const { Text } = Typography;

const TAB_PHONE = 'phone';
const TAB_RECORDS = 'records';

const Index: React.FC = () => {
  const permissions = useSelector(
    (s: RootState) => s.user.userInfo?.roleDetail?.permissions ?? []
  );
  const isAutoCall = useSelector((s: RootState) => s.app.isAutoCall);

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
          height: '42px',
          zIndex: 10,
        }}
      />

      {/* Audio autoplay unlock banner — fixed at top, auto-dismisses */}
      <AudioUnlockOverlay />

      <Header />

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

export default Index;
