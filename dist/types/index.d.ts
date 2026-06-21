import { Monitor } from './core/monitor';
import { MonitorConfig, UserInfo, CommonParams } from './types';
export { Monitor } from './core/monitor';
export * from './types';
export interface MonitorInstance {
    /** 手动埋点 */
    track: (name: string, data?: Record<string, unknown>) => void;
    /** 设置用户信息 */
    setUser: (user: UserInfo) => void;
    /** 设置全局公共参数 */
    setCommonParams: (params: CommonParams) => void;
    /** 手动上报 PV（SPA 路由切换时调用） */
    trackPageView: (pageUrl?: string) => void;
    /** 停止监控 */
    stop: () => void;
}
declare global {
    interface Window {
        __monitor__?: MonitorInstance;
        FrontendMonitor?: {
            createMonitor: typeof createMonitor;
            Monitor: typeof Monitor;
        };
    }
    interface HTMLScriptElement {
        dataset: DOMStringMap & {
            appId?: string;
            reportUrl?: string;
            appVersion?: string;
            debug?: string;
            sampleRate?: string;
            enablePerformance?: string;
            enableBehavior?: string;
            enableResource?: string;
            maxDuplicateErrors?: string;
            batchMaxSize?: string;
            batchInterval?: string;
            maxRetries?: string;
        };
    }
}
/**
 * 创建监控实例（单例）
 *
 * @example
 * ```ts
 * const monitor = createMonitor({
 *   appId: 'my-app',
 *   reportUrl: 'https://api.example.com/report',
 *   sampleRate: 0.1,                   // 10% 采样
 *   enableBehavior: false,             // 关闭行为采集
 *   beforeReport: (event) => {         // 上报前过滤
 *     if (event.pageUrl.includes('admin')) return null;
 *     return event;
 *   },
 * });
 * ```
 */
export declare function createMonitor(config: MonitorConfig): MonitorInstance;
