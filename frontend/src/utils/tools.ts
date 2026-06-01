/**
 * Frontend utility functions for the yunshu-phone app.
 */

// ─── Time formatting ─────────────────────────────────────────────────────────

/**
 * Convert a duration in seconds to MM:SS format.
 *
 * @example formatTime(0)    // "00:00"
 * @example formatTime(65)   // "01:05"
 * @example formatTime(3661) // "61:01"
 */
export function formatTime(seconds: number): string {
  const totalSec = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// ─── Phone number masking ────────────────────────────────────────────────────

type HideStyle = 'HIDDEN_ALL' | 'BEHIND' | 'MIDDLE' | 'NONE';

/**
 * Mask a phone number for display.
 *
 * - HIDDEN_ALL: replace all digits with `*`
 * - BEHIND:     show first 3 digits, mask the rest   (e.g. 138****5678 → 138********)
 * - MIDDLE:     mask middle 4 digits                (e.g. 138****5678)
 * - NONE:       return as-is
 */
export function hideNumber(str: string, style: HideStyle = 'MIDDLE'): string {
  if (!str) return '';

  switch (style) {
    case 'HIDDEN_ALL':
      return str.replace(/./g, '*');

    case 'BEHIND':
      if (str.length <= 3) return str;
      return str.slice(0, 3) + '*'.repeat(str.length - 3);

    case 'MIDDLE': {
      // For 11-digit mobile numbers: mask digits [3..6]  → 138****5678
      // For shorter numbers: mask the middle portion proportionally
      if (str.length < 7) return str;
      const prefix = str.slice(0, 3);
      const suffix = str.slice(-4);
      const masked = '*'.repeat(str.length - 7);
      return `${prefix}${masked}${suffix}`;
    }

    case 'NONE':
    default:
      return str;
  }
}

// ─── Telephone string cleaning ───────────────────────────────────────────────

/**
 * Strip all non-digit characters from a telephone string.
 * Keeps leading `+` for international format if present.
 *
 * @example replaceTel("+86-138 0000 0000") // "+8613800000000"
 * @example replaceTel("(021) 1234-5678")  // "02112345678"
 */
export function replaceTel(tel: string): string {
  if (!tel) return '';
  const hasPlus = tel.startsWith('+');
  const digits = tel.replace(/\D/g, '');
  return hasPlus ? `+${digits}` : digits;
}

// ─── Phone number validation ─────────────────────────────────────────────────

/**
 * Validate a Chinese mobile or landline phone number.
 *
 * - Mobile: 1[3-9]X XXXX XXXX (11 digits)
 * - Landline: 0XX-XXXXXXXX or 0XXX-XXXXXXX (with or without dash)
 */
export function validatePhoneNumber(phone: string): boolean {
  if (!phone) return false;
  const cleaned = replaceTel(phone);

  // Chinese mobile: 1[3-9] followed by 9 digits
  const mobileRegex = /^1[3-9]\d{9}$/;

  // Chinese landline: area code (3-4 digits starting with 0) + number (7-8 digits)
  const landlineRegex = /^0\d{2,3}\d{7,8}$/;

  return mobileRegex.test(cleaned) || landlineRegex.test(cleaned);
}

// ─── OS detection ────────────────────────────────────────────────────────────

/**
 * Detect the operating system from `navigator.userAgent`.
 * Returns one of: "Windows", "macOS", "Linux", "iOS", "Android", "Unknown".
 */
export function detectOS(): string {
  if (typeof navigator === 'undefined') return 'Unknown';
  const ua = navigator.userAgent;

  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Win/i.test(ua)) return 'Windows';
  if (/Mac/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';

  return 'Unknown';
}

// ─── SIP hangup cause codes ──────────────────────────────────────────────────

/**
 * Map of common SIP/Q.850 hangup cause codes to human-readable Chinese descriptions.
 */
export const reasonList: Record<number, string> = {
  16: '正常挂断',
  17: '用户忙',
  18: '无应答',
  19: '拒接',
  21: '呼叫被拒',
  27: '目的地不可达',
  28: '无效的号码格式',
  29: '设施被拒',
  31: '正常-未指定',
  34: '无电路/通道可用',
  38: '网络故障',
  41: '暂时不可用',
  42: '交换设备拥塞',
  44: '请求的通道不可用',
  47: '资源不可用',
  50: '设施未订阅',
  52: '呼出限制',
  54: '呼入限制',
  57: '承载能力未授权',
  58: '承载能力未实现',
  63: '服务或选项不可用',
  65: '承载能力未实现(远程)',
  69: '请求的设施未实现',
  79: '服务或选项未实现',
  81: '无效的呼叫参考值',
  88: '不兼容的目的地',
  95: '无效的-未指定',
  96: '强制清除信息元素',
  97: '消息类型不存在',
  99: '消息与呼叫状态不符',
  100: '信息元素不存在',
  101: '呼叫状态中消息不符',
  102: '恢复定时器超时',
  111: '协议错误',
  127: '互通-未指定',
};
