/**
 * Call states for the phone system
 */
export type CallState = 'idle' | 'ringing' | 'in_progress';

/**
 * Dial button definition
 */
export interface DialButton {
  label: string;
  value: string;
}

/**
 * Standard 12-button dial pad layout
 */
export const DIAL_BUTTONS: DialButton[] = [
  { label: '1', value: '1' },
  { label: '2', value: '2' },
  { label: '3', value: '3' },
  { label: '4', value: '4' },
  { label: '5', value: '5' },
  { label: '6', value: '6' },
  { label: '7', value: '7' },
  { label: '8', value: '8' },
  { label: '9', value: '9' },
  { label: '*', value: '*' },
  { label: '0', value: '0' },
  { label: '#', value: '#' },
];
