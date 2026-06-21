/* ================================================================
 *  Processor 数据处理层 —— 聚合 / 脱敏 / 采样 / 去重
 * ================================================================ */

import { MonitorEvent, ErrorEvent, EventType, FullMonitorConfig } from '../types';

/**
 * 采样控制器
 * 根据采样率决定是否保留当前事件
 */
export class Sampler {
  private rate: number;

  constructor(rate: number) {
    this.rate = Math.min(1, Math.max(0, rate));
  }

  shouldSample(): boolean {
    if (this.rate >= 1) return true;
    return Math.random() < this.rate;
  }
}

/**
 * 敏感信息脱敏器
 * 对指定字段的值进行替换
 */
export class Sanitizer {
  private sensitiveFields: Set<string>;
  private maskChar = '***';

  constructor(fields: string[]) {
    this.sensitiveFields = new Set(fields.map((f) => f.toLowerCase()));
  }

  sanitize(event: MonitorEvent): MonitorEvent {
    if (this.sensitiveFields.size === 0) return event;

    const sanitizeValue = (key: string, value: unknown): unknown => {
      if (this.sensitiveFields.has(key.toLowerCase())) {
        return this.maskChar;
      }
      return value;
    };

    // 遍历事件顶层字段进行脱敏
    const result = { ...event } as Record<string, unknown>;
    for (const key of Object.keys(result)) {
      result[key] = sanitizeValue(key, result[key]);
    }

    // 脱敏行为事件的 data 字段
    if (event.eventType === EventType.BEHAVIOR && 'data' in result && result.data) {
      const data = result.data as Record<string, unknown>;
      for (const key of Object.keys(data)) {
        data[key] = sanitizeValue(key, data[key]);
      }
    }

    return result as MonitorEvent;
  }
}

/**
 * 去重过滤器
 * 对相同错误事件在短时间内只保留首次
 */
export class Deduplicator {
  private cache: Map<string, number> = new Map();
  private maxDuplicates: number;
  private windowMs = 10_000; // 10 秒去重窗口

  constructor(maxDuplicates: number) {
    this.maxDuplicates = maxDuplicates;
  }

  /** 定期清理过期缓存 */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, ts] of this.cache) {
      if (now - ts > this.windowMs) {
        this.cache.delete(key);
      }
    }
  }

  isDuplicate(event: MonitorEvent): boolean {
    // 仅对错误事件去重
    if (event.eventType !== EventType.ERROR) return false;

    const err = event as ErrorEvent;
    const fingerprint = `${err.message}|${err.filename || ''}|${err.lineno || 0}`;
    const now = Date.now();

    this.cleanup();

    const count = this.cache.get(fingerprint) || 0;
    if (count >= this.maxDuplicates) return true;

    this.cache.set(fingerprint, now);
    return false;
  }
}

/**
 * 数据聚合器
 * 对同一类型的相邻事件合并上报
 */
export function aggregateEvents(events: MonitorEvent[]): MonitorEvent[] {
  if (events.length <= 1) return events;

  const result: MonitorEvent[] = [];
  let current = events[0];

  for (let i = 1; i < events.length; i++) {
    const next = events[i];
    // 相同类型且 1 秒内的相邻事件合并
    if (
      current.eventType === next.eventType &&
      next.timestamp - current.timestamp < 1000
    ) {
      // 保留第一个，跳过后续相同类型（留待扩展更复杂的合并逻辑）
      continue;
    } else {
      result.push(current);
      current = next;
    }
  }
  result.push(current);
  return result;
}

/**
 * 完整的处理管道
 */
export class ProcessorPipeline {
  sampler: Sampler;
  sanitizer: Sanitizer;
  deduplicator: Deduplicator;

  constructor(config: FullMonitorConfig) {
    this.sampler = new Sampler(config.sampleRate);
    this.sanitizer = new Sanitizer(config.sensitiveFields);
    this.deduplicator = new Deduplicator(config.maxDuplicateErrors);
  }

  /** 对单个事件依次执行采样 → 脱敏 → 去重，返回 null 表示应丢弃 */
  process(event: MonitorEvent): MonitorEvent | null {
    // 1. 采样
    if (!this.sampler.shouldSample()) return null;
    // 2. 脱敏
    const sanitized = this.sanitizer.sanitize(event);
    // 3. 去重
    if (this.deduplicator.isDuplicate(sanitized)) return null;
    return sanitized;
  }
}
