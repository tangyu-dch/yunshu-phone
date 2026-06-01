import React, { useCallback } from 'react';
import { Button } from 'antd';
import { LoadingOutlined, CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';

interface StepInfo {
  name: string;
  status: string; // 'pending' | 'loading' | 'success' | 'failed'
  error?: string;
}

interface RegistrationStatusProps {
  steps: StepInfo[];
  onRetry: () => void;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '32px 24px',
  },
  title: {
    fontSize: 15,
    fontWeight: 600,
    color: '#262626',
    marginBottom: 28,
  },
  stepsContainer: {
    width: '100%',
    maxWidth: 320,
  },
  stepRow: {
    display: 'flex',
    alignItems: 'flex-start',
    marginBottom: 4,
    position: 'relative' as const,
  },
  stepIndicator: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    fontSize: 16,
    marginRight: 12,
  },
  stepContent: {
    flex: 1,
    paddingBottom: 24,
  },
  stepName: {
    fontSize: 14,
    fontWeight: 500,
    lineHeight: '32px',
  },
  stepError: {
    fontSize: 12,
    color: '#ff4d4f',
    marginTop: 4,
    lineHeight: 1.4,
  },
  connector: {
    position: 'absolute' as const,
    left: 15,
    top: 32,
    width: 2,
    height: 24,
    background: '#e8e8e8',
  },
  retryWrapper: {
    marginTop: 16,
    display: 'flex',
    justifyContent: 'center',
  },
};

/**
 * Get indicator styling and icon for each step status
 */
function getStepVisual(status: string): {
  bg: string;
  icon: React.ReactNode;
  nameColor: string;
} {
  switch (status) {
    case 'loading':
      return {
        bg: '#e6f4ff',
        icon: <LoadingOutlined style={{ color: '#1677ff', fontSize: 16 }} spin />,
        nameColor: '#1677ff',
      };
    case 'success':
      return {
        bg: '#f6ffed',
        icon: <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />,
        nameColor: '#262626',
      };
    case 'failed':
      return {
        bg: '#fff2f0',
        icon: <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />,
        nameColor: '#ff4d4f',
      };
    default:
      // pending
      return {
        bg: '#f5f5f5',
        icon: <ClockCircleOutlined style={{ color: '#bfbfbf', fontSize: 14 }} />,
        nameColor: '#bfbfbf',
      };
  }
}

const RegistrationStatus: React.FC<RegistrationStatusProps> = ({ steps, onRetry }) => {
  const hasFailed = steps.some((s) => s.status === 'failed');

  const handleRetry = useCallback(() => {
    onRetry();
  }, [onRetry]);

  return (
    <div style={styles.container}>
      <div style={styles.title}>连接状态</div>

      <div style={styles.stepsContainer}>
        {steps.map((step, index) => {
          const visual = getStepVisual(step.status);
          const isLast = index === steps.length - 1;

          return (
            <div key={index} style={styles.stepRow}>
              {/* Connector line (not on last item) */}
              {!isLast && (
                <div
                  style={{
                    ...styles.connector,
                    background:
                      step.status === 'success' ? '#b7eb8f' : '#e8e8e8',
                  }}
                />
              )}

              {/* Indicator circle */}
              <div
                style={{
                  ...styles.stepIndicator,
                  background: visual.bg,
                }}
              >
                {visual.icon}
              </div>

              {/* Text content */}
              <div style={styles.stepContent}>
                <div
                  style={{
                    ...styles.stepName,
                    color: visual.nameColor,
                  }}
                >
                  {step.name}
                </div>
                {step.error && <div style={styles.stepError}>{step.error}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Retry button on failure */}
      {hasFailed && (
        <div style={styles.retryWrapper}>
          <Button type="primary" danger onClick={handleRetry}>
            重新连接
          </Button>
        </div>
      )}
    </div>
  );
};

export default RegistrationStatus;
