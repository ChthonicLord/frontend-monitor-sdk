/* ================================================================
 *  Transport 传输层 —— sendBeacon / XHR / Image 三种上报方式
 * ================================================================ */

import { TransportType, ReportPayload } from '../types';
import { safeStringify } from '../utils';

export interface TransportResult {
  success: boolean;
  method: TransportType;
}

/** navigator.sendBeacon */
function sendByBeacon(url: string, payload: ReportPayload): boolean {
  if (!navigator.sendBeacon) return false;
  const blob = new Blob([safeStringify(payload)], { type: 'application/json' });
  return navigator.sendBeacon(url, blob);
}

/** XMLHttpRequest */
function sendByXHR(
  url: string,
  payload: ReportPayload,
  timeout = 5000,
): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = timeout;
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.ontimeout = () => resolve(false);
    xhr.send(safeStringify(payload));
  });
}

/** Image 打点（仅支持少量数据，用于降级） */
function sendByImage(url: string, payload: ReportPayload): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const query = `data=${encodeURIComponent(safeStringify(payload))}`;
    const sep = url.includes('?') ? '&' : '?';
    img.src = `${url}${sep}${query}`;
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    // 超时兜底
    setTimeout(() => resolve(false), 3000);
  });
}

/**
 * 按优先级尝试传输：sendBeacon → XHR → Image
 */
export async function transport(
  url: string,
  payload: ReportPayload,
  preference: TransportType[] = [
    TransportType.BEACON,
    TransportType.XHR,
    TransportType.IMAGE,
  ],
): Promise<TransportResult> {
  for (const method of preference) {
    switch (method) {
      case TransportType.BEACON: {
        const ok = sendByBeacon(url, payload);
        if (ok) return { success: true, method };
        break;
      }
      case TransportType.XHR: {
        const ok = await sendByXHR(url, payload);
        if (ok) return { success: true, method };
        break;
      }
      case TransportType.IMAGE: {
        const ok = await sendByImage(url, payload);
        if (ok) return { success: true, method };
        break;
      }
    }
  }
  return { success: false, method: preference[preference.length - 1] };
}
