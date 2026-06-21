/* ================================================================
 *  前端监控 SDK 入口 —— 业务接入层
 *
 *  方式一（推荐）：script 标签 + data 属性，一行接入
 *    <script src="monitor.umd.js"
 *            data-app-id="my-app"
 *            data-report-url="https://monitor.example.com/api/report"
 *            data-sample-rate="0.1"
 *            data-debug="false"></script>
 *
 *  方式二：ESM import，手动调用
 *    import { createMonitor } from '@monitor/frontend-sdk';
 *    const monitor = createMonitor({ appId: 'xxx', reportUrl: '/api/report' });
 *    monitor.track('button_click', { btnName: 'submit' });
 *    monitor.setUser({ userId: '123' });
 * ================================================================ */

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

// ---- 全局声明 ----

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
export function createMonitor(config: MonitorConfig): MonitorInstance {
  const monitor = new Monitor(config);
  monitor.start();

  const instance: MonitorInstance = {
    track: (name, data) => monitor.track(name, data),
    setUser: (user) => monitor.setUser(user),
    setCommonParams: (params) => monitor.setCommonParams(params),
    trackPageView: (url) => monitor.trackPageView(url),
    stop: () => monitor.stop(),
  };

  // 暴露到 window，方便 SPA 路由追踪等场景
  if (typeof window !== 'undefined') {
    window.__monitor__ = window.__monitor__ || instance;
  }

  return instance;
}

// ================================================================
//  自动初始化：通过 script 标签的 data-* 属性读取配置
//  仅当作为 <script> 标签引入时生效（UMD 场景）
//  需要同时存在 data-app-id 和 data-report-url 才会启动
// ================================================================

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value !== 'false' && value !== '0';
}

function parseNum(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getScriptConfig(
  script: HTMLScriptElement | null,
): Partial<MonitorConfig> {
  if (!script) return {};

  const ds = script.dataset;
  return {
    appId: ds.appId,
    reportUrl: ds.reportUrl,
    appVersion: ds.appVersion,
    debug: parseBool(ds.debug, false),
    sampleRate: parseNum(ds.sampleRate, 1),
    enablePerformance: parseBool(ds.enablePerformance, true),
    enableBehavior: parseBool(ds.enableBehavior, true),
    enableResource: parseBool(ds.enableResource, true),
    maxDuplicateErrors: parseNum(ds.maxDuplicateErrors, 5),
    batchMaxSize: parseNum(ds.batchMaxSize, 10),
    batchInterval: parseNum(ds.batchInterval, 5000),
    maxRetries: parseNum(ds.maxRetries, 3),
  };
}

function tryAutoInit(): void {
  // document.currentScript 仅对同步 script 标签有效（UMD 场景）
  const script =
    document.currentScript as HTMLScriptElement | null;

  if (!script) return;

  const rawConfig = getScriptConfig(script);
  if (!rawConfig.appId || !rawConfig.reportUrl) return;

  try {
    createMonitor(rawConfig as MonitorConfig);
  } catch (err) {
    // 初始化失败不阻塞页面
    console.error('[Monitor] Auto-init failed:', err);
  }
}

// 等 DOM 就绪后尝试自动初始化（确保 data 属性已解析）
if (
  typeof document !== 'undefined' &&
  typeof window !== 'undefined'
) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryAutoInit);
  } else {
    tryAutoInit();
  }
}
