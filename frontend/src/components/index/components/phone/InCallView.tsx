import React, { useState, useMemo, useCallback } from 'react';
import * as CallBridge from '../../../../../wailsjs/go/bridge/CallBridge';
import { DIAL_BUTTONS } from './types';

interface InCallViewProps {
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

const InCallView: React.FC<InCallViewProps> = ({ phoneNumber, duration, onHangup }) => {
  const [showDTMF, setShowDTMF] = useState(false);
  const [pressedBtn, setPressedBtn] = useState<string | null>(null);

  const durationText = useMemo(() => formatDuration(duration), [duration]);

  const sendDTMF = useCallback((digit: string) => {
    CallBridge.SendDTMF(digit).catch((err: unknown) => {
      console.error('[InCallView] SendDTMF error:', err);
    });
  }, []);

  const handleDTMFClick = useCallback(
    (value: string) => {
      setPressedBtn(value);
      sendDTMF(value);
      setTimeout(() => setPressedBtn(null), 150);
    },
    [sendDTMF]
  );

  return (
    <div style={styles.container}>
      <div style={styles.phoneNumber}>{phoneNumber}</div>
      
      {/* Sleek status capsule */}
      <div style={styles.statusBadge}>
        <span style={styles.statusDot} />
        <span>通话中</span>
      </div>

      <div style={styles.duration}>{durationText}</div>

      {/* DTMF Keyboard Toggle */}
      <button
        style={{
          ...styles.dtmfToggle,
          ...(showDTMF ? styles.dtmfToggleActive : {}),
        }}
        onClick={() => setShowDTMF((prev) => !prev)}
        className="incall-dtmf-toggle"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
          <rect x="3" y="3" width="7" height="9" />
          <rect x="14" y="3" width="7" height="5" />
          <rect x="14" y="12" width="7" height="9" />
          <rect x="3" y="16" width="7" height="5" />
        </svg>
        {showDTMF ? '收起键盘' : '拨号键盘'}
      </button>

      {/* DTMF Keyboard Card */}
      {showDTMF && (
        <div style={styles.dtmfGrid} className="incall-dtmf-grid-card">
          {DIAL_BUTTONS.map((btn) => (
            <button
              key={`dtmf-${btn.value}`}
              style={{
                ...styles.dtmfBtn,
                ...(pressedBtn === btn.value
                  ? { background: 'rgba(99, 102, 241, 0.15)', transform: 'scale(0.92)' }
                  : {}),
              }}
              onClick={() => handleDTMFClick(btn.value)}
              onMouseEnter={(e) => {
                if (pressedBtn !== btn.value) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255, 255, 255, 0.15)';
                  (e.currentTarget as HTMLButtonElement).style.color = '#a5b4fc';
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255, 255, 255, 0.06)';
                (e.currentTarget as HTMLButtonElement).style.color = '#ffffff';
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>
      )}

      {/* Hangup */}
      <div style={styles.actionWrapper}>
        <button
          style={styles.hangupBtn}
          onClick={onHangup}
          className="incall-hangup-btn"
          title="挂断"
        >
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
    padding: '32px 24px 20px',
    height: '100%',
    fontFamily: "'Outfit', 'Inter', sans-serif",
  },
  phoneNumber: {
    fontSize: 26,
    fontWeight: 700,
    color: '#ffffff',
    letterSpacing: '1px',
    marginBottom: 8,
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    background: 'rgba(16, 185, 129, 0.15)',
    color: '#10b981',
    fontSize: 11,
    fontWeight: 600,
    padding: '3px 10px',
    borderRadius: 12,
    marginBottom: 16,
    letterSpacing: '0.2px',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#10b981',
    display: 'inline-block',
    marginRight: 6,
    animation: 'breathing-status 1.6s infinite ease-in-out',
  },
  duration: {
    fontSize: 28,
    fontWeight: 700,
    color: 'rgba(255, 255, 255, 0.85)',
    fontVariantNumeric: 'tabular-nums',
    marginBottom: 20,
    letterSpacing: '-0.5px',
  },
  dtmfToggle: {
    padding: '6px 14px',
    borderRadius: 16,
    border: '1px solid rgba(255, 255, 255, 0.15)',
    background: 'rgba(255, 255, 255, 0.05)',
    color: '#e4e4e7',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    marginBottom: 18,
    display: 'flex',
    alignItems: 'center',
    boxShadow: '0 2px 5px rgba(0,0,0,0.02)',
    transition: 'all 0.15s ease',
    outline: 'none',
  },
  dtmfToggleActive: {
    background: 'rgba(99, 102, 241, 0.2)',
    borderColor: '#818cf8',
    color: '#a5b4fc',
  },
  dtmfGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px 14px',
    width: '100%',
    maxWidth: 220,
    marginBottom: 18,
    padding: '12px 14px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 14,
    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
  },
  dtmfBtn: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    border: 'none',
    background: 'rgba(255, 255, 255, 0.06)',
    fontSize: 18,
    fontWeight: 600,
    color: '#ffffff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto',
    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
    transition: 'all 0.15s ease',
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
    fontSize: 28,
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

// Inject custom CSS styling for active / hover animations in head
const styleSheet = document.createElement('style');
styleSheet.textContent = `
@keyframes breathing-status {
  0% { opacity: 0.6; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.1); }
  100% { opacity: 0.6; transform: scale(0.9); }
}
.incall-dtmf-toggle:hover {
  border-color: #818cf8 !important;
  color: #4f46e5 !important;
}
.incall-hangup-btn:hover {
  transform: scale(1.1) !important;
  background: #f87171 !important;
  box-shadow: 0 6px 20px rgba(239, 68, 68, 0.5) !important;
}
.incall-hangup-btn:active {
  transform: scale(0.95) !important;
}
@keyframes slide-down-fade {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
.incall-dtmf-grid-card {
  animation: slide-down-fade 0.2s ease-out;
}
`;
document.head.appendChild(styleSheet);

export default InCallView;
