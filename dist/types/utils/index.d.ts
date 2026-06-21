/** 生成唯一 ID */
export declare function generateId(): string;
/** 获取当前高精度时间戳 */
export declare function now(): number;
/** 获取 Unix 毫秒时间戳 */
export declare function timestamp(): number;
/** 安全 JSON 序列化（处理循环引用） */
export declare function safeStringify(obj: unknown, fallback?: string): string;
/** 获取当前页面 URL 信息 */
export declare function getPageUrl(): string;
/** 从 Navigation Timing API 获取导航类型 */
export declare function getNavigationType(): string;
/** 函数节流 */
export declare function throttle<T extends (...args: unknown[]) => void>(fn: T, delay: number): T;
/** 简单深拷贝 */
export declare function deepClone<T>(obj: T): T;
/** 从 userAgent 解析设备基本信息 */
export declare function parseDeviceInfo(): Record<string, string>;
