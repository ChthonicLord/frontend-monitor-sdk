/* ================================================================
 *  Reporter 上报层 —— 批量合并 / 队列管理 / 重试 / 降级
 * ================================================================ */

import { MonitorEvent, ReportPayload, TransportType } from '../types';
import { transport } from '../transports';

// ---- 事件队列 ----

class EventQueue {
  private queue: MonitorEvent[] = [];

  push(events: MonitorEvent | MonitorEvent[]): void {
    if (Array.isArray(events)) {
      this.queue.push(...events);
    } else {
      this.queue.push(events);
    }
  }

  drain(batchSize: number): MonitorEvent[] {
    if (this.queue.length <= batchSize) {
      const batch = this.queue.splice(0);
      return batch;
    }
    return this.queue.splice(0, batchSize);
  }

  get size(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue = [];
  }
}

// ---- 重试管理 ----

interface RetryTask {
  payload: ReportPayload;
  retries: number;
}

class RetryManager {
  private tasks: RetryTask[] = [];
  private maxRetries: number;

  constructor(maxRetries: number) {
    this.maxRetries = maxRetries;
  }

  enqueue(payload: ReportPayload): void {
    this.tasks.push({ payload, retries: 0 });
  }

  /** 取出需要重试的任务 */
  drain(): RetryTask[] {
    const retryable = this.tasks.filter((t) => t.retries < this.maxRetries);
    this.tasks = this.tasks.filter((t) => t.retries >= this.maxRetries);
    return retryable;
  }

  get pending(): number {
    return this.tasks.length;
  }
}

// ---- Reporter ----

export interface ReporterConfig {
  reportUrl: string;
  appId: string;
  batchMaxSize: number;
  batchInterval: number;
  maxRetries: number;
  transportPreference: TransportType[];
  onFlush?: (payload: ReportPayload) => void;
}

export class Reporter {
  private config: ReporterConfig;
  private eventQueue: EventQueue;
  private retryManager: RetryManager;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  constructor(config: ReporterConfig) {
    this.config = config;
    this.eventQueue = new EventQueue();
    this.retryManager = new RetryManager(config.maxRetries);
  }

  /** 启动定时批量上报 */
  start(): void {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.batchInterval);
  }

  /** 停止定时器 */
  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    // 页面关闭前兜底上报
    this.flush();
  }

  /** 添加事件 */
  add(event: MonitorEvent): void {
    this.eventQueue.push(event);
    // 达到批量上限立即触发上报
    if (this.eventQueue.size >= this.config.batchMaxSize) {
      this.flush();
    }
  }

  /** 批量上报 */
  async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;

    try {
      // 1. 先处理重试队列
      const retryTasks = this.retryManager.drain();
      for (const task of retryTasks) {
        const result = await transport(
          this.config.reportUrl,
          task.payload,
          this.config.transportPreference,
        );
        if (!result.success) {
          task.retries++;
          if (task.retries < this.config.maxRetries) {
            this.retryManager.enqueue(task.payload);
          }
        }
      }

      // 2. 处理新事件
      const batch = this.eventQueue.drain(this.config.batchMaxSize);
      if (batch.length === 0) return;

      const payload: ReportPayload = {
        appId: this.config.appId,
        events: batch,
        sendTime: Date.now(),
      };

      this.config.onFlush?.(payload);

      const result = await transport(
        this.config.reportUrl,
        payload,
        this.config.transportPreference,
      );

      if (!result.success) {
        this.retryManager.enqueue(payload);
      }
    } finally {
      this.flushing = false;
    }
  }

  /** 页面卸载时立即发送（使用 sendBeacon） */
  unloadFlush(): void {
    const batch = this.eventQueue.drain(this.config.batchMaxSize);
    if (batch.length === 0) return;
    const payload: ReportPayload = {
      appId: this.config.appId,
      events: batch,
      sendTime: Date.now(),
    };
    transport(this.config.reportUrl, payload, [TransportType.BEACON]);
  }
}
