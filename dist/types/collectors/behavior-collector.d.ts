import { BehaviorEvent, FullMonitorConfig } from '../types';
type BehaviorCallback = (event: BehaviorEvent) => void;
export declare class BehaviorCollector {
    private config;
    private callback;
    private pvSent;
    private throttledScroll;
    constructor(config: FullMonitorConfig);
    start(onEvent: BehaviorCallback): void;
    stop(): void;
    /** 主动埋点 PV */
    trackPageView(pageUrl?: string): void;
    private emitPageView;
    private handleClick;
    private handleInput;
    private handleRouteChange;
    private emitBehavior;
    /** 获取元素的 CSS 选择器路径 */
    private getElementPath;
}
export {};
