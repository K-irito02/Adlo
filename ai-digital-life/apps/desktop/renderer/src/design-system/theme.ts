/**
 * Theme controller.
 *
 * - The Main process owns persisted theme mode (light/dark/system) via the
 *   IPC bridge. The renderer reads it through `window.digitalLife.app`.
 * - Color scheme (1..5) is a renderer-only preference persisted to
 *   `localStorage`, because Phase 0 main config does not yet model it.
 * - When `themeMode === "system"`, the renderer follows
 *   `prefers-color-scheme`. Otherwise the explicit choice wins.
 *
 * The controller is plain TypeScript (no framework dependency) and is
 * unit testable: pass an alternative `Storage`/`MediaQueryList` when
 * constructing it for tests.
 */

export type ColorScheme = "scheme-1" | "scheme-2" | "scheme-3" | "scheme-4" | "scheme-5";
export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const COLOR_SCHEMES: ColorScheme[] = [
  "scheme-1",
  "scheme-2",
  "scheme-3",
  "scheme-4",
  "scheme-5"
];

export interface ColorSchemeMeta {
  id: ColorScheme;
  zhName: string;
  enName: string;
  accentLight: string;
  accentDark: string;
}

export const COLOR_SCHEME_META: ColorSchemeMeta[] = [
  { id: "scheme-1", zhName: "炭黑甜酷粉", enName: "Charcoal Pink", accentLight: "#e6397c", accentDark: "#ff5b9b" },
  { id: "scheme-2", zhName: "云白靛蓝", enName: "Cloud Indigo", accentLight: "#2563eb", accentDark: "#93c5fd" },
  { id: "scheme-3", zhName: "藤紫钛啡绿", enName: "Wisteria Green", accentLight: "#5e55a2", accentDark: "#a59ce6" },
  { id: "scheme-4", zhName: "无白茶花红", enName: "Camellia Red", accentLight: "#e72d48", accentDark: "#ff6f8a" },
  { id: "scheme-5", zhName: "捣蓝清水蓝", enName: "Indigo Cyan", accentLight: "#113056", accentDark: "#91cfd5" }
];

const STORAGE_KEY = "ai-digital-life:color-scheme";

export function isColorScheme(value: unknown): value is ColorScheme {
  return typeof value === "string" && (COLOR_SCHEMES as string[]).includes(value);
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

export function resolveThemeMode(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (mode === "system") {
    return prefersDark ? "dark" : "light";
  }
  return mode;
}

export interface ThemeControllerOptions {
  /** DOM element that receives `data-theme` and `data-color-scheme`. */
  root?: HTMLElement;
  /** Storage layer (defaults to `window.localStorage`). Pass a stub in tests. */
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  /** `prefers-color-scheme: dark` media query (defaults to `window.matchMedia`). */
  systemDarkQuery?: MediaQueryList | null;
  /** Initial color scheme used when storage is empty. */
  defaultColorScheme?: ColorScheme;
}

export interface ThemeState {
  colorScheme: ColorScheme;
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
}

export type ThemeChangeListener = (state: ThemeState) => void;

export class ThemeController {
  private readonly root: HTMLElement | undefined;
  private readonly storage: Pick<Storage, "getItem" | "setItem"> | null;
  private readonly systemDarkQuery: MediaQueryList | null;
  private readonly listeners = new Set<ThemeChangeListener>();

  private currentColorScheme: ColorScheme;
  private currentThemeMode: ThemeMode = "system";
  private currentResolvedTheme: ResolvedTheme = "light";
  private readonly handleSystemChange: () => void;

  constructor(options: ThemeControllerOptions = {}) {
    this.root = options.root ?? (typeof document !== "undefined" ? document.documentElement : undefined);
    this.storage =
      options.storage === undefined && typeof window !== "undefined" ? window.localStorage : (options.storage ?? null);
    this.systemDarkQuery =
      options.systemDarkQuery === undefined && typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : (options.systemDarkQuery ?? null);
    this.currentColorScheme = this.readStoredColorScheme(options.defaultColorScheme ?? "scheme-2");
    this.currentResolvedTheme = this.systemDarkQuery?.matches ? "dark" : "light";

    this.handleSystemChange = () => {
      if (this.currentThemeMode === "system") {
        this.applyResolvedTheme(this.systemDarkQuery?.matches ? "dark" : "light");
      }
    };

    this.systemDarkQuery?.addEventListener?.("change", this.handleSystemChange);
  }

  /** Detach system listeners (call from tests / window unload). */
  dispose(): void {
    this.systemDarkQuery?.removeEventListener?.("change", this.handleSystemChange);
    this.listeners.clear();
  }

  getState(): ThemeState {
    return {
      colorScheme: this.currentColorScheme,
      themeMode: this.currentThemeMode,
      resolvedTheme: this.currentResolvedTheme
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
      (this.currentThemeMode === "system"
        ? this.systemDarkQuery?.matches
          ? "dark"
          : "light"
        : this.currentThemeMode);

    this.applyResolvedTheme(nextResolved);
    return this.getState();
  }

  setColorScheme(scheme: ColorScheme): ThemeState {
    if (!isColorScheme(scheme) || scheme === this.currentColorScheme) {
      return this.getState();
    }

    this.currentColorScheme = scheme;
    this.persistColorScheme(scheme);
    this.applyToRoot();
    this.emit();
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
    if (!this.root) return;
    this.root.dataset.colorScheme = this.currentColorScheme;
    this.root.dataset.theme = this.currentResolvedTheme;
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

  private readStoredColorScheme(fallback: ColorScheme): ColorScheme {
    if (!this.storage) return fallback;
    try {
      const stored = this.storage.getItem(STORAGE_KEY);
      return isColorScheme(stored) ? stored : fallback;
    } catch {
      return fallback;
    }
  }

  private persistColorScheme(scheme: ColorScheme): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, scheme);
    } catch {
      // localStorage may be disabled (private mode); ignore.
    }
  }
}
