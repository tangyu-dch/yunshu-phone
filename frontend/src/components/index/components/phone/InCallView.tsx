import React, { useState, useMemo, useCallback } from 'react';
import * as CallBridge from '../../../../../wailsjs/go/bridge/CallBridge';
import { DIAL_BUTTONS } from './types';

interface InCallViewProps {
  phoneNumber: string;
  duration: number;
  onHangup: () => void;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '36px 24px 24px',
    height: '100%',
  },
  phoneNumber: {
    fontSize: 30,
    fontWeight: 700,
    color: '#1a1a1a',
    letterSpacing: 2,
    marginBottom: 8,
  },
  statusText: {
    fontSize: 16,
    color: '#52c41a',
    fontWeight: 500,
    marginBottom: 16,
  },
  duration: {
    fontSize: 22,
    fontWeight: 500,
    color: '#595959',
    fontVariantNumeric: 'tabular-nums',
    marginBottom: 24,
  },
  dtmfToggle: {
    padding: '8px 20px',
    borderRadius: 20,
    border: '1px solid #d9d9d9',
    background: '#fff',
    color: '#595959',
    fontSize: 14,
    cursor: 'pointer',
    marginBottom: 20,
    transition: 'all 0.2s',
  },
  dtmfGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 10,
    width: '100%',
    maxWidth: 240,
    marginBottom: 20,
  },
  dtmfBtn: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    border: 'none',
    background: '#f5f5f5',
    fontSize: 22,
    fontWeight: 500,
    color: '#1a1a1a',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto',
    transition: 'all 0.12s ease',
  },
  hangupBtn: {
    width: 64,
    height: 64,
    borderRadius: '50%',
    border: 'none',
    background: '#ff4d4f',
    color: '#fff',
    fontSize: 28,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(255,77,79,0.4)',
    transition: 'all 0.2s ease',
    marginTop: 'auto',
  },
  hangupLabel: {
    marginTop: 8,
    fontSize: 13,
    color: '#8c8c8c',
  },
};

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
      // Reset pressed state after brief delay for visual feedback
      setTimeout(() => setPressedBtn(null), 150);
    },
    [sendDTMF]
  );

  return (
    <div style={styles.container}>
      <div style={styles.phoneNumber}>{phoneNumber}</div>
      <div style={styles.statusText}>通话中</div>
      <div style={styles.duration}>{durationText}</div>

      {/* DTMF Keyboard Toggle */}
      <button
        style={{
          ...styles.dtmfToggle,
          ...(showDTMF ? { background: '#f0f5ff', borderColor: '#1677ff', color: '#1677ff' } : {}),
        }}
        onClick={() => setShowDTMF((prev) => !prev)}
        onMouseEnter={(e) => {
          if (!showDTMF) (e.currentTarget as HTMLButtonElement).style.borderColor = '#1677ff';
        }}
        onMouseLeave={(e) => {
          if (!showDTMF) (e.currentTarget as HTMLButtonElement).style.borderColor = '#d9d9d9';
        }}
      >
        {showDTMF ? '收起键盘' : '拨号键盘'}
      </button>

      {/* DTMF Keyboard */}
      {showDTMF && (
        <div style={styles.dtmfGrid}>
          {DIAL_BUTTONS.map((btn) => (
            <button
              key={`dtmf-${btn.value}`}
              style={{
                ...styles.dtmfBtn,
                ...(pressedBtn === btn.value
                  ? { background: '#d9d9d9', transform: 'scale(0.92)' }
                  : {}),
              }}
              onClick={() => handleDTMFClick(btn.value)}
              onMouseEnter={(e) => {
                if (pressedBtn !== btn.value) {
                  (e.currentTarget as HTMLButtonElement).style.background = '#e8e8e8';
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = '#f5f5f5';
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>
      )}

      {/* Hangup */}
      <button
        style={styles.hangupBtn}
        onClick={onHangup}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = '#ff7875';
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = '#ff4d4f';
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
        }}
        title="挂断"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      </button>
      <div style={styles.hangupLabel}>挂断</div>
    </div>
  );
};

export default InCallView;
