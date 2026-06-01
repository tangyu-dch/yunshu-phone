import React, {
  forwardRef,
  useImperativeHandle,
  useCallback,
  useState,
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
} from 'antd';
import {
  PhoneOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  EnvironmentOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import InfiniteScroll from 'react-infinite-scroll-component';

import { hideNumber, formatTime } from '../../../utils/tools';

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
  startTime: string;      // ISO timestamp
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

  // Placeholder: the Go bindings for call records are not yet implemented.
  // This function will be replaced with an actual API call via Wails bridge.
  const fetchRecords = useCallback(async (pageNum: number) => {
    setLoading(true);
    try {
      // TODO: Replace with actual Go bridge call, e.g.:
      //   const result = await CallBridge.GetCallRecords(pageNum, PAGE_SIZE);
      //   setRecords((prev) => pageNum === 1 ? result.records : [...prev, ...result.records]);
      //   setStats(result.stats);
      //   setHasMore(result.records.length === PAGE_SIZE);
      void pageNum;
      void PAGE_SIZE;
      setRecords([]);
      setStats(DEFAULT_STATS);
      setHasMore(false);
    } catch (err) {
      console.error('[CallRecords] fetchRecords error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMore = useCallback(() => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchRecords(nextPage);
  }, [page, fetchRecords]);

  useImperativeHandle(ref, () => ({
    refreshData() {
      setPage(1);
      fetchRecords(1);
    },
  }));

  // ─── Stats section ────────────────────────────────────────────────────────
  const renderStats = () => (
    <div style={{ marginBottom: 16 }}>
      {/* Today's overview */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={16} align="middle">
          <Col span={8}>
            <Statistic
              title="今日拨打"
              value={stats.total}
              prefix={<PhoneOutlined />}
              valueStyle={{ fontSize: 20 }}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="已接通"
              value={stats.connected}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ fontSize: 20, color: '#52c41a' }}
            />
          </Col>
          <Col span={8}>
            <div style={{ marginBottom: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                接通率
              </Text>
            </div>
            <Progress
              percent={stats.answerRate}
              size="small"
              strokeColor={stats.answerRate >= 50 ? '#52c41a' : '#faad14'}
              format={(p) => `${p?.toFixed(1)}%`}
            />
          </Col>
        </Row>
      </Card>

      {/* 30-second call stats */}
      <Card size="small">
        <Row gutter={16}>
          <Col span={12}>
            <Space direction="vertical" size={2}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                今日30秒通话
              </Text>
              <Space size={8}>
                <Text strong style={{ fontSize: 18 }}>
                  {stats.shortCallToday}
                </Text>
                <Tag color={stats.shortCallTodayRate >= 30 ? 'green' : 'orange'}>
                  {stats.shortCallTodayRate.toFixed(1)}%
                </Tag>
              </Space>
            </Space>
          </Col>
          <Col span={12}>
            <Space direction="vertical" size={2}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                本月30秒通话
              </Text>
              <Space size={8}>
                <Text strong style={{ fontSize: 18 }}>
                  {stats.shortCallMonth}
                </Text>
                <Tag color={stats.shortCallMonthRate >= 30 ? 'green' : 'orange'}>
                  {stats.shortCallMonthRate.toFixed(1)}%
                </Tag>
              </Space>
            </Space>
          </Col>
        </Row>
      </Card>
    </div>
  );

  // ─── Single record item ───────────────────────────────────────────────────
  const renderRecord = (record: CallRecord) => (
    <Card
      key={record.id}
      size="small"
      style={{ marginBottom: 8, borderRadius: 6 }}
      bodyStyle={{ padding: '10px 14px' }}
    >
      <Row align="middle" justify="space-between">
        <Col>
          <Space direction="vertical" size={2}>
            <Text strong style={{ fontSize: 15, letterSpacing: 0.5 }}>
              {hideNumber(record.phone, 'MIDDLE')}
            </Text>
            <Space size={12}>
              {record.connected ? (
                <Space size={4}>
                  <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 12 }} />
                  <Text type="success" style={{ fontSize: 12 }}>
                    已接通 {formatTime(record.duration)}
                  </Text>
                </Space>
              ) : (
                <Space size={4}>
                  <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 12 }} />
                  <Text type="danger" style={{ fontSize: 12 }}>
                    未接通
                  </Text>
                </Space>
              )}
              {record.location && (
                <Space size={2}>
                  <EnvironmentOutlined style={{ fontSize: 12, color: '#8c8c8c' }} />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {record.location}
                  </Text>
                </Space>
              )}
            </Space>
          </Space>
        </Col>
        <Col>
          <Space size={4}>
            <ClockCircleOutlined style={{ fontSize: 12, color: '#8c8c8c' }} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.startTime}
            </Text>
          </Space>
        </Col>
      </Row>
    </Card>
  );

  // ─── Main render ──────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {renderStats()}

      <div
        id="call-records-scroll"
        style={{ flex: 1, overflow: 'auto' }}
      >
        {records.length === 0 && !loading ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Space direction="vertical" size={4}>
                <Text type="secondary">暂无拨打记录</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  功能即将上线
                </Text>
              </Space>
            }
            style={{ marginTop: 40 }}
          />
        ) : (
          <InfiniteScroll
            dataLength={records.length}
            next={fetchMore}
            hasMore={hasMore}
            loader={
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  加载中...
                </Text>
              </div>
            }
            endMessage={
              records.length > 0 ? (
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
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

CallRecords.displayName = 'CallRecords';

export default CallRecords;
