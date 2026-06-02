import React, {
  forwardRef,
  useImperativeHandle,
  useCallback,
  useState,
  useEffect,
} from 'react';
import {
  Card,
  Empty,
  Progress,
  Row,
  Col,
  Statistic,
  Typography,
  Tag,
  Space,
  Button,
  App as AntdApp,
} from 'antd';
import {
  PhoneOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  EnvironmentOutlined,
  ClockCircleOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import InfiniteScroll from 'react-infinite-scroll-component';

import { hideNumber, formatTime } from '@/utils/tools';
import * as CallBridge from '@wailsjs/go/bridge/CallBridge';

const { Text } = Typography;

// ─── Public ref handle ──────────────────────────────────────────────────────
export interface CallRecordsHandle {
  refreshData: () => void;
}

// ─── Record shape ────────────────────────────────────────────────────────────
interface CallRecord {
  id: string;
  phone: string;
  connected: boolean;
  duration: number;       // seconds
  location: string;
  startTime: string;      // HH:MM format
}

interface TodayStats {
  total: number;
  connected: number;
  answerRate: number;     // 0–100
  shortCallToday: number; // 30-sec calls today
  shortCallTodayRate: number;
  shortCallMonth: number;
  shortCallMonthRate: number;
}

const DEFAULT_STATS: TodayStats = {
  total: 0,
  connected: 0,
  answerRate: 0,
  shortCallToday: 0,
  shortCallTodayRate: 0,
  shortCallMonth: 0,
  shortCallMonthRate: 0,
};

const PAGE_SIZE = 20;

// ─── Component ───────────────────────────────────────────────────────────────
const CallRecords = forwardRef<CallRecordsHandle>((_props, ref) => {
  const [records, setRecords] = useState<CallRecord[]>([]);
  const [stats, setStats] = useState<TodayStats>(DEFAULT_STATS);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const { message } = AntdApp.useApp();

  const fetchRecords = useCallback(async (pageNum: number) => {
    setLoading(true);
    try {
      // 1. Fetch paginated records from Go bridge
      const pageResult = await CallBridge.GetCallPage({ page: pageNum, limit: PAGE_SIZE });
      if (pageResult && pageResult.list) {
        const formattedList = pageResult.list.map((r: any) => ({
          id: String(r.id),
          phone: r.calledNumber || '',
          connected: r.status === 'ANSWERED' || r.status === 'CONNECTED' || r.status === '接通' || r.duration > 0,
          duration: r.duration || 0,
          location: r.location || '未知',
          startTime: r.createdAt ? r.createdAt.substring(11, 16) : '--:--',
        }));
        
        setRecords((prev) => (pageNum === 1 ? formattedList : [...prev, ...formattedList]));
        setHasMore(pageResult.hasMore || (pageResult.list.length === PAGE_SIZE));
      } else {
        if (pageNum === 1) setRecords([]);
        setHasMore(false);
      }

      // 2. Fetch call statistics from Go bridge
      const totalResult = await CallBridge.GetCallTotal();
      if (totalResult) {
        const rateToday = totalResult.todayTotal > 0
          ? (totalResult.todayConnected * 100) / totalResult.todayTotal
          : 0;
        setStats({
          total: totalResult.todayTotal || 0,
          connected: totalResult.todayConnected || 0,
          answerRate: rateToday,
          shortCallToday: totalResult.over30sToday || 0,
          shortCallTodayRate: totalResult.over30sRateToday * 100 || 0,
          shortCallMonth: totalResult.over30sMonth || 0,
          shortCallMonthRate: totalResult.over30sRateMonth * 100 || 0,
        });
      }
    } catch (err) {
      console.error('[CallRecords] fetchRecords error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords(1);
  }, [fetchRecords]);

  const fetchMore = useCallback(() => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchRecords(nextPage);
  }, [page, fetchRecords]);

  const handleCallback = useCallback((phone: string) => {
    if (!phone) return;
    CallBridge.MakeCall(phone, 'yunshu', {}).then(() => {
      message.success(`已发起回拨呼叫: ${hideNumber(phone)}`);
    }).catch((err: any) => {
      message.error(`发起回拨失败: ${err?.message || err}`);
    });
  }, []);

  useImperativeHandle(ref, () => ({
    refreshData() {
      setPage(1);
      fetchRecords(1);
    },
  }));

  // ─── Stats section ────────────────────────────────────────────────────────
  const renderStats = () => (
    <div style={{ marginBottom: 12 }}>
      {/* Today's overview */}
      <Card
        size="small"
        style={styles.statsCard}
        bodyStyle={{ padding: '12px 14px' }}
      >
        <Row gutter={12} align="middle">
          <Col span={8}>
            <Statistic
              title={<span style={styles.statsTitle}>今日拨打</span>}
              value={stats.total}
              prefix={<PhoneOutlined style={{ color: '#6366f1' }} />}
              valueStyle={styles.statsValuePrimary}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title={<span style={styles.statsTitle}>已接通</span>}
              value={stats.connected}
              prefix={<CheckCircleOutlined style={{ color: '#10b981' }} />}
              valueStyle={styles.statsValueSuccess}
            />
          </Col>
          <Col span={8} style={{ textAlign: 'center' }}>
            <div style={{ marginBottom: 2 }}>
              <Text type="secondary" style={styles.statsTitle}>
                接通率
              </Text>
            </div>
            <Progress
              type="circle"
              percent={parseFloat(stats.answerRate.toFixed(1))}
              width={38}
              strokeWidth={10}
              strokeColor={{
                '0%': '#10b981',
                '100%': '#3b82f6',
              }}
              format={(p) => <span style={{ fontSize: 10, fontWeight: 600, color: '#4b5563' }}>{p}%</span>}
            />
          </Col>
        </Row>
      </Card>

      {/* 30-second call stats */}
      <Card
        size="small"
        style={styles.subStatsCard}
        bodyStyle={{ padding: '10px 14px' }}
      >
        <Row gutter={12}>
          <Col span={12} style={{ borderRight: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <Space direction="vertical" size={1}>
              <Text type="secondary" style={styles.statsTitle}>
                今日30s+通话
              </Text>
              <Space size={6}>
                <Text strong style={{ fontSize: 16, color: '#ffffff' }}>
                  {stats.shortCallToday}
                </Text>
                <span style={{
                  ...styles.miniBadge,
                  background: stats.shortCallTodayRate >= 30 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                  color: stats.shortCallTodayRate >= 30 ? '#10b981' : '#f59e0b',
                }}>
                  {stats.shortCallTodayRate.toFixed(1)}%
                </span>
              </Space>
            </Space>
          </Col>
          <Col span={12} style={{ paddingLeft: 16 }}>
            <Space direction="vertical" size={1}>
              <Text type="secondary" style={styles.statsTitle}>
                本月30s+通话
              </Text>
              <Space size={6}>
                <Text strong style={{ fontSize: 16, color: '#ffffff' }}>
                  {stats.shortCallMonth}
                </Text>
                <span style={{
                  ...styles.miniBadge,
                  background: stats.shortCallMonthRate >= 30 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                  color: stats.shortCallMonthRate >= 30 ? '#10b981' : '#f59e0b',
                }}>
                  {stats.shortCallMonthRate.toFixed(1)}%
                </span>
              </Space>
            </Space>
          </Col>
        </Row>
      </Card>
    </div>
  );

  // ─── Single record item ───────────────────────────────────────────────────
  const renderRecord = (record: CallRecord) => (
    <div
      key={record.id}
      style={styles.recordItem}
      className="record-item-row"
    >
      <Row align="middle" justify="space-between" wrap={false}>
        <Col flex="1">
          <Space direction="vertical" size={1}>
            <Text strong style={styles.recordNumber}>
              {hideNumber(record.phone, 'MIDDLE')}
            </Text>
            <Space size={8} wrap>
              {record.connected ? (
                <span style={styles.statusBadgeConnected}>
                  <CheckCircleOutlined style={{ fontSize: 10, marginRight: 3 }} />
                  {formatTime(record.duration)}
                </span>
              ) : (
                <span style={styles.statusBadgeFailed}>
                  <CloseCircleOutlined style={{ fontSize: 10, marginRight: 3 }} />
                  未接通
                </span>
              )}
              {record.location && record.location !== '未知' && (
                <span style={styles.locationLabel}>
                  <EnvironmentOutlined style={{ fontSize: 10, marginRight: 2, color: 'rgba(255, 255, 255, 0.45)' }} />
                  {record.location}
                </span>
              )}
            </Space>
          </Space>
        </Col>
        <Col style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Space size={2} direction="vertical" align="end">
            <Space size={2} style={{ color: 'rgba(255, 255, 255, 0.45)', fontSize: 11 }}>
              <ClockCircleOutlined style={{ fontSize: 10 }} />
              <span>{record.startTime}</span>
            </Space>
          </Space>
          <Button
            type="primary"
            shape="circle"
            size="small"
            icon={<PlayCircleOutlined style={{ fontSize: 12 }} />}
            style={styles.callbackBtn}
            onClick={() => handleCallback(record.phone)}
            title="回拨呼叫"
          />
        </Col>
      </Row>
    </div>
  );

  // ─── Main render ──────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '4px 0' }}>
      {renderStats()}

      <div
        id="call-records-scroll"
        style={styles.scrollContainer}
      >
        {records.length === 0 && !loading ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Space direction="vertical" size={2}>
                <Text type="secondary" style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.45)' }}>暂无拨打记录</Text>
                <Text type="secondary" style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.3)' }}>
                  呼出电话后将在此处展示
                </Text>
              </Space>
            }
            style={{ marginTop: 32 }}
          />
        ) : (
          <InfiniteScroll
            dataLength={records.length}
            next={fetchMore}
            hasMore={hasMore}
            loader={
              <div style={{ textAlign: 'center', padding: '10px 0' }}>
                <Text type="secondary" style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.45)' }}>
                  正在加载更多...
                </Text>
              </div>
            }
            endMessage={
              records.length > 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 0 10px' }}>
                  <Text type="secondary" style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.45)' }}>
                    没有更多记录了
                  </Text>
                </div>
              ) : null
            }
            scrollableTarget="call-records-scroll"
          >
            {records.map(renderRecord)}
          </InfiniteScroll>
        )}
      </div>
    </div>
  );
});

