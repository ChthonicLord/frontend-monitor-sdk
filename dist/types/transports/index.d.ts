import { TransportType, ReportPayload } from '../types';
export interface TransportResult {
    success: boolean;
    method: TransportType;
}
/**
 * 按优先级尝试传输：sendBeacon → XHR → Image
 */
export declare function transport(url: string, payload: ReportPayload, preference?: TransportType[]): Promise<TransportResult>;
