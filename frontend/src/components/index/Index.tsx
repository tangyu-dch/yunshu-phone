import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { Tabs, Modal, Typography, Space } from 'antd';
import {
  PhoneOutlined,
  UnorderedListOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { EventsOn, EventsOff } from '../../../wailsjs/runtime/runtime';
import { RootState } from '../../store';

import Header from '../header/Header';
import PhoneCall from './components/PhoneCall';
import CallRecords, { CallRecordsHandle } from './components/CallRecords';

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Header />

      <div style={{ flex: 1, overflow: 'hidden', padding: '0 16px' }}>
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

export default Index;
