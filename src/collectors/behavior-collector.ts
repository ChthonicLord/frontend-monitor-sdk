/* ================================================================
 *  BehaviorCollector —— 行为采集器
 *  覆盖：页面浏览 / 点击 / 滚动 / 输入
 * ================================================================ */

import {
  BehaviorEvent,
  EventType,
  FullMonitorConfig,
} from '../types';
import { generateId, timestamp, getPageUrl, throttle } from '../utils';

type BehaviorCallback = (event: BehaviorEvent) => void;

export class BehaviorCollector {
  private config: FullMonitorConfig;
  private callback: BehaviorCallback | null = null;

  // 记录已访问页面，避免重复 PV
  private pvSent = false;

  // 节流后的滚动处理器
  private throttledScroll: () => void;

  constructor(config: FullMonitorConfig) {
    this.config = config;
    this.throttledScroll = throttle(() => {
      this.emitBehavior('scroll');
    }, 1000);
  }

  // 停留时长计时
  private entryTime = 0;
  private dwellReported = false;

  private handleVisibility = (): void => {
    if (document.visibilityState === 'hidden') {
      this.reportDwell();
    } else if (document.visibilityState === 'visible') {
      // 重新进入页面，重置计时
      this.entryTime = Date.now();
      this.dwellReported = false;
    }
  };

  private handleBeforeUnload = (): void => {
    this.reportDwell();
  };

  private reportDwell(): void {
    if (this.dwellReported || this.entryTime === 0) return;
    this.dwellReported = true;
    const duration = Date.now() - this.entryTime;
    if (duration > 0) {
      this.emitBehavior('dwell', 'page', {
        duration,
        entryTime: this.entryTime,
        exitTime: Date.now(),
      });
    }
  }

  start(onEvent: BehaviorCallback): void {
    this.callback = onEvent;
    this.entryTime = Date.now();
    this.dwellReported = false;

    // PV 上报
    this.emitPageView();

    // 点击
    document.addEventListener('click', this.handleClick, true);

    // 滚动
    document.addEventListener('scroll', this.throttledScroll, true);

    // 输入（仅监听 change 事件，降低频率）
    document.addEventListener('change', this.handleInput, true);

    // SPA 路由变化 (hashchange / popstate)
    window.addEventListener('hashchange', this.handleRouteChange);
    window.addEventListener('popstate', this.handleRouteChange);

    // 停留时长：页面隐藏 / 关闭时上报
    document.addEventListener('visibilitychange', this.handleVisibility);
    window.addEventListener('beforeunload', this.handleBeforeUnload);
  }

  stop(): void {
    // 停止前上报停留时长
    this.reportDwell();

    document.removeEventListener('click', this.handleClick, true);
    document.removeEventListener('scroll', this.throttledScroll, true);
    document.removeEventListener('change', this.handleInput, true);
    window.removeEventListener('hashchange', this.handleRouteChange);
    window.removeEventListener('popstate', this.handleRouteChange);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    this.callback = null;
  }

  /** 主动埋点 PV */
  trackPageView(pageUrl?: string): void {
    this.pvSent = false;
    this.emitPageView(pageUrl);
  }

  private emitPageView(pageUrl?: string): void {
    if (this.pvSent) return;
    this.pvSent = true;
    this.emitBehavior('navigate', 'page', { url: pageUrl || getPageUrl() });
  }

  private handleClick = (e: MouseEvent): void => {
    const target = e.target as HTMLElement;
    if (!target) return;
    const tagName = target.tagName?.toLowerCase() || '';
    const selector = this.getElementPath(target);
    this.emitBehavior('click', tagName, {
      selector,
      text: (target.textContent || '').slice(0, 100),
      x: e.clientX,
      y: e.clientY,
    });
  };

  private handleInput = (e: Event): void => {
    const target = e.target as HTMLInputElement;
    if (!target || !target.name) return;
    // 不上报实际输入值，仅记录字段名
    this.emitBehavior('input', target.tagName.toLowerCase(), {
      name: target.name,
      type: target.type || 'text',
    });
  };

  private handleRouteChange = (): void => {
    // SPA 路由变化时重新上报 PV
    this.pvSent = false;
    this.emitPageView();
  };

  private emitBehavior(
    behaviorType: BehaviorEvent['behaviorType'],
    target?: string,
    data?: Record<string, unknown>,
  ): void {
    if (!this.callback) return;
    const event: BehaviorEvent = {
      eventId: generateId(),
      eventType: EventType.BEHAVIOR,
      timestamp: timestamp(),
      appId: this.config.appId,
      appVersion: this.config.appVersion,
      pageUrl: getPageUrl(),
      behaviorType,
      target,
      data,
    };
    this.callback(event);
  }

  /** 获取元素的 CSS 选择器路径 */
  private getElementPath(el: HTMLElement): string {
    const path: string[] = [];
    let current: HTMLElement | null = el;
    while (current && current !== document.body && path.length < 5) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector += `#${current.id}`;
        path.unshift(selector);
        break;
      }
      if (current.className && typeof current.className === 'string') {
        const cls = current.className.trim().split(/\s+/).slice(0, 2).join('.');
        if (cls) selector += `.${cls}`;
      }
      path.unshift(selector);
      current = current.parentElement;
    }
    return path.join(' > ');
  }
}
