import { MonitorConfig, FullMonitorConfig, UserInfo, CommonParams } from '../types';
import { Reporter } from '../reporters/batch-reporter';
export declare class Monitor {
    config: FullMonitorConfig;
    private errorCollector;
    private performanceCollector;
    private behaviorCollector;
    private resourceCollector;
    private processor;
    reporter: Reporter;
    private userInfo;
    private commonParams;
    private started;
    constructor(config: MonitorConfig);
    /** 启动所有采集器 */
    start(): void;
    /** 停止所有采集 */
    stop(): void;
    /** 内部事件处理入口 */
    private handleEvent;
    /** 注入用户信息和公共参数 */
    private enrichEvent;
    /** 设置用户信息 */
    setUser(user: UserInfo): void;
    /** 设置公共参数（会附加到每个事件） */
    setCommonParams(params: CommonParams): void;
    /** 手动埋点 */
    track(name: string, data?: Record<string, unknown>): void;
    /** 手动上报 PV（用于 SPA 路由切换） */
    trackPageView(pageUrl?: string): void;
}