const styles: Record<string, React.CSSProperties> = {
  statsCard: {
    borderRadius: 12,
    border: '1px solid rgba(255, 255, 255, 0.08)',
    boxShadow: '0 4px 18px rgba(0, 0, 0, 0.1)',
    background: 'rgba(255, 255, 255, 0.03)',
  },
  subStatsCard: {
    marginTop: 8,
    borderRadius: 10,
    border: '1px solid rgba(255, 255, 255, 0.06)',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)',
    background: 'rgba(255, 255, 255, 0.02)',
  },
  statsTitle: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.45)',
    fontWeight: 500,
  },
  statsValuePrimary: {
    fontSize: 20,
    fontWeight: 700,
    color: '#818cf8',
    letterSpacing: '-0.5px',
  },
  statsValueSuccess: {
    fontSize: 20,
    fontWeight: 700,
    color: '#34d399',
    letterSpacing: '-0.5px',
  },
  miniBadge: {
    fontSize: 10,
    fontWeight: 600,
    padding: '1px 6px',
    borderRadius: 10,
    display: 'inline-block',
  },
  scrollContainer: {
    flex: 1,
    overflowY: 'auto',
    paddingRight: 4,
    marginTop: 4,
  },
  recordItem: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: 10,
    padding: '10px 14px',
    marginBottom: 8,
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.05)',
    cursor: 'default',
  },
  recordNumber: {
    fontSize: 14,
    color: '#ffffff',
    letterSpacing: '0.5px',
    fontWeight: 600,
  },
  statusBadgeConnected: {
    fontSize: 10,
    color: '#34d399',
    background: 'rgba(52, 211, 153, 0.12)',
    padding: '2px 8px',
    borderRadius: 12,
    fontWeight: 500,
    display: 'inline-flex',
    alignItems: 'center',
  },
  statusBadgeFailed: {
    fontSize: 10,
    color: '#f87171',
    background: 'rgba(248, 113, 113, 0.12)',
    padding: '2px 8px',
    borderRadius: 12,
    fontWeight: 500,
    display: 'inline-flex',
    alignItems: 'center',
  },
  locationLabel: {
    fontSize: 10,
    color: '#e4e4e7',
    background: 'rgba(255, 255, 255, 0.06)',
    padding: '2px 8px',
    borderRadius: 12,
    display: 'inline-flex',
    alignItems: 'center',
  },
  callbackBtn: {
    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
    border: 'none',
    boxShadow: '0 2px 6px rgba(99, 102, 241, 0.3)',
    cursor: 'pointer',
    transition: 'transform 0.15s',
  },
};

// Add standard hover animations for record-item rows via head styles
const styleSheet = document.createElement('style');
styleSheet.textContent = `
.record-item-row:hover {
  border-color: rgba(99, 102, 241, 0.4) !important;
  background: rgba(255, 255, 255, 0.06) !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25) !important;
  transform: translateY(-1px);
}
.record-item-row .ant-btn:hover {
  transform: scale(1.1);
  box-shadow: 0 4px 10px rgba(99, 102, 241, 0.5) !important;
}
`;
document.head.appendChild(styleSheet);

CallRecords.displayName = 'CallRecords';

export default CallRecords;
