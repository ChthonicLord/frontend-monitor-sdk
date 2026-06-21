(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.FrontendMonitor = {}));
})(this, (function (exports) { 'use strict';

    /* ================================================================
     *  类型定义 —— 前端监控 SDK 核心类型
     * ================================================================ */
    // ---- 基础枚举 ----
    /** 日志级别 */
    exports.LogLevel = void 0;
    (function (LogLevel) {
        LogLevel["DEBUG"] = "debug";
        LogLevel["INFO"] = "info";
        LogLevel["WARN"] = "warn";
        LogLevel["ERROR"] = "error";
    })(exports.LogLevel || (exports.LogLevel = {}));
    /** 事件类型 */
    exports.EventType = void 0;
    (function (EventType) {
        EventType["ERROR"] = "error";
        EventType["PERFORMANCE"] = "performance";
        EventType["BEHAVIOR"] = "behavior";
        EventType["RESOURCE"] = "resource";
        EventType["CUSTOM"] = "custom";
    })(exports.EventType || (exports.EventType = {}));
    /** 传输方式 */
    exports.TransportType = void 0;
    (function (TransportType) {
        TransportType["BEACON"] = "beacon";
        TransportType["XHR"] = "xhr";
        TransportType["IMAGE"] = "image";
    })(exports.TransportType || (exports.TransportType = {}));

    /* ================================================================
     *  工具函数 —— UUID / 时间戳 / URL 解析 / 深拷贝
     * ================================================================ */
    /** 生成唯一 ID */
    function generateId() {
        return 'monitor_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
    }
    /** 获取 Unix 毫秒时间戳 */
    function timestamp() {
        return Date.now();
    }
    /** 安全 JSON 序列化（处理循环引用） */
    function safeStringify(obj, fallback = '{}') {
        try {
            return JSON.stringify(obj, (_key, value) => {
                if (typeof value === 'function')
                    return '[Function]';
                if (value instanceof Error) {
                    return { message: value.message, stack: value.stack, name: value.name };
                }
                return value;
            });
        }
        catch (_a) {
            return fallback;
        }
    }
    /** 获取当前页面 URL 信息 */
    function getPageUrl() {
        try {
            return window.location.href;
        }
        catch (_a) {
            return '';
        }
    }
    /** 函数节流 */
    function throttle(fn, delay) {
        let lastTime = 0;
        let timer = null;
        return function (...args) {
            const now = Date.now();
            if (now - lastTime >= delay) {
                lastTime = now;
                fn.apply(this, args);
            }
            else if (!timer) {
                timer = setTimeout(() => {
                    lastTime = Date.now();
                    timer = null;
                    fn.apply(this, args);
                }, delay - (now - lastTime));
            }
        };
    }

    /* ================================================================
     *  ErrorCollector —— 错误采集器
     *  覆盖：JS Error / Promise UnhandledRejection / 资源加载 Error
     * ================================================================ */
    class ErrorCollector {
        constructor(config) {
            this.callback = null;
            this.config = config;
            this.boundHandlers = {
                onError: this.handleError.bind(this),
                onUnhandledRejection: this.handleRejection.bind(this),
            };
        }
        start(onEvent) {
            this.callback = onEvent;
            window.addEventListener('error', this.boundHandlers.onError, true);
            window.addEventListener('unhandledrejection', this.boundHandlers.onUnhandledRejection);
        }
        stop() {
            window.removeEventListener('error', this.boundHandlers.onError, true);
            window.removeEventListener('unhandledrejection', this.boundHandlers.onUnhandledRejection);
            this.callback = null;
        }
        buildBase() {
            return {
                eventId: generateId(),
                eventType: exports.EventType.ERROR,
                timestamp: timestamp(),
                appId: this.config.appId,
                appVersion: this.config.appVersion,
                pageUrl: getPageUrl(),
            };
        }
        handleError(event) {
            var _a, _b;
            if (!this.callback)
                return;
            // 资源加载错误
            const target = event.target;
            if (target && (target.tagName === 'IMG' || target.tagName === 'SCRIPT' || target.tagName === 'LINK')) {
                // 资源错误由 ResourceCollector 处理，这里跳过
                return;
            }
            const e = event;
            const errorEvent = {
                ...this.buildBase(),
                message: e.message || 'Unknown error',
                stack: ((_a = e.error) === null || _a === void 0 ? void 0 : _a.stack) || e.stack || '',
                errorType: ((_b = e.error) === null || _b === void 0 ? void 0 : _b.name) || 'Error',
                filename: e.filename,
                lineno: e.lineno,
                colno: e.colno,
            };
            this.callback(errorEvent);
        }
        handleRejection(event) {
            if (!this.callback)
                return;
            const reason = event.reason;
            const message = reason instanceof Error ? reason.message : String(reason);
            const stack = reason instanceof Error ? reason.stack : '';
            const errorEvent = {
                ...this.buildBase(),
                message: `[Promise] ${message}`,
                stack,
                errorType: 'PromiseError',
            };
            this.callback(errorEvent);
        }
    }

    /* ================================================================
     *  PerformanceCollector —— 性能采集器
     *  覆盖：Navigation Timing / Web Vitals (LCP / FID / CLS / FCP)
     * ================================================================ */
    class PerformanceCollector {
        constructor(config) {
            this.callback = null;
            this.metrics = {};
            this.observerCleanups = [];
            this.config = config;
        }
        start(onEvent) {
            this.callback = onEvent;
            // 1. 采集 Navigation Timing
            this.collectNavigationTiming();
            // 2. 采集 Web Vitals
            this.observeLCP();
            this.observeFID();
            this.observeCLS();
            this.observeFCP();
            // 页面加载完成后统一上报
            if (document.readyState === 'complete') {
                this.reportIfReady();
            }
            else {
                window.addEventListener('load', () => {
                    // 延迟确保 LCP 等指标已采集
                    setTimeout(() => this.reportIfReady(), 2000);
                });
            }
        }
        stop() {
            this.observerCleanups.forEach((fn) => fn());
            this.observerCleanups = [];
            this.callback = null;
        }
        collectNavigationTiming() {
            // 使用 Navigation Timing API Level 2
            const observer = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                for (const entry of entries) {
                    const nav = entry;
                    this.metrics.dnsTime = nav.domainLookupEnd - nav.domainLookupStart;
                    this.metrics.tcpTime = nav.connectEnd - nav.connectStart;
                    this.metrics.ttfb = nav.responseStart - nav.requestStart;
                    this.metrics.domParseTime =
                        nav.domContentLoadedEventEnd - nav.responseEnd;
                    this.metrics.domContentLoaded =
                        nav.domContentLoadedEventEnd - nav.fetchStart;
                    this.metrics.loadComplete = nav.loadEventEnd - nav.fetchStart;
                    // FP: first-paint 近似值
                    const fpEntry = performance.getEntriesByName('first-paint')[0];
                    if (fpEntry) {
                        this.metrics.firstPaint = fpEntry.startTime;
                    }
                }
            });
            try {
                observer.observe({ type: 'navigation', buffered: true });
            }
            catch (_a) {
                // 降级：使用 performance.timing
                this.collectTimingFallback();
            }
        }
        collectTimingFallback() {
            const t = performance.timing;
            if (!t || t.loadEventEnd === 0) {
                // 尚未加载完成，延迟采集
                window.addEventListener('load', () => {
                    this.collectTimingFallback();
                });
                return;
            }
            this.metrics.dnsTime = t.domainLookupEnd - t.domainLookupStart;
            this.metrics.tcpTime = t.connectEnd - t.connectStart;
            this.metrics.ttfb = t.responseStart - t.requestStart;
            this.metrics.domParseTime = t.domContentLoadedEventEnd - t.responseEnd;
            this.metrics.domContentLoaded = t.domContentLoadedEventEnd - t.navigationStart;
            this.metrics.loadComplete = t.loadEventEnd - t.navigationStart;
        }
        observeLCP() {
            try {
                const observer = new PerformanceObserver((list) => {
                    const entries = list.getEntries();
                    const last = entries[entries.length - 1];
                    if (last) {
                        this.metrics.largestContentfulPaint = last.startTime;
                    }
                });
                observer.observe({ type: 'largest-contentful-paint', buffered: true });
                this.observerCleanups.push(() => observer.disconnect());
            }
            catch ( /* 浏览器不支持 */_a) { /* 浏览器不支持 */ }
        }
        observeFID() {
            try {
                const observer = new PerformanceObserver((list) => {
                    const entries = list.getEntries();
                    for (const entry of entries) {
                        const fidEntry = entry;
                        if (fidEntry.processingStart !== undefined) {
                            this.metrics.firstInputDelay =
                                fidEntry.processingStart - fidEntry.startTime;
                        }
                    }
                });
                observer.observe({ type: 'first-input', buffered: true });
                this.observerCleanups.push(() => observer.disconnect());
            }
            catch ( /* 浏览器不支持 */_a) { /* 浏览器不支持 */ }
        }
        observeCLS() {
            try {
                let clsValue = 0;
                const observer = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        const lsEntry = entry;
                        if (!lsEntry.hadRecentInput) {
                            clsValue += lsEntry.value;
                        }
                    }
                    this.metrics.cumulativeLayoutShift = clsValue;
                });
                observer.observe({ type: 'layout-shift', buffered: true });
                this.observerCleanups.push(() => observer.disconnect());
            }
            catch ( /* 浏览器不支持 */_a) { /* 浏览器不支持 */ }
        }
        observeFCP() {
            try {
                const observer = new PerformanceObserver((list) => {
                    const entries = list.getEntriesByName('first-contentful-paint');
                    if (entries.length > 0) {
                        this.metrics.firstContentfulPaint = entries[0].startTime;
                    }
                });
                observer.observe({ type: 'paint', buffered: true });
                this.observerCleanups.push(() => observer.disconnect());
            }
            catch ( /* 浏览器不支持 */_a) { /* 浏览器不支持 */ }
        }
        reportIfReady() {
            var _a, _b, _c, _d, _e, _f;
            if (!this.callback)
                return;
            // 确保有基础指标
            if (this.metrics.loadComplete === undefined) {
                this.collectTimingFallback();
            }
            const perfEvent = {
                eventId: generateId(),
                eventType: exports.EventType.PERFORMANCE,
                timestamp: timestamp(),
                appId: this.config.appId,
                appVersion: this.config.appVersion,
                pageUrl: getPageUrl(),
                metrics: {
                    dnsTime: (_a = this.metrics.dnsTime) !== null && _a !== void 0 ? _a : 0,
                    tcpTime: (_b = this.metrics.tcpTime) !== null && _b !== void 0 ? _b : 0,
                    ttfb: (_c = this.metrics.ttfb) !== null && _c !== void 0 ? _c : 0,
                    domParseTime: (_d = this.metrics.domParseTime) !== null && _d !== void 0 ? _d : 0,
                    domContentLoaded: (_e = this.metrics.domContentLoaded) !== null && _e !== void 0 ? _e : 0,
                    loadComplete: (_f = this.metrics.loadComplete) !== null && _f !== void 0 ? _f : 0,
                    firstPaint: this.metrics.firstPaint,
                    firstContentfulPaint: this.metrics.firstContentfulPaint,
                    largestContentfulPaint: this.metrics.largestContentfulPaint,
                    firstInputDelay: this.metrics.firstInputDelay,
                    cumulativeLayoutShift: this.metrics.cumulativeLayoutShift,
                },
            };
            this.callback(perfEvent);
        }
    }

    /* ================================================================
     *  BehaviorCollector —— 行为采集器
     *  覆盖：页面浏览 / 点击 / 滚动 / 输入
     * ================================================================ */
    class BehaviorCollector {
        constructor(config) {
            this.callback = null;
            // 记录已访问页面，避免重复 PV
            this.pvSent = false;
            this.handleClick = (e) => {
                var _a;
                const target = e.target;
                if (!target)
                    return;
                const tagName = ((_a = target.tagName) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || '';
                const selector = this.getElementPath(target);
                this.emitBehavior('click', tagName, {
                    selector,
                    text: (target.textContent || '').slice(0, 100),
                    x: e.clientX,
                    y: e.clientY,
                });
            };
            this.handleInput = (e) => {
                const target = e.target;
                if (!target || !target.name)
                    return;
                // 不上报实际输入值，仅记录字段名
                this.emitBehavior('input', target.tagName.toLowerCase(), {
                    name: target.name,
                    type: target.type || 'text',
                });
            };
            this.handleRouteChange = () => {
                // SPA 路由变化时重新上报 PV
                this.pvSent = false;
                this.emitPageView();
            };
            this.config = config;
            this.throttledScroll = throttle(() => {
                this.emitBehavior('scroll');
            }, 1000);
        }
        start(onEvent) {
            this.callback = onEvent;
            // PV 上报
            this.emitPageView();
            // 点击
            document.addEventListener('click', this.handleClick, true);
            // 滚动
            document.addEventListener('scroll', this.throttledScroll, true);
            // 输入（仅监听 change 事件，降低频率）
            document.addEventListener('change', this.handleInput, true);
            // SPA 路由变化 (hashchange / popstate)
            window.addEventListener('hashchange', this.handleRouteChange);
            window.addEventListener('popstate', this.handleRouteChange);
        }
        stop() {
            document.removeEventListener('click', this.handleClick, true);
            document.removeEventListener('scroll', this.throttledScroll, true);
            document.removeEventListener('change', this.handleInput, true);
            window.removeEventListener('hashchange', this.handleRouteChange);
            window.removeEventListener('popstate', this.handleRouteChange);
            this.callback = null;
        }
        /** 主动埋点 PV */
        trackPageView(pageUrl) {
            this.pvSent = false;
            this.emitPageView(pageUrl);
        }
        emitPageView(pageUrl) {
            if (this.pvSent)
                return;
            this.pvSent = true;
            this.emitBehavior('navigate', 'page', { url: pageUrl || getPageUrl() });
        }
        emitBehavior(behaviorType, target, data) {
            if (!this.callback)
                return;
            const event = {
                eventId: generateId(),
                eventType: exports.EventType.BEHAVIOR,
                timestamp: timestamp(),
                appId: this.config.appId,
                appVersion: this.config.appVersion,
                pageUrl: getPageUrl(),
                behaviorType,
                target,
                data,
            };
            this.callback(event);
        }
        /** 获取元素的 CSS 选择器路径 */
        getElementPath(el) {
            const path = [];
            let current = el;
            while (current && current !== document.body && path.length < 5) {
                let selector = current.tagName.toLowerCase();
                if (current.id) {
                    selector += `#${current.id}`;
                    path.unshift(selector);
                    break;
                }
                if (current.className && typeof current.className === 'string') {
                    const cls = current.className.trim().split(/\s+/).slice(0, 2).join('.');
                    if (cls)
                        selector += `.${cls}`;
                }
                path.unshift(selector);
                current = current.parentElement;
            }
            return path.join(' > ');
        }
    }

    /* ================================================================
     *  ResourceCollector —— 资源采集器
     *  覆盖：script / style / image / font 加载状态 & 耗时
     * ================================================================ */
    class ResourceCollector {
        constructor(config) {
            this.callback = null;
            this.reportedUrls = new Set();
            this.config = config;
        }
        start(onEvent) {
            this.callback = onEvent;
            try {
                const observer = new PerformanceObserver((list) => {
                    const entries = list.getEntries();
                    for (const entry of entries) {
                        this.handleResourceEntry(entry);
                    }
                });
                observer.observe({ type: 'resource', buffered: true });
            }
            catch (_a) {
                // 降级：监听全局 error 事件中的资源加载错误
                this.listenResourceError();
            }
        }
        stop() {
            this.callback = null;
        }
        handleResourceEntry(entry) {
            if (!this.callback)
                return;
            const url = entry.name;
            // 过滤上报地址自身
            if (url.includes(this.config.reportUrl))
                return;
            // 去重
            if (this.reportedUrls.has(url))
                return;
            this.reportedUrls.add(url);
            const resourceType = this.getResourceType(entry.initiatorType);
            const success = entry.transferSize > 0 || entry.decodedBodySize > 0;
            const duration = entry.responseEnd - entry.startTime;
            const event = {
                eventId: generateId(),
                eventType: exports.EventType.RESOURCE,
                timestamp: timestamp(),
                appId: this.config.appId,
                appVersion: this.config.appVersion,
                pageUrl: getPageUrl(),
                resourceUrl: url,
                resourceType,
                success,
                duration: Math.round(duration * 100) / 100,
                size: entry.transferSize || entry.decodedBodySize || 0,
                statusCode: undefined, // PerformanceResourceTiming 不直接暴露 statusCode
            };
            this.callback(event);
        }
        listenResourceError() {
            window.addEventListener('error', (e) => {
                var _a;
                const target = e.target;
                if (target &&
                    (target.tagName === 'IMG' ||
                        target.tagName === 'SCRIPT' ||
                        target.tagName === 'LINK')) {
                    const src = target.src ||
                        target.src ||
                        target.href ||
                        '';
                    if (!src || this.reportedUrls.has(src))
                        return;
                    this.reportedUrls.add(src);
                    const event = {
                        eventId: generateId(),
                        eventType: exports.EventType.RESOURCE,
                        timestamp: timestamp(),
                        appId: this.config.appId,
                        appVersion: this.config.appVersion,
                        pageUrl: getPageUrl(),
                        resourceUrl: src,
                        resourceType: this.getResourceType(target.tagName.toLowerCase()),
                        success: false,
                        duration: 0,
                    };
                    (_a = this.callback) === null || _a === void 0 ? void 0 : _a.call(this, event);
                }
            }, true);
        }
        getResourceType(initiatorType) {
            switch (initiatorType.toLowerCase()) {
                case 'script':
                    return 'script';
                case 'link':
                case 'css':
                    return 'style';
                case 'img':
                    return 'image';
                case 'font':
                    return 'font';
                case 'xmlhttprequest':
                    return 'xhr';
                case 'fetch':
                    return 'fetch';
                default:
                    return 'script';
            }
        }
    }

    /* ================================================================
     *  Processor 数据处理层 —— 聚合 / 脱敏 / 采样 / 去重
     * ================================================================ */
    /**
     * 采样控制器
     * 根据采样率决定是否保留当前事件
     */
    class Sampler {
        constructor(rate) {
            this.rate = Math.min(1, Math.max(0, rate));
        }
        shouldSample() {
            if (this.rate >= 1)
                return true;
            return Math.random() < this.rate;
        }
    }
    /**
     * 敏感信息脱敏器
     * 对指定字段的值进行替换
     */
    class Sanitizer {
        constructor(fields) {
            this.maskChar = '***';
            this.sensitiveFields = new Set(fields.map((f) => f.toLowerCase()));
        }
        sanitize(event) {
            if (this.sensitiveFields.size === 0)
                return event;
            const sanitizeValue = (key, value) => {
                if (this.sensitiveFields.has(key.toLowerCase())) {
                    return this.maskChar;
                }
                return value;
            };
            // 遍历事件顶层字段进行脱敏
            const result = { ...event };
            for (const key of Object.keys(result)) {
                result[key] = sanitizeValue(key, result[key]);
            }
            // 脱敏行为事件的 data 字段
            if (event.eventType === exports.EventType.BEHAVIOR && 'data' in result && result.data) {
                const data = result.data;
                for (const key of Object.keys(data)) {
                    data[key] = sanitizeValue(key, data[key]);
                }
            }
            return result;
        }
    }
    /**
     * 去重过滤器
     * 对相同错误事件在短时间内只保留首次
     */
    class Deduplicator {
        constructor(maxDuplicates) {
            this.cache = new Map();
            this.windowMs = 10000; // 10 秒去重窗口
            this.maxDuplicates = maxDuplicates;
        }
        /** 定期清理过期缓存 */
        cleanup() {
            const now = Date.now();
            for (const [key, ts] of this.cache) {
                if (now - ts > this.windowMs) {
                    this.cache.delete(key);
                }
            }
        }
        isDuplicate(event) {
            // 仅对错误事件去重
            if (event.eventType !== exports.EventType.ERROR)
                return false;
            const err = event;
            const fingerprint = `${err.message}|${err.filename || ''}|${err.lineno || 0}`;
            const now = Date.now();
            this.cleanup();
            const count = this.cache.get(fingerprint) || 0;
            if (count >= this.maxDuplicates)
                return true;
            this.cache.set(fingerprint, now);
            return false;
        }
    }
    /**
     * 完整的处理管道
     */
    class ProcessorPipeline {
        constructor(config) {
            this.sampler = new Sampler(config.sampleRate);
            this.sanitizer = new Sanitizer(config.sensitiveFields);
            this.deduplicator = new Deduplicator(config.maxDuplicateErrors);
        }
        /** 对单个事件依次执行采样 → 脱敏 → 去重，返回 null 表示应丢弃 */
        process(event) {
            // 1. 采样
            if (!this.sampler.shouldSample())
                return null;
            // 2. 脱敏
            const sanitized = this.sanitizer.sanitize(event);
            // 3. 去重
            if (this.deduplicator.isDuplicate(sanitized))
                return null;
            return sanitized;
        }
    }

    /* ================================================================
     *  Transport 传输层 —— sendBeacon / XHR / Image 三种上报方式
     * ================================================================ */
    /** navigator.sendBeacon */
    function sendByBeacon(url, payload) {
        if (!navigator.sendBeacon)
            return false;
        const blob = new Blob([safeStringify(payload)], { type: 'application/json' });
        return navigator.sendBeacon(url, blob);
    }
    /** XMLHttpRequest */
    function sendByXHR(url, payload, timeout = 5000) {
        return new Promise((resolve) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', url, true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.timeout = timeout;
            xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
            xhr.onerror = () => resolve(false);
            xhr.ontimeout = () => resolve(false);
            xhr.send(safeStringify(payload));
        });
    }
    /** Image 打点（仅支持少量数据，用于降级） */
    function sendByImage(url, payload) {
        return new Promise((resolve) => {
            const img = new Image();
            const query = `data=${encodeURIComponent(safeStringify(payload))}`;
            const sep = url.includes('?') ? '&' : '?';
            img.src = `${url}${sep}${query}`;
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            // 超时兜底
            setTimeout(() => resolve(false), 3000);
        });
    }
    /**
     * 按优先级尝试传输：sendBeacon → XHR → Image
     */
    async function transport(url, payload, preference = [
        exports.TransportType.BEACON,
        exports.TransportType.XHR,
        exports.TransportType.IMAGE,
    ]) {
        for (const method of preference) {
            switch (method) {
                case exports.TransportType.BEACON: {
                    const ok = sendByBeacon(url, payload);
                    if (ok)
                        return { success: true, method };
                    break;
                }
                case exports.TransportType.XHR: {
                    const ok = await sendByXHR(url, payload);
                    if (ok)
                        return { success: true, method };
                    break;
                }
                case exports.TransportType.IMAGE: {
                    const ok = await sendByImage(url, payload);
                    if (ok)
                        return { success: true, method };
                    break;
                }
            }
        }
        return { success: false, method: preference[preference.length - 1] };
    }

    /* ================================================================
     *  Reporter 上报层 —— 批量合并 / 队列管理 / 重试 / 降级
     * ================================================================ */
    // ---- 事件队列 ----
    class EventQueue {
        constructor() {
            this.queue = [];
        }
        push(events) {
            if (Array.isArray(events)) {
                this.queue.push(...events);
            }
            else {
                this.queue.push(events);
            }
        }
        drain(batchSize) {
            if (this.queue.length <= batchSize) {
                const batch = this.queue.splice(0);
                return batch;
            }
            return this.queue.splice(0, batchSize);
        }
        get size() {
            return this.queue.length;
        }
        clear() {
            this.queue = [];
        }
    }
    class RetryManager {
        constructor(maxRetries) {
            this.tasks = [];
            this.maxRetries = maxRetries;
        }
        enqueue(payload) {
            this.tasks.push({ payload, retries: 0 });
        }
        /** 取出需要重试的任务 */
        drain() {
            const retryable = this.tasks.filter((t) => t.retries < this.maxRetries);
            this.tasks = this.tasks.filter((t) => t.retries >= this.maxRetries);
            return retryable;
        }
        get pending() {
            return this.tasks.length;
        }
    }
    class Reporter {
        constructor(config) {
            this.flushTimer = null;
            this.flushing = false;
            this.config = config;
            this.eventQueue = new EventQueue();
            this.retryManager = new RetryManager(config.maxRetries);
        }
        /** 启动定时批量上报 */
        start() {
            this.flushTimer = setInterval(() => {
                this.flush();
            }, this.config.batchInterval);
        }
        /** 停止定时器 */
        stop() {
            if (this.flushTimer) {
                clearInterval(this.flushTimer);
                this.flushTimer = null;
            }
            // 页面关闭前兜底上报
            this.flush();
        }
        /** 添加事件 */
        add(event) {
            this.eventQueue.push(event);
            // 达到批量上限立即触发上报
            if (this.eventQueue.size >= this.config.batchMaxSize) {
                this.flush();
            }
        }
        /** 批量上报 */
        async flush() {
            var _a, _b;
            if (this.flushing)
                return;
            this.flushing = true;
            try {
                // 1. 先处理重试队列
                const retryTasks = this.retryManager.drain();
                for (const task of retryTasks) {
                    const result = await transport(this.config.reportUrl, task.payload, this.config.transportPreference);
                    if (!result.success) {
                        task.retries++;
                        if (task.retries < this.config.maxRetries) {
                            this.retryManager.enqueue(task.payload);
                        }
                    }
                }
                // 2. 处理新事件
                const batch = this.eventQueue.drain(this.config.batchMaxSize);
                if (batch.length === 0)
                    return;
                const payload = {
                    appId: this.config.appId,
                    events: batch,
                    sendTime: Date.now(),
                };
                (_b = (_a = this.config).onFlush) === null || _b === void 0 ? void 0 : _b.call(_a, payload);
                const result = await transport(this.config.reportUrl, payload, this.config.transportPreference);
                if (!result.success) {
                    this.retryManager.enqueue(payload);
                }
            }
            finally {
                this.flushing = false;
            }
        }
        /** 页面卸载时立即发送（使用 sendBeacon） */
        unloadFlush() {
            const batch = this.eventQueue.drain(this.config.batchMaxSize);
            if (batch.length === 0)
                return;
            const payload = {
                appId: this.config.appId,
                events: batch,
                sendTime: Date.now(),
            };
            transport(this.config.reportUrl, payload, [exports.TransportType.BEACON]);
        }
    }

    /* ================================================================
     *  Monitor 核心调度器 —— 协调各层的启动/停止和事件流转
     * ================================================================ */
    /** 默认配置 */
    function defaultConfig() {
        return {
            appId: '',
            reportUrl: '',
            appVersion: '0.0.0',
            debug: false,
            sampleRate: 1,
            enablePerformance: true,
            enableBehavior: true,
            enableResource: true,
            maxDuplicateErrors: 5,
            batchMaxSize: 10,
            batchInterval: 5000,
            maxRetries: 3,
            transportPreference: [
                exports.TransportType.BEACON,
                exports.TransportType.XHR,
                exports.TransportType.IMAGE,
            ],
            sensitiveFields: ['password', 'token', 'secret', 'phone', 'idCard'],
        };
    }
    class Monitor {
        constructor(config) {
            // 用户 & 公共参数
            this.userInfo = {};
            this.commonParams = {};
            // 运行状态
            this.started = false;
            this.config = { ...defaultConfig(), ...config };
            // 确保必填字段
            if (!this.config.appId) {
                throw new Error('[Monitor] appId is required');
            }
            if (!this.config.reportUrl) {
                throw new Error('[Monitor] reportUrl is required');
            }
            // 初始化各层
            this.errorCollector = new ErrorCollector(this.config);
            this.performanceCollector = new PerformanceCollector(this.config);
            this.behaviorCollector = new BehaviorCollector(this.config);
            this.resourceCollector = new ResourceCollector(this.config);
            this.processor = new ProcessorPipeline(this.config);
            this.reporter = new Reporter({
                reportUrl: this.config.reportUrl,
                appId: this.config.appId,
                batchMaxSize: this.config.batchMaxSize,
                batchInterval: this.config.batchInterval,
                maxRetries: this.config.maxRetries,
                transportPreference: this.config.transportPreference,
                onFlush: (payload) => {
                    if (this.config.debug) {
                        console.log('[Monitor] Flushing', payload.events.length, 'events');
                    }
                },
            });
        }
        /** 启动所有采集器 */
        start() {
            if (this.started)
                return;
            this.started = true;
            const onEvent = (event) => this.handleEvent(event);
            // 错误采集（始终开启）
            this.errorCollector.start(onEvent);
            // 性能采集
            if (this.config.enablePerformance) {
                this.performanceCollector.start(onEvent);
            }
            // 行为采集
            if (this.config.enableBehavior) {
                this.behaviorCollector.start(onEvent);
            }
            // 资源采集
            if (this.config.enableResource) {
                this.resourceCollector.start(onEvent);
            }
            // 启动定时上报
            this.reporter.start();
            // 页面卸载时兜底上报
            window.addEventListener('beforeunload', () => {
                this.reporter.unloadFlush();
            });
            // 页面隐藏时（移动端）也进行上报
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') {
                    this.reporter.flush();
                }
            });
            if (this.config.debug) {
                console.log('[Monitor] Started with config:', this.config);
            }
        }
        /** 停止所有采集 */
        stop() {
            this.errorCollector.stop();
            this.performanceCollector.stop();
            this.behaviorCollector.stop();
            this.resourceCollector.stop();
            this.reporter.stop();
            this.started = false;
        }
        /** 内部事件处理入口 */
        handleEvent(rawEvent) {
            // 1. 注入用户信息和公共参数
            const enriched = this.enrichEvent(rawEvent);
            // 2. 执行 beforeReport 钩子
            let event = enriched;
            if (this.config.beforeReport) {
                const result = this.config.beforeReport(event);
                if (result === null)
                    return; // 钩子返回 null 则丢弃
                event = result;
            }
            // 3. 处理管道（采样 / 脱敏 / 去重）
            const processed = this.processor.process(event);
            if (!processed)
                return;
            // 4. 调试模式打印
            if (this.config.debug) {
                console.log('[Monitor] Event collected:', processed.eventType, processed);
            }
            // 5. 加入上报队列
            this.reporter.add(processed);
        }
        /** 注入用户信息和公共参数 */
        enrichEvent(event) {
            return {
                ...event,
                userInfo: { ...this.userInfo },
                commonParams: { ...this.commonParams },
            };
        }
        /** 设置用户信息 */
        setUser(user) {
            this.userInfo = { ...this.userInfo, ...user };
        }
        /** 设置公共参数（会附加到每个事件） */
        setCommonParams(params) {
            this.commonParams = { ...this.commonParams, ...params };
        }
        /** 手动埋点 */
        track(name, data) {
            const event = {
                eventId: generateId(),
                eventType: exports.EventType.CUSTOM,
                timestamp: timestamp(),
                appId: this.config.appId,
                appVersion: this.config.appVersion,
                pageUrl: getPageUrl(),
                name,
                data,
            };
            this.handleEvent(event);
        }
        /** 手动上报 PV（用于 SPA 路由切换） */
        trackPageView(pageUrl) {
            this.behaviorCollector.trackPageView(pageUrl);
        }
    }

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
    function createMonitor(config) {
        const monitor = new Monitor(config);
        monitor.start();
        const instance = {
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
    function parseBool(value, fallback) {
        if (value === undefined)
            return fallback;
        return value !== 'false' && value !== '0';
    }
    function parseNum(value, fallback) {
        if (value === undefined)
            return fallback;
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }
    function getScriptConfig(script) {
        if (!script)
            return {};
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
    function tryAutoInit() {
        // document.currentScript 仅对同步 script 标签有效（UMD 场景）
        const script = document.currentScript;
        if (!script)
            return;
        const rawConfig = getScriptConfig(script);
        if (!rawConfig.appId || !rawConfig.reportUrl)
            return;
        try {
            createMonitor(rawConfig);
        }
        catch (err) {
            // 初始化失败不阻塞页面
            console.error('[Monitor] Auto-init failed:', err);
        }
    }
    // 等 DOM 就绪后尝试自动初始化（确保 data 属性已解析）
    if (typeof document !== 'undefined' &&
        typeof window !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', tryAutoInit);
        }
        else {
            tryAutoInit();
        }
    }

    exports.Monitor = Monitor;
    exports.createMonitor = createMonitor;

}));
//# sourceMappingURL=monitor.umd.js.map
