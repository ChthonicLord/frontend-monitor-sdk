import { ErrorEvent, FullMonitorConfig } from '../types';
type ErrorCallback = (event: ErrorEvent) => void;
export declare class ErrorCollector {
    private config;
    private callback;
    private boundHandlers;
    constructor(config: FullMonitorConfig);
    start(onEvent: ErrorCallback): void;
    stop(): void;
    private buildBase;
    private handleError;
    private handleRejection;
}
export {};
