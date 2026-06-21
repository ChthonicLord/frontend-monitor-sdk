import { ResourceEvent, FullMonitorConfig } from '../types';
type ResourceCallback = (event: ResourceEvent) => void;
export declare class ResourceCollector {
    private config;
    private callback;
    private reportedUrls;
    constructor(config: FullMonitorConfig);
    start(onEvent: ResourceCallback): void;
    stop(): void;
    private handleResourceEntry;
    private listenResourceError;
    private getResourceType;
}
export {};
