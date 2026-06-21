import { PerformanceEvent, FullMonitorConfig } from '../types';
type PerformanceCallback = (event: PerformanceEvent) => void;
export declare class PerformanceCollector {
    private config;
    private callback;
    private metrics;
    private observerCleanups;
    constructor(config: FullMonitorConfig);
    start(onEvent: PerformanceCallback): void;
    stop(): void;
    private collectNavigationTiming;
    private collectTimingFallback;
    private observeLCP;
    private observeFID;
    private observeCLS;
    private observeFCP;
    private reportIfReady;
}
export {};
