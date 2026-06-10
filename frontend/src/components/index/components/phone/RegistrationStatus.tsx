import React, { useCallback } from 'react';
import { Button } from 'antd';
import { LoadingOutlined, CheckCircleFilled, CloseCircleFilled, ClockCircleOutlined } from '@ant-design/icons';

interface StepInfo {
  name: string;
  status: string; // 'pending' | 'loading' | 'success' | 'failed'
  error?: string;
}

interface RegistrationStatusProps {
  steps: StepInfo[];
  onRetry: () => void;
}

/**
 * Get indicator styling and icon for each step status
 */
function getStepVisual(status: string): {
  bg: string;
  icon: React.ReactNode;
  nameColor: string;
  className: string;
} {
  switch (status) {
    case 'loading':
      return {
        bg: 'rgba(99, 102, 241, 0.15)', // semi-transparent indigo
        icon: <LoadingOutlined style={{ color: '#818cf8', fontSize: 15 }} spin />,
        nameColor: '#818cf8',
        className: 'step-pulsing-loading',
      };
    case 'success':
      return {
        bg: 'rgba(16, 185, 129, 0.15)', // semi-transparent emerald green
        icon: <CheckCircleFilled style={{ color: '#10b981', fontSize: 15 }} />,
        nameColor: '#e2e8f0', // soft white-grey
        className: 'step-glowing-success',
      };
    case 'failed':
      return {
        bg: 'rgba(239, 68, 68, 0.15)', // semi-transparent rose red
        icon: <CloseCircleFilled style={{ color: '#ef4444', fontSize: 15 }} />,
        nameColor: '#ef4444',
        className: 'step-glowing-failed',
      };
    default:
      // pending
      return {
        bg: 'rgba(255, 255, 255, 0.04)', // translucent grey
        icon: <ClockCircleOutlined style={{ color: 'rgba(255, 255, 255, 0.35)', fontSize: 13 }} />,
        nameColor: 'rgba(255, 255, 255, 0.35)',
        className: '',
      };
  }
}

const RegistrationStatus: React.FC<RegistrationStatusProps> = ({ steps, onRetry }) => {
  const hasFailed = steps.some((s) => s.status === 'failed');
  const [countdown, setCountdown] = React.useState(5);

  const handleRetry = useCallback(() => {
    onRetry();
  }, [onRetry]);

  // Auto-reload countdown on connection failure
  React.useEffect(() => {
    if (!hasFailed) {
      setCountdown(5);
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          window.location.reload();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [hasFailed]);

  // Chinese translations for steps
  const nameTranslationMap: Record<string, string> = {
    'extension': '1. 获取分机配置信息',
    'sip': '2. 软电话 SIP 连通注册',
    'websocket': '3. 云端 WebSocket 控制就绪',
  };

  return (
    <div style={styles.container}>
      <div style={styles.title}>系统连通初始化</div>
      <div style={styles.subtitle}>正在与座席控制中枢建立安全连接</div>

      <div style={styles.stepsContainer}>
        {steps.map((step, index) => {
          const visual = getStepVisual(step.status);
          const isLast = index === steps.length - 1;
          const translatedName = nameTranslationMap[step.name] || step.name;

          return (
            <div key={index} style={styles.stepRow}>
              {/* Connector line (not on last item) */}
              {!isLast && (
                <div
                  style={{
                    ...styles.connector,
                    background:
                      step.status === 'success' ? '#10b981' : 'rgba(255, 255, 255, 0.08)',
                    boxShadow: step.status === 'success' ? '0 0 4px rgba(16,185,129,0.2)' : 'none',
                  }}
                />
              )}

              {/* Indicator circle */}
              <div
                style={{
                  ...styles.stepIndicator,
                  background: visual.bg,
                }}
                className={visual.className}
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
                  {translatedName}
                </div>
                {step.error && <div style={styles.stepError}>{step.error}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Retry button on failure */}
      {hasFailed && (
        <div style={{ ...styles.retryWrapper, flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          <Button
            type="primary"
            danger
            onClick={handleRetry}
            style={styles.retryBtn}
            className="reg-retry-btn"
          >
            重 试 连 接
          </Button>
          <div style={{ fontSize: 11, color: '#ef4444', textAlign: 'center', marginTop: 4, fontWeight: 500 }}>
            将在 {countdown} 秒后自动刷新页面重试...
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '48px 20px',
    fontFamily: "'Outfit', 'Inter', sans-serif",
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    color: '#ffffff',
    marginBottom: 4,
    letterSpacing: '0.5px',
  },
  subtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.45)',
    marginBottom: 36,
  },
  stepsContainer: {
    width: '100%',
    maxWidth: 280,
  },
  stepRow: {
    display: 'flex',
    alignItems: 'flex-start',
    marginBottom: 4,
    position: 'relative' as const,
  },
  stepIndicator: {
    width: 30,
    height: 30,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginRight: 14,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
    transition: 'all 0.25s ease',
  },
  stepContent: {
    flex: 1,
    paddingBottom: 28,
  },
  stepName: {
    fontSize: 13,
    fontWeight: 600,
    lineHeight: '30px',
    letterSpacing: '0.2px',
  },
  stepError: {
    fontSize: 11,
    color: '#ef4444',
    marginTop: 2,
    lineHeight: 1.4,
  },
  connector: {
    position: 'absolute' as const,
    left: 14,
    top: 30,
    width: 2,
    height: 28,
    background: 'rgba(255, 255, 255, 0.08)',
    transition: 'background 0.3s ease',
  },
  retryWrapper: {
    marginTop: 8,
    display: 'flex',
    justifyContent: 'center',
  },
  retryBtn: {
    height: 38,
    borderRadius: 10,
    fontWeight: 600,
    fontSize: 13,
    letterSpacing: 2,
    padding: '0 24px',
    boxShadow: '0 4px 12px rgba(239, 68, 68, 0.25)',
    transition: 'all 0.2s',
  },
};

// Inject step pulse keyframes and retry hover effects into head
const styleSheet = document.createElement('style');
styleSheet.textContent = `
@keyframes step-pulse {
  0% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.25); }
  70% { box-shadow: 0 0 0 8px rgba(79, 70, 229, 0); }
  100% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0); }
}
.step-pulsing-loading {
  animation: step-pulse 1.8s infinite ease-in-out;
}
.step-glowing-success {
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.3) !important;
}
.step-glowing-failed {
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.25) !important;
}
.reg-retry-btn:hover {
  transform: translateY(-1px) !important;
  box-shadow: 0 6px 16px rgba(239, 68, 68, 0.35) !important;
}
.reg-retry-btn:active {
  transform: translateY(0.5px) !important;
}
`;
document.head.appendChild(styleSheet);

export default RegistrationStatus;
