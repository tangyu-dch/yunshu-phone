import React, { useMemo } from 'react';

interface CallingViewProps {
  phoneNumber: string;
  duration: number;
  onHangup: () => void;
}

/**
 * Format seconds to MM:SS
 */
function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const CallingView: React.FC<CallingViewProps> = ({ phoneNumber, duration, onHangup }) => {
  const durationText = useMemo(() => formatDuration(duration), [duration]);

  return (
    <div style={styles.container}>
      {/* Concentric soundwave ripple animation */}
      <div style={styles.rippleContainer}>
        <div className="ringing-ripple ring-1" />
        <div className="ringing-ripple ring-2" />
        <div className="ringing-ripple ring-3" />
        <div style={styles.avatarInner}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#818cf8' }}>
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        </div>
      </div>

      <div style={styles.phoneNumber}>{phoneNumber}</div>
      <div style={styles.statusText}>呼叫中...</div>
      <div style={styles.duration}>{durationText}</div>

      <div style={styles.actionWrapper}>
        <button
          style={styles.hangupBtn}
          onClick={onHangup}
          className="calling-hangup-btn"
          title="挂断"
        >
          {/* Phone icon (hangup) */}
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        </button>
        <div style={styles.hangupLabel}>挂断</div>
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
  rippleContainer: {
    position: 'relative',
    width: 140,
    height: 140,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  avatarInner: {
    width: 68,
    height: 68,
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(99, 102, 241, 0.25)',
    boxShadow: '0 4px 20px rgba(99, 102, 241, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  phoneNumber: {
    fontSize: 26,
    fontWeight: 700,
    color: '#ffffff',
    letterSpacing: '1px',
    marginBottom: 8,
  },
  statusText: {
    fontSize: 14,
    color: '#a5b4fc',
    fontWeight: 500,
    marginBottom: 12,
    letterSpacing: '0.5px',
  },
  duration: {
    fontSize: 20,
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.7)',
    fontVariantNumeric: 'tabular-nums',
    marginBottom: 44,
  },
  actionWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginTop: 'auto',
  },
  hangupBtn: {
    width: 58,
    height: 58,
    borderRadius: '50%',
    border: 'none',
    background: '#ef4444',
    color: '#ffffff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)',
    transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
  },
  hangupLabel: {
    marginTop: 8,
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.4)',
    fontWeight: 500,
    letterSpacing: '0.5px',
  },
};

// Inject soundwave ripple keyframe styles into document head
const styleSheet = document.createElement('style');
styleSheet.textContent = `
@keyframes ring-ripple-animation {
  0% {
    transform: scale(1.0);
    opacity: 0.65;
  }
  100% {
    transform: scale(2.2);
    opacity: 0.0;
  }
}
.ringing-ripple {
  position: absolute;
  width: 68px;
  height: 68px;
  border-radius: 50%;
  background: rgba(99, 102, 241, 0.15);
  animation: ring-ripple-animation 2.2s infinite cubic-bezier(0.165, 0.84, 0.44, 1.0);
  pointer-events: none;
  z-index: 1;
}
.ring-1 {
  animation-delay: 0s;
}
.ring-2 {
  animation-delay: 0.7s;
}
.ring-3 {
  animation-delay: 1.4s;
}
.calling-hangup-btn:hover {
  transform: scale(1.1) !important;
  background: #f87171 !important;
  box-shadow: 0 6px 20px rgba(239, 68, 68, 0.5) !important;
}
.calling-hangup-btn:active {
  transform: scale(0.95) !important;
}
`;
document.head.appendChild(styleSheet);

export default CallingView;
