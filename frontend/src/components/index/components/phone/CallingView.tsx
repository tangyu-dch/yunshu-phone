import React, { useMemo } from 'react';

interface CallingViewProps {
  phoneNumber: string;
  duration: number;
  onHangup: () => void;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 24px',
    height: '100%',
  },
  phoneNumber: {
    fontSize: 32,
    fontWeight: 700,
    color: '#1a1a1a',
    letterSpacing: 2,
    marginBottom: 12,
  },
  statusText: {
    fontSize: 16,
    color: '#8c8c8c',
    marginBottom: 24,
  },
  duration: {
    fontSize: 22,
    fontWeight: 500,
    color: '#595959',
    fontVariantNumeric: 'tabular-nums',
    marginBottom: 48,
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

const CallingView: React.FC<CallingViewProps> = ({ phoneNumber, duration, onHangup }) => {
  const durationText = useMemo(() => formatDuration(duration), [duration]);

  return (
    <div style={styles.container}>
      <div style={styles.phoneNumber}>{phoneNumber}</div>
      <div style={styles.statusText}>呼叫中...</div>
      <div style={styles.duration}>{durationText}</div>

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
        {/* Phone icon (hangup) */}
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      </button>
      <div style={styles.hangupLabel}>挂断</div>
    </div>
  );
};

export default CallingView;
