/* ================================================================
 *  工具函数 —— UUID / 时间戳 / URL 解析 / 深拷贝
 * ================================================================ */

/** 生成唯一 ID */
export function generateId(): string {
  return 'monitor_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}

/** 获取当前高精度时间戳 */
export function now(): number {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();
}

/** 获取 Unix 毫秒时间戳 */
export function timestamp(): number {
  return Date.now();
}

/** 安全 JSON 序列化（处理循环引用） */
export function safeStringify(obj: unknown, fallback = '{}'): string {
  try {
    return JSON.stringify(obj, (_key, value) => {
      if (typeof value === 'function') return '[Function]';
      if (value instanceof Error) {
        return { message: value.message, stack: value.stack, name: value.name };
      }
      return value;
    });
  } catch {
    return fallback;
  }
}

/** 获取当前页面 URL 信息 */
export function getPageUrl(): string {
  try {
    return window.location.href;
  } catch {
    return '';
  }
}

/** 从 Navigation Timing API 获取导航类型 */
export function getNavigationType(): string {
  try {
    const nav = performance.getEntriesByType(
      'navigation',
    )[0] as PerformanceNavigationTiming;
    return nav?.type ?? 'navigate';
  } catch {
    return 'navigate';
  }
}

/** 函数节流 */
export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number,
): T {
  let lastTime = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return function (this: unknown, ...args: unknown[]) {
    const now = Date.now();
    if (now - lastTime >= delay) {
      lastTime = now;
      fn.apply(this, args);
    } else if (!timer) {
      timer = setTimeout(() => {
        lastTime = Date.now();
        timer = null;
        fn.apply(this, args);
      }, delay - (now - lastTime));
    }
  } as unknown as T;
}

/** 简单深拷贝 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(deepClone) as unknown as T;
  const cloned = {} as T;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

/** 生成简短 UUID */
export function uuid4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** 获取或创建访客 ID（localStorage 持久化） */
const VISITOR_KEY = '_monitor_vid';
export function getVisitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = uuid4();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    // localStorage 不可用时降级为 session 级别 ID
    return uuid4();
  }
}

/** requestIdleCallback 降级封装 */
export function idle(cb: () => void, timeout = 3000): void {
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(() => cb(), { timeout });
  } else {
    setTimeout(cb, 1);
  }
}

/** 从 userAgent 解析设备基本信息 */
export function parseDeviceInfo(): Record<string, string> {
  const ua = navigator.userAgent;
  const info: Record<string, string> = {};
  if (/Mobile|Android|iPhone|iPad/i.test(ua)) {
    info.deviceType = 'mobile';
  } else {
    info.deviceType = 'desktop';
  }
  if (/Chrome/i.test(ua)) info.browser = 'Chrome';
  else if (/Safari/i.test(ua)) info.browser = 'Safari';
  else if (/Firefox/i.test(ua)) info.browser = 'Firefox';
  else if (/Edge/i.test(ua)) info.browser = 'Edge';
  else info.browser = 'Unknown';

  if (/Windows/i.test(ua)) info.os = 'Windows';
  else if (/Mac/i.test(ua)) info.os = 'macOS';
  else if (/Linux/i.test(ua)) info.os = 'Linux';
  else if (/Android/i.test(ua)) info.os = 'Android';
  else if (/iPhone|iPad/i.test(ua)) info.os = 'iOS';
  else info.os = 'Unknown';

  return info;
}
