import { MonitorEvent, ReportPayload, TransportType } from '../types';
export interface ReporterConfig {
    reportUrl: string;
    appId: string;
    batchMaxSize: number;
    batchInterval: number;
    maxRetries: number;
    transportPreference: TransportType[];
    onFlush?: (payload: ReportPayload) => void;
}
export declare class Reporter {
    private config;
    private eventQueue;
    private retryManager;
    private flushTimer;
    private flushing;
    constructor(config: ReporterConfig);
    /** 启动定时批量上报 */
    start(): void;
    /** 停止定时器 */
    stop(): void;
    /** 添加事件 */
    add(event: MonitorEvent): void;
    /** 批量上报 */
    flush(): Promise<void>;
    /** 页面卸载时立即发送（使用 sendBeacon） */
    unloadFlush(): void;
}
