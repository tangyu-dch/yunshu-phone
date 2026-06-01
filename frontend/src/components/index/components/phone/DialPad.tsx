import React, { useState, useCallback, useRef } from 'react';
import { DIAL_BUTTONS } from './types';

interface DialPadProps {
  onCall: (number: string) => void;
  disabled?: boolean;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '24px 16px',
    userSelect: 'none',
  },
  inputWrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    width: '100%',
    maxWidth: 280,
  },
  input: {
    flex: 1,
    fontSize: 28,
    fontWeight: 600,
    textAlign: 'center' as const,
    border: 'none',
    borderBottom: '2px solid #e0e0e0',
    outline: 'none',
    padding: '8px 4px',
    letterSpacing: 2,
    background: 'transparent',
    color: '#1a1a1a',
    caretColor: '#1677ff',
  },
  deleteBtn: {
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: 20,
    color: '#666',
    borderRadius: '50%',
    marginLeft: 8,
    flexShrink: 0,
    transition: 'background 0.15s',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 12,
    width: '100%',
    maxWidth: 280,
    marginBottom: 24,
  },
  button: {
    width: 64,
    height: 64,
    borderRadius: '50%',
    border: 'none',
    background: '#f5f5f5',
    fontSize: 24,
    fontWeight: 500,
    color: '#1a1a1a',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto',
    transition: 'all 0.15s ease',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  buttonHover: {
    background: '#e8e8e8',
    transform: 'scale(1.05)',
  },
  buttonActive: {
    background: '#d9d9d9',
    transform: 'scale(0.95)',
  },
  buttonDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  callBtn: {
    width: '100%',
    maxWidth: 280,
    height: 48,
    borderRadius: 24,
    border: 'none',
    background: '#1677ff',
    color: '#fff',
    fontSize: 18,
    fontWeight: 600,
    cursor: 'pointer',
    letterSpacing: 4,
    transition: 'all 0.2s ease',
    boxShadow: '0 2px 8px rgba(22,119,255,0.3)',
  },
  callBtnDisabled: {
    background: '#bfbfbf',
    cursor: 'not-allowed',
    boxShadow: 'none',
  },
};

const DialPad: React.FC<DialPadProps> = ({ onCall, disabled = false }) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);
  const [activeBtn, setActiveBtn] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Valid dial characters
  const isValidChar = useCallback((ch: string) => /^[0-9*#]$/.test(ch), []);

  const appendDigit = useCallback(
    (digit: string) => {
      if (disabled) return;
      setPhoneNumber((prev) => prev + digit);
    },
    [disabled]
  );

  const deleteLast = useCallback(() => {
    if (disabled) return;
    setPhoneNumber((prev) => prev.slice(0, -1));
  }, [disabled]);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData('text');
      // Extract only valid dial characters
      const digits = pasted
        .split('')
        .filter(isValidChar)
        .join('');
      if (digits) {
        setPhoneNumber((prev) => prev + digits);
      }
    },
    [isValidChar]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      // Only keep valid dial characters
      const filtered = val.split('').filter(isValidChar).join('');
      setPhoneNumber(filtered);
    },
    [isValidChar]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace') return; // allow default
      if (e.key === 'Enter') {
        e.preventDefault();
        if (phoneNumber && !disabled) onCall(phoneNumber);
        return;
      }
      // Block anything that isn't a valid dial char
      if (!isValidChar(e.key) && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
      }
    },
    [phoneNumber, disabled, onCall, isValidChar]
  );

  const handleCall = useCallback(() => {
    if (phoneNumber && !disabled) {
      onCall(phoneNumber);
    }
  }, [phoneNumber, disabled, onCall]);

  const getButtonStyle = (value: string): React.CSSProperties => {
    const base = { ...styles.button };
    if (disabled) return { ...base, ...styles.buttonDisabled };
    if (activeBtn === value) return { ...base, ...styles.buttonActive };
    if (hoveredBtn === value) return { ...base, ...styles.buttonHover };
    return base;
  };

  return (
    <div style={styles.container}>
      {/* Phone number input */}
      <div style={styles.inputWrapper}>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          style={styles.input}
          value={phoneNumber}
          onChange={handleInputChange}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          placeholder="请输入号码"
          disabled={disabled}
          autoComplete="off"
        />
        {phoneNumber.length > 0 && (
          <button
            style={{
              ...styles.deleteBtn,
              ...(disabled ? { opacity: 0.4, cursor: 'not-allowed' } : {}),
            }}
            onClick={deleteLast}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = '#f0f0f0';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
            disabled={disabled}
            title="删除"
          >
            ⌫
          </button>
        )}
      </div>

      {/* Dial buttons grid */}
      <div style={styles.grid}>
        {DIAL_BUTTONS.map((btn) => (
          <button
            key={btn.value}
            style={getButtonStyle(btn.value)}
            onClick={() => appendDigit(btn.value)}
            onMouseEnter={() => setHoveredBtn(btn.value)}
            onMouseLeave={() => setHoveredBtn(null)}
            onMouseDown={() => setActiveBtn(btn.value)}
            onMouseUp={() => setActiveBtn(null)}
            disabled={disabled}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Call button */}
      <button
        style={{
          ...styles.callBtn,
          ...(!phoneNumber || disabled ? styles.callBtnDisabled : {}),
        }}
        onClick={handleCall}
        disabled={!phoneNumber || disabled}
        onMouseEnter={(e) => {
          if (phoneNumber && !disabled) {
            (e.currentTarget as HTMLButtonElement).style.background = '#4096ff';
          }
        }}
        onMouseLeave={(e) => {
          if (phoneNumber && !disabled) {
            (e.currentTarget as HTMLButtonElement).style.background = '#1677ff';
          }
        }}
      >
        呼叫
      </button>
    </div>
  );
};

export default DialPad;
