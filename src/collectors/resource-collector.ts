/* ================================================================
 *  ResourceCollector —— 资源采集器
 *  覆盖：script / style / image / font 加载状态 & 耗时
 * ================================================================ */

import {
  ResourceEvent,
  EventType,
  FullMonitorConfig,
} from '../types';
import { generateId, timestamp, getPageUrl } from '../utils';

type ResourceCallback = (event: ResourceEvent) => void;

export class ResourceCollector {
  private config: FullMonitorConfig;
  private callback: ResourceCallback | null = null;
  private reportedUrls: Set<string> = new Set();

  constructor(config: FullMonitorConfig) {
    this.config = config;
  }

  start(onEvent: ResourceCallback): void {
    this.callback = onEvent;

    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        for (const entry of entries) {
          this.handleResourceEntry(entry as PerformanceResourceTiming);
        }
      });
      observer.observe({ type: 'resource', buffered: true });
    } catch {
      // 降级：监听全局 error 事件中的资源加载错误
      this.listenResourceError();
    }
  }

  stop(): void {
    this.callback = null;
  }

  private handleResourceEntry(entry: PerformanceResourceTiming): void {
    if (!this.callback) return;

    const url = entry.name;
    // 过滤上报地址自身
    if (url.includes(this.config.reportUrl)) return;
    // 去重
    if (this.reportedUrls.has(url)) return;
    this.reportedUrls.add(url);

    const resourceType = this.getResourceType(entry.initiatorType);
    const success = entry.transferSize > 0 || entry.decodedBodySize > 0;
    const duration = entry.responseEnd - entry.startTime;

    const event: ResourceEvent = {
      eventId: generateId(),
      eventType: EventType.RESOURCE,
      timestamp: timestamp(),
      appId: this.config.appId,
      appVersion: this.config.appVersion,
      pageUrl: getPageUrl(),
      resourceUrl: url,
      resourceType,
      success,
      duration: Math.round(duration * 100) / 100,
      size: entry.transferSize || entry.decodedBodySize || 0,
      statusCode: undefined, // PerformanceResourceTiming 不直接暴露 statusCode
    };

    this.callback(event);
  }

  private listenResourceError(): void {
    window.addEventListener(
      'error',
      (e: ErrorEvent) => {
        const target = (e.target as HTMLElement | undefined);
        if (
          target &&
          (target.tagName === 'IMG' ||
            target.tagName === 'SCRIPT' ||
            target.tagName === 'LINK')
        ) {
          const src =
            (target as HTMLImageElement).src ||
            (target as HTMLScriptElement).src ||
            (target as HTMLLinkElement).href ||
            '';
          if (!src || this.reportedUrls.has(src)) return;
          this.reportedUrls.add(src);

          const event: ResourceEvent = {
            eventId: generateId(),
            eventType: EventType.RESOURCE,
            timestamp: timestamp(),
            appId: this.config.appId,
            appVersion: this.config.appVersion,
            pageUrl: getPageUrl(),
            resourceUrl: src,
            resourceType: this.getResourceType(target.tagName.toLowerCase()),
            success: false,
            duration: 0,
          };
          this.callback?.(event);
        }
      },
      true,
    );
  }

  private getResourceType(
    initiatorType: string,
  ): ResourceEvent['resourceType'] {
    switch (initiatorType.toLowerCase()) {
      case 'script':
        return 'script';
      case 'link':
      case 'css':
        return 'style';
      case 'img':
        return 'image';
      case 'font':
        return 'font';
      case 'xmlhttprequest':
        return 'xhr';
      case 'fetch':
        return 'fetch';
      default:
        return 'script';
    }
  }
}
