/**
 * Theme controller — 单一主题解析真源。
 *
 * 设计原则：
 * - 应用内用户选择的主题（light/dark/system）优先于 OS 系统偏好
 * - localStorage 缓存 themeMode + resolvedTheme，供 index.html 内联脚本在
 *   HTML 解析阶段同步读取，消除启动闪烁
 * - ThemeController 是前端唯一的主题状态持有者，所有主题变更必须通过 setTheme
 *
 * 数据流：
 *   index.html 内联脚本（同步读 localStorage，设置 data-theme + colorScheme）
 *     → ThemeController 构造函数（读 localStorage 初始化状态，不写 DOM）
 *     → useThemeSync（appInfo 加载后用后端 themeMode 调 setTheme）
 *     → setTheme → syncRoot（写 data-theme + colorScheme + localStorage）
 *
 * localStorage keys：
 *   - adl-theme-mode: 'light' | 'dark' | 'system'（用户选择的主题模式）
 *   - adl-resolved-theme: 'light' | 'dark'（已解析的实际主题）
 */

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const LS_KEY_MODE = 'adl-theme-mode';
const LS_KEY_RESOLVED = 'adl-resolved-theme';

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** 根据 mode 和 OS 偏好解析出实际主题。 */
export function resolveThemeMode(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (mode === 'system') {
    return prefersDark ? 'dark' : 'light';
  }
  return mode;
}

/** 检测 OS 系统是否偏好暗色主题。 */
export function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? false)
  );
}

export interface ThemeControllerOptions {
  /** DOM element that receives `data-theme`. */
  root?: HTMLElement;
  /** `prefers-color-scheme: dark` media query（测试时可注入 mock）。 */
  systemDarkQuery?: MediaQueryList | null;
}

export interface ThemeState {
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
}

export type ThemeChangeListener = (state: ThemeState) => void;

export class ThemeController {
  private readonly root: HTMLElement | undefined;
  private readonly systemDarkQuery: MediaQueryList | null;
  private readonly listeners = new Set<ThemeChangeListener>();

  private currentThemeMode: ThemeMode = 'system';
  private currentResolvedTheme: ResolvedTheme = 'light';
  private readonly handleSystemChange: () => void;

  constructor(options: ThemeControllerOptions = {}) {
    this.root =
      options.root ?? (typeof document !== 'undefined' ? document.documentElement : undefined);
    this.systemDarkQuery =
      options.systemDarkQuery === undefined &&
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : (options.systemDarkQuery ?? null);

    // 优先从 localStorage 读取缓存的 themeMode 和 resolvedTheme（与 index.html 内联脚本一致）。
    // 构造函数只初始化状态，不写 DOM——DOM 已由内联脚本设置。
    const cachedMode = readLocalStorage(LS_KEY_MODE, isThemeMode);
    const cachedResolved = readLocalStorage(LS_KEY_RESOLVED, isResolvedTheme);

    if (cachedMode) {
      this.currentThemeMode = cachedMode;
    }
    if (cachedResolved) {
      this.currentResolvedTheme = cachedResolved;
    } else if (cachedMode && cachedMode !== 'system') {
      this.currentResolvedTheme = cachedMode;
    } else {
      this.currentResolvedTheme = this.systemDarkQuery?.matches ? 'dark' : 'light';
    }

    this.handleSystemChange = () => {
      if (this.currentThemeMode !== 'system') {
        return;
      }
      const newResolved = this.systemDarkQuery?.matches ? 'dark' : 'light';
      if (newResolved !== this.currentResolvedTheme) {
        this.currentResolvedTheme = newResolved;
        this.syncRoot();
        this.emit();
      }
    };

    this.systemDarkQuery?.addEventListener?.('change', this.handleSystemChange);
  }

  /** Detach system listeners (call from tests / window unload). */
  dispose(): void {
    this.systemDarkQuery?.removeEventListener?.('change', this.handleSystemChange);
    this.listeners.clear();
  }

  getState(): ThemeState {
    return {
      themeMode: this.currentThemeMode,
      resolvedTheme: this.currentResolvedTheme,
    };
  }

  /** Subscribe to theme state updates. Returns an unsubscribe callback. */
  subscribe(listener: ThemeChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * 更新主题模式并重新解析。
   *
   * 如果 mode === 'system'，根据 OS 偏好解析；
   * 否则直接使用 mode 作为 resolvedTheme。
   * 应用内用户选择优先：即使 OS 是 dark，用户选 light 就用 light。
   *
   * 只在 mode 或 resolvedTheme 实际变化时才同步 DOM + localStorage 并通知监听器。
   */
  setTheme(input: { mode?: ThemeMode; resolvedTheme?: ResolvedTheme }): ThemeState {
    const prevMode = this.currentThemeMode;
    const prevResolved = this.currentResolvedTheme;

    if (input.mode && input.mode !== prevMode) {
      this.currentThemeMode = input.mode;
    }

    this.currentResolvedTheme =
      input.resolvedTheme ??
      (this.currentThemeMode === 'system'
        ? this.systemDarkQuery?.matches
          ? 'dark'
          : 'light'
        : this.currentThemeMode);

    if (this.currentThemeMode === prevMode && this.currentResolvedTheme === prevResolved) {
      return this.getState();
    }

    this.syncRoot();
    this.emit();

    return this.getState();
  }

  /** Sync DOM attributes and localStorage with current state (no emit). */
  private syncRoot(): void {
    if (!this.root) {
      return;
    }
    this.root.dataset.theme = this.currentResolvedTheme;
    this.root.style.colorScheme = this.currentResolvedTheme;
    this.root.classList.toggle('dark', this.currentResolvedTheme === 'dark');
    try {
      localStorage.setItem(LS_KEY_MODE, this.currentThemeMode);
      localStorage.setItem(LS_KEY_RESOLVED, this.currentResolvedTheme);
    } catch {
      // localStorage 不可用时忽略
    }
  }

  private emit(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        // listener errors must not corrupt the controller
      }
    }
  }
}

/** 读取 localStorage 并验证值，无效时返回 null。 */
function readLocalStorage<T>(key: string, validate: (v: unknown) => v is T): T | null {
  try {
    const v = localStorage.getItem(key);
    if (v !== null && validate(v)) {
      return v;
    }
  } catch {
    // localStorage 不可用时忽略
  }
  return null;
}

function isResolvedTheme(value: unknown): value is ResolvedTheme {
  return value === 'dark' || value === 'light';
}
