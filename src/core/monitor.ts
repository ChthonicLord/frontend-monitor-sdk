/* ================================================================
 *  Monitor 核心调度器 —— 协调各层的启动/停止和事件流转
 * ================================================================ */

import {
  MonitorConfig,
  FullMonitorConfig,
  MonitorEvent,
  UserInfo,
  CommonParams,
  TransportType,
  EventType,
  CustomEvent,
} from '../types';
import { ErrorCollector } from '../collectors/error-collector';
import { PerformanceCollector } from '../collectors/performance-collector';
import { BehaviorCollector } from '../collectors/behavior-collector';
import { ResourceCollector } from '../collectors/resource-collector';
import { ProcessorPipeline } from '../processors/pipeline';
import { Reporter } from '../reporters/batch-reporter';
import { generateId, timestamp, getPageUrl } from '../utils';

/** 默认配置 */
function defaultConfig(): FullMonitorConfig {
  return {
    appId: '',
    reportUrl: '',
    appVersion: '0.0.0',
    debug: false,
    sampleRate: 1,
    enablePerformance: true,
    enableBehavior: true,
    enableResource: true,
    maxDuplicateErrors: 5,
    batchMaxSize: 10,
    batchInterval: 5000,
    maxRetries: 3,
    transportPreference: [
      TransportType.BEACON,
      TransportType.XHR,
      TransportType.IMAGE,
    ],
    sensitiveFields: ['password', 'token', 'secret', 'phone', 'idCard'],
  };
}

export class Monitor {
  config: FullMonitorConfig;

  // 采集器
  private errorCollector: ErrorCollector;
  private performanceCollector: PerformanceCollector;
  private behaviorCollector: BehaviorCollector;
  private resourceCollector: ResourceCollector;

  // 处理管道
  private processor: ProcessorPipeline;

  // 上报器
  reporter: Reporter;

  // 用户 & 公共参数
  private userInfo: UserInfo = {};
  private commonParams: CommonParams = {};

  // 运行状态
  private started = false;

  constructor(config: MonitorConfig) {
    this.config = { ...defaultConfig(), ...config } as FullMonitorConfig;

    // 确保必填字段
    if (!this.config.appId) {
      throw new Error('[Monitor] appId is required');
    }
    if (!this.config.reportUrl) {
      throw new Error('[Monitor] reportUrl is required');
    }

    // 初始化各层
    this.errorCollector = new ErrorCollector(this.config);
    this.performanceCollector = new PerformanceCollector(this.config);
    this.behaviorCollector = new BehaviorCollector(this.config);
    this.resourceCollector = new ResourceCollector(this.config);
    this.processor = new ProcessorPipeline(this.config);
    this.reporter = new Reporter({
      reportUrl: this.config.reportUrl,
      appId: this.config.appId,
      batchMaxSize: this.config.batchMaxSize,
      batchInterval: this.config.batchInterval,
      maxRetries: this.config.maxRetries,
      transportPreference: this.config.transportPreference,
      onFlush: (payload) => {
        if (this.config.debug) {
          console.log('[Monitor] Flushing', payload.events.length, 'events');
        }
      },
    });
  }

  /** 启动所有采集器 */
  start(): void {
    if (this.started) return;
    this.started = true;

    const onEvent = (event: MonitorEvent) => this.handleEvent(event);

    // 错误采集（始终开启）
    this.errorCollector.start(onEvent);

    // 性能采集
    if (this.config.enablePerformance) {
      this.performanceCollector.start(onEvent);
    }

    // 行为采集
    if (this.config.enableBehavior) {
      this.behaviorCollector.start(onEvent);
    }

    // 资源采集
    if (this.config.enableResource) {
      this.resourceCollector.start(onEvent);
    }

    // 启动定时上报
    this.reporter.start();

    // 页面卸载时兜底上报
    window.addEventListener('beforeunload', () => {
      this.reporter.unloadFlush();
    });

    // 页面隐藏时（移动端）也进行上报
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.reporter.flush();
      }
    });

    if (this.config.debug) {
      console.log('[Monitor] Started with config:', this.config);
    }
  }

  /** 停止所有采集 */
  stop(): void {
    this.errorCollector.stop();
    this.performanceCollector.stop();
    this.behaviorCollector.stop();
    this.resourceCollector.stop();
    this.reporter.stop();
    this.started = false;
  }

  /** 内部事件处理入口 */
  private handleEvent(rawEvent: MonitorEvent): void {
    // 1. 注入用户信息和公共参数
    const enriched = this.enrichEvent(rawEvent);

    // 2. 执行 beforeReport 钩子
    let event = enriched;
    if (this.config.beforeReport) {
      const result = this.config.beforeReport(event);
      if (result === null) return; // 钩子返回 null 则丢弃
      event = result;
    }

    // 3. 处理管道（采样 / 脱敏 / 去重）
    const processed = this.processor.process(event);
    if (!processed) return;

    // 4. 调试模式打印
    if (this.config.debug) {
      console.log('[Monitor] Event collected:', processed.eventType, processed);
    }

    // 5. 加入上报队列
    this.reporter.add(processed);
  }

  /** 注入用户信息和公共参数 */
  private enrichEvent(event: MonitorEvent): MonitorEvent {
    return {
      ...event,
      userInfo: { ...this.userInfo },
      commonParams: { ...this.commonParams },
    };
  }

  /** 设置用户信息 */
  setUser(user: UserInfo): void {
    this.userInfo = { ...this.userInfo, ...user };
  }

  /** 设置公共参数（会附加到每个事件） */
  setCommonParams(params: CommonParams): void {
    this.commonParams = { ...this.commonParams, ...params };
  }

  /** 手动埋点 */
  track(name: string, data?: Record<string, unknown>): void {
    const event: CustomEvent = {
      eventId: generateId(),
      eventType: EventType.CUSTOM,
      timestamp: timestamp(),
      appId: this.config.appId,
      appVersion: this.config.appVersion,
      pageUrl: getPageUrl(),
      name,
      data,
    };
    this.handleEvent(event);
  }

  /** 手动上报 PV（用于 SPA 路由切换） */
  trackPageView(pageUrl?: string): void {
    this.behaviorCollector.trackPageView(pageUrl);
  }
}
