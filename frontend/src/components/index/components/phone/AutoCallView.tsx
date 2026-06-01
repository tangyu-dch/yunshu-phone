import React from 'react';

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 24px',
    height: '100%',
  },
  indicator: {
    width: 16,
    height: 16,
    borderRadius: '50%',
    background: '#1677ff',
    marginBottom: 24,
    animation: 'autocall-pulse 1.5s ease-in-out infinite',
  },
  text: {
    fontSize: 16,
    fontWeight: 500,
    color: '#262626',
    textAlign: 'center' as const,
    lineHeight: 1.6,
  },
  subtext: {
    fontSize: 13,
    color: '#8c8c8c',
    marginTop: 12,
    textAlign: 'center' as const,
  },
};

// Inject the pulse keyframe animation
const styleSheet = document.createElement('style');
styleSheet.textContent = `
@keyframes autocall-pulse {
  0% {
    opacity: 1;
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(22,119,255,0.5);
  }
  50% {
    opacity: 0.6;
    transform: scale(1.3);
    box-shadow: 0 0 0 12px rgba(22,119,255,0);
  }
  100% {
    opacity: 1;
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(22,119,255,0);
  }
}
`;
document.head.appendChild(styleSheet);

const AutoCallView: React.FC = () => {
  return (
    <div style={styles.container}>
      <div style={styles.indicator} />
      <div style={styles.text}>批量外呼任务进行中，请注意接听！</div>
      <div style={styles.subtext}>系统正在自动拨号，无需操作</div>
    </div>
  );
};

export default AutoCallView;
