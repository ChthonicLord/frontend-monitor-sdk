import { MonitorEvent, FullMonitorConfig } from '../types';
/**
 * 采样控制器
 * 根据采样率决定是否保留当前事件
 */
export declare class Sampler {
    private rate;
    constructor(rate: number);
    shouldSample(): boolean;
}
/**
 * 敏感信息脱敏器
 * 对指定字段的值进行替换
 */
export declare class Sanitizer {
    private sensitiveFields;
    private maskChar;
    constructor(fields: string[]);
    sanitize(event: MonitorEvent): MonitorEvent;
}
/**
 * 去重过滤器
 * 对相同错误事件在短时间内只保留首次
 */
export declare class Deduplicator {
    private cache;
    private maxDuplicates;
    private windowMs;
    constructor(maxDuplicates: number);
    /** 定期清理过期缓存 */
    private cleanup;
    isDuplicate(event: MonitorEvent): boolean;
}
/**
 * 数据聚合器
 * 对同一类型的相邻事件合并上报
 */
export declare function aggregateEvents(events: MonitorEvent[]): MonitorEvent[];
/**
 * 完整的处理管道
 */
export declare class ProcessorPipeline {
    sampler: Sampler;
    sanitizer: Sanitizer;
    deduplicator: Deduplicator;
    constructor(config: FullMonitorConfig);
    /** 对单个事件依次执行采样 → 脱敏 → 去重，返回 null 表示应丢弃 */
    process(event: MonitorEvent): MonitorEvent | null;
}
