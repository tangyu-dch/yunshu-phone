import React from 'react';

const AutoCallView: React.FC = () => {
  return (
    <div style={styles.container}>
      {/* High-fidelity radar scanning graphics */}
      <div style={styles.radarWrapper}>
        <div style={styles.radarRing1} />
        <div style={styles.radarRing2} />
        <div style={styles.radarCrosshairsV} />
        <div style={styles.radarCrosshairsH} />
        
        {/* Glowing sweep hand */}
        <div style={styles.radarSweep} />
        
        {/* Pulsing targets */}
        <div className="radar-target target-1" style={{ top: '24%', left: '38%' }} />
        <div className="radar-target target-2" style={{ top: '56%', left: '72%' }} />
        
        <div style={styles.radarCenter}>
          <i className="iconfont icon-huchu" style={styles.centerIcon} />
        </div>
      </div>

      <div style={styles.text}>自动外呼任务进行中</div>
      <div style={styles.subtext}>
        系统正在后台高速拨号中
        <br />
        连通后将自动转接耳麦，请保持关注
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '36px 24px',
    height: '100%',
    fontFamily: "'Outfit', 'Inter', sans-serif",
  },
  radarWrapper: {
    position: 'relative',
    width: 120,
    height: 120,
    borderRadius: '50%',
    border: '1px solid rgba(99, 102, 241, 0.15)',
    background: 'rgba(99, 102, 241, 0.02)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    overflow: 'hidden',
    boxShadow: '0 4px 20px rgba(99, 102, 241, 0.05)',
  },
  radarRing1: {
    position: 'absolute',
    width: '66%',
    height: '66%',
    borderRadius: '50%',
    border: '1px dashed rgba(99, 102, 241, 0.1)',
  },
  radarRing2: {
    position: 'absolute',
    width: '33%',
    height: '33%',
    borderRadius: '50%',
    border: '1px dashed rgba(99, 102, 241, 0.12)',
  },
  radarCrosshairsV: {
    position: 'absolute',
    width: 1,
    height: '100%',
    background: 'linear-gradient(to bottom, rgba(99,102,241,0) 0%, rgba(99,102,241,0.06) 50%, rgba(99,102,241,0) 100%)',
  },
  radarCrosshairsH: {
    position: 'absolute',
    width: '100%',
    height: 1,
    background: 'linear-gradient(to right, rgba(99,102,241,0) 0%, rgba(99,102,241,0.06) 50%, rgba(99,102,241,0) 100%)',
  },
  radarSweep: {
    position: 'absolute',
    width: '50%',
    height: '50%',
    background: 'linear-gradient(45deg, rgba(99, 102, 241, 0.35) 0%, rgba(99, 102, 241, 0) 65%)',
    top: 0,
    left: 0,
    transformOrigin: 'bottom right',
    animation: 'radar-sweep-keyframes 3.5s infinite linear',
    zIndex: 2,
  },
  radarCenter: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 15px rgba(99, 102, 241, 0.4)',
    zIndex: 5,
  },
  centerIcon: {
    color: '#ffffff',
    fontSize: 16,
  },
  text: {
    fontSize: 15,
    fontWeight: 700,
    color: '#ffffff',
    textAlign: 'center' as const,
    marginBottom: 8,
    letterSpacing: '0.5px',
  },
  subtext: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    lineHeight: 1.6,
    textAlign: 'center' as const,
  },
};

// Inject radar animations and target breathing effects into head
const styleSheet = document.createElement('style');
styleSheet.textContent = `
@keyframes radar-sweep-keyframes {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes target-pulse {
  0% { transform: scale(0.8); opacity: 0.2; box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
  50% { transform: scale(1.1); opacity: 1; box-shadow: 0 0 8px 2px rgba(16, 185, 129, 0.6); }
  100% { transform: scale(0.8); opacity: 0.2; box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
}
.radar-target {
  position: absolute;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #10b981;
  z-index: 3;
  opacity: 0.8;
}
.target-1 {
  animation: target-pulse 2s infinite ease-in-out;
  animation-delay: 0.5s;
}
.target-2 {
  animation: target-pulse 2.4s infinite ease-in-out;
  animation-delay: 1.5s;
}
`;
document.head.appendChild(styleSheet);

export default AutoCallView;
