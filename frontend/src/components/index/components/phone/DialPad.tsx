import React, { useState, useCallback, useRef } from 'react';
import { DIAL_BUTTONS } from './types';

interface DialPadProps {
  onCall: (number: string) => void;
  disabled?: boolean;
}

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
      {/* Phone number input area */}
      <div style={styles.inputWrapper} className="dial-input-wrapper">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          style={styles.input}
          value={phoneNumber}
          onChange={handleInputChange}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          placeholder="请输入电话号码"
          disabled={disabled}
          autoComplete="off"
        />
        {phoneNumber.length > 0 && (
          <button
            style={{
              ...styles.deleteBtn,
              left: `calc(50% + ${(phoneNumber.length * 16.5) / 2}px + 4px)`,
              ...(disabled ? { opacity: 0.3, cursor: 'not-allowed' } : {}),
            }}
            onClick={deleteLast}
            disabled={disabled}
            title="删除"
            className="delete-button-slide"
          >
            ⌫
          </button>
        )}
      </div>

      {/* Dial buttons grid */}
      <div style={styles.grid}>
        {DIAL_BUTTONS.map((btn) => {
          // Extra layout styling: letters beneath standard numbers (except special ones)
          const lettersMap: Record<string, string> = {
            '2': 'A B C', '3': 'D E F', '4': 'G H I', '5': 'J K L',
            '6': 'M N O', '7': 'P Q R S', '8': 'T U V', '9': 'W X Y Z',
            '0': '+',
          };
          const letters = lettersMap[btn.value] || '';

          return (
            <button
              key={btn.value}
              style={getButtonStyle(btn.value)}
              onClick={() => appendDigit(btn.value)}
              onMouseEnter={() => setHoveredBtn(btn.value)}
              onMouseLeave={() => setHoveredBtn(null)}
              onMouseDown={() => setActiveBtn(btn.value)}
              onMouseUp={() => setActiveBtn(null)}
              disabled={disabled}
              className="dialpad-grid-btn"
            >
              <div style={styles.btnNumber}>{btn.label}</div>
              {letters && <div style={styles.btnLetters}>{letters}</div>}
            </button>
          );
        })}
      </div>

      {/* Call button */}
      <button
        style={{
          ...styles.callBtn,
          ...(!phoneNumber || disabled ? styles.callBtnDisabled : {}),
        }}
        onClick={handleCall}
        disabled={!phoneNumber || disabled}
        className="dialpad-call-btn"
      >
        <span style={styles.callIcon}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 0 0-1.01.24l-2.2 2.2a15.045 15.045 0 0 1-6.59-6.59l2.2-2.2c.28-.28.36-.67.25-1.02A11.36 11.36 0 0 1 8.5 3.7c0-.55-.45-1-1-1H3.5c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.5c0-.55-.45-1-1-1z"/>
          </svg>
        </span>
        呼叫
      </button>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px 16px',
    userSelect: 'none',
    fontFamily: "'Outfit', 'Inter', sans-serif",
  },
  inputWrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    width: '100%',
    maxWidth: 260,
    borderBottom: '2px solid rgba(255, 255, 255, 0.15)',
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
    padding: '4px 0',
    position: 'relative',
  },
  input: {
    flex: 1,
    fontSize: 26,
    fontWeight: 700,
    textAlign: 'center' as const,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: '#ffffff',
    caretColor: '#6366f1',
    letterSpacing: 1.5,
    fontVariantNumeric: 'tabular-nums',
  },
  deleteBtn: {
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.5)',
    borderRadius: '50%',
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    flexShrink: 0,
    transition: 'all 0.15s',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '14px 20px',
    width: '100%',
    maxWidth: 270,
    marginBottom: 24,
  },
  button: {
    width: 58,
    height: 58,
    borderRadius: '50%',
    border: 'none',
    background: 'rgba(255, 255, 255, 0.05)',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
    transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.1)',
  },
  btnNumber: {
    fontSize: 22,
    fontWeight: 600,
    color: '#ffffff',
    lineHeight: 1.1,
  },
  btnLetters: {
    fontSize: 8,
    color: 'rgba(255, 255, 255, 0.4)',
    fontWeight: 500,
    marginTop: 1,
    letterSpacing: 0.5,
  },
  buttonHover: {
    background: 'rgba(255, 255, 255, 0.12)',
    transform: 'scale(1.06)',
  },
  buttonActive: {
    background: 'rgba(255, 255, 255, 0.2)',
    transform: 'scale(0.93)',
  },
  buttonDisabled: {
    opacity: 0.25,
    cursor: 'not-allowed',
    boxShadow: 'none',
  },
  callBtn: {
    width: '100%',
    maxWidth: 240,
    height: 48,
    borderRadius: 24,
    border: 'none',
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
  },
  callIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -4,
  },
  callBtnDisabled: {
    background: 'rgba(255, 255, 255, 0.08)',
    cursor: 'not-allowed',
    boxShadow: 'none',
    color: 'rgba(255, 255, 255, 0.25)',
  },
};

// Add dynamic head styles for high-fidelity UI states
const styleSheet = document.createElement('style');
styleSheet.textContent = `
.dial-input-wrapper:focus-within {
  border-color: #6366f1 !important;
  box-shadow: 0 1px 0 #6366f1 !important;
}
.dial-input-wrapper input::placeholder {
  color: rgba(255, 255, 255, 0.3) !important;
  font-size: 18px !important;
  font-weight: 500 !important;
  letter-spacing: 0px !important;
}
.delete-button-slide:hover {
  background: rgba(255, 255, 255, 0.08) !important;
  color: #f87171 !important;
}
.dialpad-grid-btn:hover .btnNumber {
  color: #a5b4fc !important;
}
.dialpad-call-btn:hover:not(:disabled) {
  transform: translateY(-1px) !important;
  box-shadow: 0 6px 18px rgba(16, 185, 129, 0.45) !important;
  opacity: 0.95;
}
.dialpad-call-btn:active:not(:disabled) {
  transform: translateY(0.5px) !important;
}
`;
document.head.appendChild(styleSheet);

export default DialPad;
