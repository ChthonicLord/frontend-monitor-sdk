/** 日志级别 */
export declare enum LogLevel {
    DEBUG = "debug",
    INFO = "info",
    WARN = "warn",
    ERROR = "error"
}
/** 事件类型 */
export declare enum EventType {
    ERROR = "error",
    PERFORMANCE = "performance",
    BEHAVIOR = "behavior",
    RESOURCE = "resource",
    CUSTOM = "custom"
}
/** 传输方式 */
export declare enum TransportType {
    BEACON = "beacon",
    XHR = "xhr",
    IMAGE = "image"
}
export interface UserInfo {
    userId?: string;
    userName?: string;
    [key: string]: unknown;
}
export interface CommonParams {
    [key: string]: unknown;
}
export interface MonitorConfig {
    /** 应用唯一标识 */
    appId: string;
    /** 上报地址 */
    reportUrl: string;
    /** 应用版本 */
    appVersion?: string;
    /** 是否开启调试模式 */
    debug?: boolean;
    /** 采样率 0-1，默认 1（全量） */
    sampleRate?: number;
    /** 是否开启 Performance 采集 */
    enablePerformance?: boolean;
    /** 是否开启 Behavior 采集 */
    enableBehavior?: boolean;
    /** 是否开启 Resource 采集 */
    enableResource?: boolean;
    /** 错误采集最大重复次数（同一错误去重） */
    maxDuplicateErrors?: number;
    /** 批量上报最大条数 */
    batchMaxSize?: number;
    /** 批量上报间隔 ms */
    batchInterval?: number;
    /** 重试次数上限 */
    maxRetries?: number;
    /** 传输方式优先级 */
    transportPreference?: TransportType[];
    /** 敏感字段列表（将被脱敏） */
    sensitiveFields?: string[];
    /** 上报前钩子 */
    beforeReport?: (data: MonitorEvent) => MonitorEvent | null;
}
export type FullMonitorConfig = Required<Omit<MonitorConfig, 'beforeReport' | 'transportPreference' | 'sensitiveFields'>> & {
    transportPreference: TransportType[];
    sensitiveFields: string[];
    beforeReport?: (data: MonitorEvent) => MonitorEvent | null;
};
export interface BaseEvent {
    /** 事件唯一 ID */
    eventId: string;
    /** 事件类型 */
    eventType: EventType;
    /** 时间戳 */
    timestamp: number;
    /** 应用 ID */
    appId: string;
    /** 应用版本 */
    appVersion: string;
    /** 页面 URL */
    pageUrl: string;
    /** 用户信息 */
    userInfo?: UserInfo;
    /** 公共参数 */
    commonParams?: CommonParams;
}
/** 错误事件 */
export interface ErrorEvent extends BaseEvent {
    eventType: EventType.ERROR;
    /** 错误消息 */
    message: string;
    /** 错误堆栈 */
    stack?: string;
    /** 错误类型 (SyntaxError / TypeError / ResourceError / PromiseError) */
    errorType: string;
    /** 出错文件名 */
    filename?: string;
    /** 出错行号 */
    lineno?: number;
    /** 出错列号 */
    colno?: number;
}
/** 性能事件 */
export interface PerformanceEvent extends BaseEvent {
    eventType: EventType.PERFORMANCE;
    /** 性能指标 */
    metrics: PerformanceMetrics;
}
export interface PerformanceMetrics {
    /** DNS 解析耗时 */
    dnsTime: number;
    /** TCP 连接耗时 */
    tcpTime: number;
    /** TTFB */
    ttfb: number;
    /** DOM 解析耗时 */
    domParseTime: number;
    /** DOM 内容加载完成 */
    domContentLoaded: number;
    /** 页面完全加载 */
    loadComplete: number;
    /** FP */
    firstPaint?: number;
    /** FCP */
    firstContentfulPaint?: number;
    /** LCP */
    largestContentfulPaint?: number;
    /** FID */
    firstInputDelay?: number;
    /** CLS */
    cumulativeLayoutShift?: number;
    /** TTI */
    timeToInteractive?: number;
}
/** 行为事件 */
export interface BehaviorEvent extends BaseEvent {
    eventType: EventType.BEHAVIOR;
    /** 行为类型 */
    behaviorType: 'click' | 'scroll' | 'input' | 'navigate' | 'expose';
    /** 行为目标 */
    target?: string;
    /** 行为附加数据 */
    data?: Record<string, unknown>;
}
/** 资源加载事件 */
export interface ResourceEvent extends BaseEvent {
    eventType: EventType.RESOURCE;
    /** 资源 URL */
    resourceUrl: string;
    /** 资源类型 (script / style / image / font / xhr / fetch) */
    resourceType: string;
    /** 是否加载成功 */
    success: boolean;
    /** 耗时 ms */
    duration: number;
    /** 资源大小 bytes */
    size?: number;
    /** HTTP 状态码 */
    statusCode?: number;
}
/** 自定义事件 */
export interface CustomEvent extends BaseEvent {
    eventType: EventType.CUSTOM;
    /** 自定义事件名 */
    name: string;
    /** 自定义数据 */
    data?: Record<string, unknown>;
}
export type MonitorEvent = ErrorEvent | PerformanceEvent | BehaviorEvent | ResourceEvent | CustomEvent;
export interface ReportPayload {
    appId: string;
    events: MonitorEvent[];
    sendTime: number;
}
