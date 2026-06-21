/* ================================================================
 *  PerformanceCollector —— 性能采集器
 *  覆盖：Navigation Timing / Web Vitals (LCP / FID / CLS / FCP)
 * ================================================================ */

import {
  PerformanceEvent,
  PerformanceMetrics,
  EventType,
  FullMonitorConfig,
} from '../types';
import { generateId, timestamp, getPageUrl } from '../utils';

type PerformanceCallback = (event: PerformanceEvent) => void;

export class PerformanceCollector {
  private config: FullMonitorConfig;
  private callback: PerformanceCallback | null = null;
  private metrics: Partial<PerformanceMetrics> = {};
  private observerCleanups: (() => void)[] = [];

  constructor(config: FullMonitorConfig) {
    this.config = config;
  }

  start(onEvent: PerformanceCallback): void {
    this.callback = onEvent;

    // 1. 采集 Navigation Timing
    this.collectNavigationTiming();

    // 2. 采集 Web Vitals
    this.observeLCP();
    this.observeFID();
    this.observeCLS();
    this.observeFCP();

    // 页面加载完成后统一上报
    if (document.readyState === 'complete') {
      this.reportIfReady();
    } else {
      window.addEventListener('load', () => {
        // 延迟确保 LCP 等指标已采集
        setTimeout(() => this.reportIfReady(), 2000);
      });
    }
  }

  stop(): void {
    this.observerCleanups.forEach((fn) => fn());
    this.observerCleanups = [];
    this.callback = null;
  }

  private collectNavigationTiming(): void {
    // 使用 Navigation Timing API Level 2
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      for (const entry of entries) {
        const nav = entry as PerformanceNavigationTiming;
        this.metrics.dnsTime = nav.domainLookupEnd - nav.domainLookupStart;
        this.metrics.tcpTime = nav.connectEnd - nav.connectStart;
        this.metrics.ttfb = nav.responseStart - nav.requestStart;
        this.metrics.domParseTime =
          nav.domContentLoadedEventEnd - nav.responseEnd;
        this.metrics.domContentLoaded =
          nav.domContentLoadedEventEnd - nav.fetchStart;
        this.metrics.loadComplete = nav.loadEventEnd - nav.fetchStart;
        // FP: first-paint 近似值
        const fpEntry = performance.getEntriesByName(
          'first-paint',
        )[0] as PerformanceEntry | undefined;
        if (fpEntry) {
          this.metrics.firstPaint = fpEntry.startTime;
        }
      }
    });
    try {
      observer.observe({ type: 'navigation', buffered: true });
    } catch {
      // 降级：使用 performance.timing
      this.collectTimingFallback();
    }
  }

  private collectTimingFallback(): void {
    const t = performance.timing;
    if (!t || t.loadEventEnd === 0) {
      // 尚未加载完成，延迟采集
      window.addEventListener('load', () => {
        this.collectTimingFallback();
      });
      return;
    }
    this.metrics.dnsTime = t.domainLookupEnd - t.domainLookupStart;
    this.metrics.tcpTime = t.connectEnd - t.connectStart;
    this.metrics.ttfb = t.responseStart - t.requestStart;
    this.metrics.domParseTime = t.domContentLoadedEventEnd - t.responseEnd;
    this.metrics.domContentLoaded = t.domContentLoadedEventEnd - t.navigationStart;
    this.metrics.loadComplete = t.loadEventEnd - t.navigationStart;
  }

  private observeLCP(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1] as PerformanceEntry & {
          startTime: number;
        };
        if (last) {
          this.metrics.largestContentfulPaint = last.startTime;
        }
      });
      observer.observe({ type: 'largest-contentful-paint', buffered: true });
      this.observerCleanups.push(() => observer.disconnect());
    } catch { /* 浏览器不支持 */ }
  }

  private observeFID(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        for (const entry of entries) {
          const fidEntry = entry as PerformanceEventTiming;
          if (fidEntry.processingStart !== undefined) {
            this.metrics.firstInputDelay =
              fidEntry.processingStart - fidEntry.startTime;
          }
        }
      });
      observer.observe({ type: 'first-input', buffered: true });
      this.observerCleanups.push(() => observer.disconnect());
    } catch { /* 浏览器不支持 */ }
  }

  private observeCLS(): void {
    try {
      let clsValue = 0;
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const lsEntry = entry as LayoutShift;
          if (!lsEntry.hadRecentInput) {
            clsValue += lsEntry.value;
          }
        }
        this.metrics.cumulativeLayoutShift = clsValue;
      });
      observer.observe({ type: 'layout-shift', buffered: true });
      this.observerCleanups.push(() => observer.disconnect());
    } catch { /* 浏览器不支持 */ }
  }

  private observeFCP(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntriesByName('first-contentful-paint');
        if (entries.length > 0) {
          this.metrics.firstContentfulPaint = entries[0].startTime;
        }
      });
      observer.observe({ type: 'paint', buffered: true });
      this.observerCleanups.push(() => observer.disconnect());
    } catch { /* 浏览器不支持 */ }
  }

  private reportIfReady(): void {
    if (!this.callback) return;

    // 确保有基础指标
    if (this.metrics.loadComplete === undefined) {
      this.collectTimingFallback();
    }

    const perfEvent: PerformanceEvent = {
      eventId: generateId(),
      eventType: EventType.PERFORMANCE,
      timestamp: timestamp(),
      appId: this.config.appId,
      appVersion: this.config.appVersion,
      pageUrl: getPageUrl(),
      metrics: {
        dnsTime: this.metrics.dnsTime ?? 0,
        tcpTime: this.metrics.tcpTime ?? 0,
        ttfb: this.metrics.ttfb ?? 0,
        domParseTime: this.metrics.domParseTime ?? 0,
        domContentLoaded: this.metrics.domContentLoaded ?? 0,
        loadComplete: this.metrics.loadComplete ?? 0,
        firstPaint: this.metrics.firstPaint,
        firstContentfulPaint: this.metrics.firstContentfulPaint,
        largestContentfulPaint: this.metrics.largestContentfulPaint,
        firstInputDelay: this.metrics.firstInputDelay,
        cumulativeLayoutShift: this.metrics.cumulativeLayoutShift,
      },
    };

    this.callback(perfEvent);
  }
}

/** LayoutShift 类型（补充 DOM 类型定义） */
interface LayoutShift extends PerformanceEntry {
  value: number;
  hadRecentInput: boolean;
}
