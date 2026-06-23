/* ================================================================
 *  ErrorCollector —— 错误采集器
 *  覆盖：JS Error / Promise UnhandledRejection / 资源加载 Error
 * ================================================================ */

import {
  ErrorEvent,
  EventType,
  BaseEvent,
  FullMonitorConfig,
} from '../types';
import { generateId, timestamp, getPageUrl } from '../utils';

type ErrorCallback = (event: ErrorEvent) => void;

export class ErrorCollector {
  private config: FullMonitorConfig;
  private callback: ErrorCallback | null = null;
  private boundHandlers: {
    onError: OnErrorEventHandler;
    onUnhandledRejection: (event: PromiseRejectionEvent) => void;
  };

  constructor(config: FullMonitorConfig) {
    this.config = config;
    this.boundHandlers = {
      onError: this.handleError.bind(this),
      onUnhandledRejection: this.handleRejection.bind(this),
    };
  }

  private origFetch!: typeof window.fetch;
  private origXHROpen!: typeof XMLHttpRequest.prototype.open;

  start(onEvent: ErrorCallback): void {
    this.callback = onEvent;
    window.addEventListener('error', this.boundHandlers.onError, true);
    window.addEventListener(
      'unhandledrejection',
      this.boundHandlers.onUnhandledRejection,
    );

    // 拦截 fetch / XHR 接口错误
    this.interceptFetch();
    this.interceptXHR();
  }

  stop(): void {
    window.removeEventListener('error', this.boundHandlers.onError, true);
    window.removeEventListener(
      'unhandledrejection',
      this.boundHandlers.onUnhandledRejection,
    );

    // 恢复原始 fetch / XHR
    if (this.origFetch) window.fetch = this.origFetch;
    if (this.origXHROpen) XMLHttpRequest.prototype.open = this.origXHROpen;

    this.callback = null;
  }

  private interceptFetch(): void {
    if (typeof window === 'undefined' || !window.fetch) return;
    this.origFetch = window.fetch;
    const self = this;
    window.fetch = function (...args: Parameters<typeof fetch>) {
      return self.origFetch!.apply(this, args).then((res) => {
        if (!res.ok && self.callback) {
          const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
          self.callback({
            ...self.buildBase(),
            message: `API ${res.status}: ${url}`,
            stack: '',
            errorType: 'ApiError',
            filename: url,
            lineno: undefined,
            colno: undefined,
          });
        }
        return res;
      });
    };
  }

  private interceptXHR(): void {
    if (typeof XMLHttpRequest === 'undefined') return;
    this.origXHROpen = XMLHttpRequest.prototype.open;
    const self = this;
    XMLHttpRequest.prototype.open = function (
      method: string,
      url: string | URL,
    ) {
      const xhr = this as XMLHttpRequest;
      xhr.addEventListener('loadend', () => {
        if (xhr.status >= 400 && self.callback) {
          self.callback({
            ...self.buildBase(),
            message: `XHR ${xhr.status}: ${method} ${url}`,
            stack: '',
            errorType: 'ApiError',
            filename: typeof url === 'string' ? url : url.toString(),
            lineno: undefined,
            colno: undefined,
          });
        }
      });
      return self.origXHROpen.apply(this, arguments as any);
    };
  }

  private buildBase(): Omit<ErrorEvent, keyof BaseEvent> & BaseEvent {
    return {
      eventId: generateId(),
      eventType: EventType.ERROR,
      timestamp: timestamp(),
      appId: this.config.appId,
      appVersion: this.config.appVersion,
      pageUrl: getPageUrl(),
    };
  }

  private handleError(event: ErrorEvent | Event): void {
    if (!this.callback) return;

    // 资源加载错误
    const target = (event as ErrorEvent).target as HTMLElement | undefined;
    if (target && (target.tagName === 'IMG' || target.tagName === 'SCRIPT' || target.tagName === 'LINK')) {
      // 资源错误由 ResourceCollector 处理，这里跳过
      return;
    }

    const e = event as ErrorEvent;
    const errorEvent: ErrorEvent = {
      ...this.buildBase(),
      message: e.message || 'Unknown error',
      stack: e.error?.stack || e.stack || '',
      errorType: e.error?.name || 'Error',
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
    };

    this.callback(errorEvent);
  }

  private handleRejection(event: PromiseRejectionEvent): void {
    if (!this.callback) return;

    const reason = event.reason;
    const message =
      reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : '';

    const errorEvent: ErrorEvent = {
      ...this.buildBase(),
      message: `[Promise] ${message}`,
      stack,
      errorType: 'PromiseError',
    };

    this.callback(errorEvent);
  }
}
