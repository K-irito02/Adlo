/**
 * Theme controller.
 *
 * - The Tauri backend owns persisted theme mode (light/dark/system) via the
 *   typed bridge. The WebView reads it through `window.digitalLife.app`.
 * - When `themeMode === "system"`, the renderer follows
 *   `prefers-color-scheme`. Otherwise the explicit choice wins.
 *
 * The controller is plain TypeScript (no framework dependency) and is
 * unit testable: pass an alternative `MediaQueryList` when
 * constructing it for tests.
 */

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function resolveThemeMode(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (mode === 'system') {
    return prefersDark ? 'dark' : 'light';
  }
  return mode;
}

export interface ThemeControllerOptions {
  /** DOM element that receives `data-theme`. */
  root?: HTMLElement;
  /** `prefers-color-scheme: dark` media query (defaults to `window.matchMedia`). */
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
    this.currentResolvedTheme = this.systemDarkQuery?.matches ? 'dark' : 'light';

    this.handleSystemChange = () => {
      if (this.currentThemeMode === 'system') {
        this.applyResolvedTheme(this.systemDarkQuery?.matches ? 'dark' : 'light');
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

  /** Update both the explicit theme mode and (optionally) the resolved theme. */
  setTheme(input: { mode?: ThemeMode; resolvedTheme?: ResolvedTheme }): ThemeState {
    if (input.mode && input.mode !== this.currentThemeMode) {
      this.currentThemeMode = input.mode;
    }

    const nextResolved =
      input.resolvedTheme ??
      (this.currentThemeMode === 'system'
        ? this.systemDarkQuery?.matches
          ? 'dark'
          : 'light'
        : this.currentThemeMode);

    this.applyResolvedTheme(nextResolved);
    return this.getState();
  }

  /** Force re-apply attributes to the root element. */
  hydrate(): ThemeState {
    this.applyToRoot();
    return this.getState();
  }

  private applyResolvedTheme(resolved: ResolvedTheme): void {
    if (resolved === this.currentResolvedTheme) {
      this.applyToRoot();
      this.emit();
      return;
    }

    this.currentResolvedTheme = resolved;
    this.applyToRoot();
    this.emit();
  }

  private applyToRoot(): void {
    if (!this.root) {
      return;
    }
    this.root.dataset.theme = this.currentResolvedTheme;
    this.root.style.colorScheme = this.currentResolvedTheme;
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
