export const BROWSER_NAVIGATOR_COLLAPSED_KEY = 'adl-ui:navigator-collapsed';

/**
 * localStorage 惰性水合的回退延迟（毫秒）。
 *
 * 当 requestIdleCallback 不可用时（如 jsdom 测试环境），
 * 各 slice 使用此延迟通过 setTimeout 执行水合，避免阻塞首屏渲染。
 */
export const STORAGE_HYDRATION_DELAY_MS = 200;
