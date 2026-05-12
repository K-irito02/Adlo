import { ViewPlugin, type PluginValue, EditorView, ViewUpdate } from "@codemirror/view";
import { type Extension, StateField, StateEffect } from "@codemirror/state";
import type { AgentHunkDecoration } from "./agentDecorations";
import type { PreviewDiffVisualRange, PreviewDiffVisualTone } from "./changePreviewDiffRanges";

export interface MinimapSettings {
  renderCharacters: boolean;
  thumbnailSize: number;
  zoomLevel: number;
  sliderProminence: "subtle" | "normal";
  scrollbarType: "minimap" | "standard";
  isGlobal: boolean;
}

const DEFAULT_MINIMAP_SETTINGS: MinimapSettings = {
  renderCharacters: false,
  thumbnailSize: 80,
  zoomLevel: 1,
  sliderProminence: "normal",
  scrollbarType: "minimap",
  isGlobal: true,
};

const STORAGE_KEY = "adl-minimap-settings";
const SCOPED_STORAGE_KEY = "adl-minimap-settings-scoped";
const SETTINGS_CHANGED_EVENT = "adl-minimap-settings-changed";
const FIXED_SLIDER_HEIGHT = 96;
const STANDARD_SCROLLBAR_WIDTH = 12;
const MINIMAP_MENU_ROOT_ID = "adl-cm-minimap-context-menu-root";

type MinimapSettingsInput = Partial<MinimapSettings> & {
  scrollbarType?: MinimapSettings["scrollbarType"] | "native";
  sliderBehavior?: "proportional" | "fixed";
};

type ScopedSettingsStore = Record<string, MinimapSettingsInput | undefined>;
type MinimapMenuCleanup = () => void;
type MenuItem = { label: string; checked: boolean; onClick: () => void; separator?: boolean };

let activeMinimapMenuCleanup: MinimapMenuCleanup | null = null;

function parseStoredSettings(raw: string | null): MinimapSettingsInput | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function readScopedSettingsStore(): ScopedSettingsStore {
  try {
    const raw = localStorage.getItem(SCOPED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeScopedSettingsStore(store: ScopedSettingsStore): void {
  try {
    localStorage.setItem(SCOPED_STORAGE_KEY, JSON.stringify(store));
  } catch {}
}

function closeActiveMinimapMenu(): void {
  activeMinimapMenuCleanup?.();
  activeMinimapMenuCleanup = null;
}

function readGlobalMinimapSettings(): MinimapSettings {
  try {
    return normalizeMinimapSettings(parseStoredSettings(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return { ...DEFAULT_MINIMAP_SETTINGS };
  }
}

function sanitizeNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? clamp(value, min, max)
    : fallback;
}

function normalizeMinimapSettings(input: MinimapSettingsInput | null | undefined): MinimapSettings {
  const merged = { ...DEFAULT_MINIMAP_SETTINGS, ...(input ?? {}) };
  const scrollbarType = merged.scrollbarType === "native"
    ? "standard"
    : merged.scrollbarType === "standard" || merged.scrollbarType === "minimap"
      ? merged.scrollbarType
      : DEFAULT_MINIMAP_SETTINGS.scrollbarType;
  const sliderProminence =
    merged.sliderProminence === "subtle" || merged.sliderProminence === "normal"
      ? merged.sliderProminence
      : DEFAULT_MINIMAP_SETTINGS.sliderProminence;

  return {
    renderCharacters: Boolean(merged.renderCharacters),
    thumbnailSize: sanitizeNumber(merged.thumbnailSize, DEFAULT_MINIMAP_SETTINGS.thumbnailSize, 60, 100),
    zoomLevel: sanitizeNumber(merged.zoomLevel, DEFAULT_MINIMAP_SETTINGS.zoomLevel, 0.5, 2),
    sliderProminence,
    scrollbarType,
    isGlobal: merged.isGlobal !== false,
  };
}

export function loadMinimapSettings(scopeId?: string): MinimapSettings {
  const globalSettings = readGlobalMinimapSettings();
  if (!scopeId) return globalSettings;

  const scopedSettings = readScopedSettingsStore()[scopeId];
  if (!scopedSettings) return globalSettings;

  const normalizedScoped = normalizeMinimapSettings({ ...globalSettings, ...scopedSettings });
  return normalizedScoped.isGlobal ? globalSettings : normalizedScoped;
}

export function saveMinimapSettings(settings: MinimapSettings, scopeId?: string): void {
  const normalized = normalizeMinimapSettings(settings);
  if (scopeId && !normalized.isGlobal) {
    const store = readScopedSettingsStore();
    store[scopeId] = normalized;
    writeScopedSettingsStore(store);
    return;
  }

  if (scopeId) {
    const store = readScopedSettingsStore();
    delete store[scopeId];
    writeScopedSettingsStore(store);
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...normalized, isGlobal: true }));
  } catch {}
}

export const setMinimapDiffHunks = StateEffect.define<AgentHunkDecoration[]>();
export const setMinimapDiffModel = StateEffect.define<CmMinimapDiffModel | null>();

export type CmMinimapDiffRange = PreviewDiffVisualRange;

export type CmMinimapDiffModel = {
  ranges: CmMinimapDiffRange[];
  totalLines: number;
  lineColumns?: number[];
};

export type CmMinimapDiffSegment = {
  type: "insert" | "delete";
  tone: PreviewDiffVisualTone;
  contentColumns: number;
  lane: number;
  laneCount: number;
};

export type CmMinimapExtensionOptions = {
  onDragStart?: () => void;
  onScroll?: (scrollTop: number) => void;
  scrollElement?: () => HTMLElement | null;
  scopeId?: string;
};

export type MinimapSliderMetricsInput = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  trackHeight: number;
  contentTopInset?: number;
  contentBottomInset?: number;
  minHeight?: number;
  sliderBehavior?: "proportional" | "fixed";
  fixedHeight?: number;
};

export type MinimapSliderMetrics = {
  visible: boolean;
  top: number;
  height: number;
};

export type MinimapDragInput = {
  pointerY: number;
  trackTop: number;
  dragOffsetY: number;
  trackHeight: number;
  sliderHeight: number;
  contentScrollHeight: number;
  contentViewportHeight: number;
};

export type MinimapContentMetricsInput = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  contentTopInset?: number;
  contentBottomInset?: number;
};

export type MinimapContentMetrics = {
  contentTopInset: number;
  contentBottomInset: number;
  contentScrollHeight: number;
  contentViewportHeight: number;
  contentScrollTop: number;
};

export type MinimapRenderMetricsInput = {
  lineCount: number;
  containerHeight: number;
  maxLineHeight?: number;
};

export type MinimapRenderMetrics = {
  renderHeight: number;
  lineHeight: number;
};

export type MinimapContentTrackMetricsInput = {
  viewportHeight: number;
  contentScrollHeight: number;
  contentViewportHeight: number;
  contentScrollTop: number;
  fixedSliderHeight: number;
  naturalContentHeight: number;
};

export type MinimapContentTrackMetrics = {
  contentHeight: number;
  contentOffset: number;
};

type MinimapTrackMetrics = {
  top: number;
  viewportHeight: number;
  trackHeight: number;
  contentHeight: number;
  contentOffset: number;
  fixedSliderHeight: number;
};

type MinimapRenderedLineMetric = {
  top: number;
  height: number;
  contentColumns: number;
  lineNumber: number;
};

const DIFF_SEGMENT_ORDER: Record<CmMinimapDiffSegment["type"], number> = {
  delete: 0,
  insert: 1,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

export function measureMinimapContentMetrics(input: MinimapContentMetricsInput): MinimapContentMetrics {
  const scrollTop = Math.max(input.scrollTop, 0);
  const scrollHeight = Math.max(input.scrollHeight, 0);
  const clientHeight = Math.max(input.clientHeight, 0);
  const contentTopInset = Math.max(0, input.contentTopInset ?? 0);
  const contentBottomInset = Math.max(0, input.contentBottomInset ?? 0);
  const contentScrollHeight = Math.max(0, scrollHeight - contentTopInset - contentBottomInset);
  const visibleStart = clamp(scrollTop - contentTopInset, 0, contentScrollHeight);
  const visibleEnd = clamp(scrollTop + clientHeight - contentTopInset, 0, contentScrollHeight);
  return {
    contentTopInset,
    contentBottomInset,
    contentScrollHeight,
    contentViewportHeight: Math.max(0, visibleEnd - visibleStart),
    contentScrollTop: visibleStart,
  };
}

export function toDomScrollTop(contentScrollTop: number, metrics: Pick<MinimapContentMetrics, "contentScrollHeight" | "contentViewportHeight" | "contentTopInset">): number {
  const maxContentScrollTop = Math.max(0, metrics.contentScrollHeight - metrics.contentViewportHeight);
  const clampedContentScrollTop = clamp(contentScrollTop, 0, maxContentScrollTop);
  return clampedContentScrollTop <= 0 ? 0 : clampedContentScrollTop + metrics.contentTopInset;
}

export function computeMinimapSliderMetrics(input: MinimapSliderMetricsInput): MinimapSliderMetrics {
  const minHeight = input.minHeight ?? 20;
  const trackHeight = Math.max(input.trackHeight, 0);
  const contentMetrics = measureMinimapContentMetrics({
    scrollTop: input.scrollTop,
    scrollHeight: input.scrollHeight,
    clientHeight: input.clientHeight,
    contentTopInset: input.contentTopInset,
    contentBottomInset: input.contentBottomInset,
  });
  if (contentMetrics.contentScrollHeight <= contentMetrics.contentViewportHeight || contentMetrics.contentViewportHeight <= 0 || trackHeight <= 0) {
    return { visible: false, top: 0, height: 0 };
  }

  const maxScrollTop = contentMetrics.contentScrollHeight - contentMetrics.contentViewportHeight;
  const rawHeight = input.sliderBehavior === "fixed"
    ? input.fixedHeight ?? FIXED_SLIDER_HEIGHT
    : (contentMetrics.contentViewportHeight / contentMetrics.contentScrollHeight) * trackHeight;
  const height = clamp(rawHeight, Math.min(minHeight, trackHeight), trackHeight);
  const maxTop = Math.max(0, trackHeight - height);
  const top = maxScrollTop <= 0 ? 0 : (contentMetrics.contentScrollTop / maxScrollTop) * maxTop;
  return {
    visible: true,
    top,
    height,
  };
}

export function computeMinimapScrollTopFromPointer(input: MinimapDragInput): number {
  const maxScrollTop = Math.max(0, input.contentScrollHeight - input.contentViewportHeight);
  const trackTravel = Math.max(1, input.trackHeight - input.sliderHeight);
  const sliderTop = clamp(input.pointerY - input.trackTop - input.dragOffsetY, 0, trackTravel);
  return (sliderTop / trackTravel) * maxScrollTop;
}

export function computeMinimapRenderMetrics(input: MinimapRenderMetricsInput): MinimapRenderMetrics {
  const lineCount = Math.max(1, input.lineCount);
  const containerHeight = Math.max(1, input.containerHeight);
  const maxLineHeight = input.maxLineHeight ?? 2;
  const lineHeight = Math.min(containerHeight / lineCount, maxLineHeight);
  return {
    lineHeight,
    renderHeight: Math.min(containerHeight, lineCount * lineHeight),
  };
}

export function computeMinimapFixedSliderHeight(viewportHeight: number, zoomLevel: number): number {
  const normalizedViewportHeight = Math.max(1, viewportHeight);
  return clamp(
    FIXED_SLIDER_HEIGHT * zoomLevel,
    Math.min(48, normalizedViewportHeight),
    normalizedViewportHeight,
  );
}

export function computeMinimapContentTrackMetrics(input: MinimapContentTrackMetricsInput): MinimapContentTrackMetrics {
  const viewportHeight = Math.max(1, input.viewportHeight);
  const fixedSliderHeight = clamp(input.fixedSliderHeight, Math.min(1, viewportHeight), viewportHeight);
  const contentScrollHeight = Math.max(0, input.contentScrollHeight);
  const contentViewportHeight = Math.max(0, input.contentViewportHeight);
  const contentScrollTop = Math.max(0, input.contentScrollTop);
  const naturalContentHeight = Math.max(1, input.naturalContentHeight);
  const maxContentScrollTop = Math.max(0, contentScrollHeight - contentViewportHeight);

  if (naturalContentHeight <= viewportHeight) {
    return {
      contentHeight: naturalContentHeight,
      contentOffset: 0,
    };
  }

  if (maxContentScrollTop <= 0 || contentViewportHeight <= 0) {
    return {
      contentHeight: clamp(naturalContentHeight, 1, viewportHeight),
      contentOffset: 0,
    };
  }

  const derivedContentHeight = Math.max(
    viewportHeight,
    Math.round((fixedSliderHeight * contentScrollHeight) / contentViewportHeight),
  );
  const contentHeight = Math.max(derivedContentHeight, naturalContentHeight);
  const maxContentOffset = Math.max(0, contentHeight - viewportHeight);
  const ratio = maxContentScrollTop <= 0 ? 0 : clamp(contentScrollTop, 0, maxContentScrollTop) / maxContentScrollTop;
  return {
    contentHeight,
    contentOffset: Math.round(maxContentOffset * ratio),
  };
}

export function getMinimapDiffSegmentsForLine(model: CmMinimapDiffModel | null | undefined, line: number): CmMinimapDiffSegment[] {
  if (!model || line < 1) return [];
  const segments = model.ranges
    .filter((range) => range.startLine <= line && range.endLine >= line)
    .map<CmMinimapDiffSegment>((range) => ({
      type: range.type,
      tone: range.tone,
      contentColumns: range.contentColumns,
      lane: 0,
      laneCount: 1,
    }))
    .sort((a, b) => DIFF_SEGMENT_ORDER[a.type] - DIFF_SEGMENT_ORDER[b.type]);

  const laneCount = segments.length;
  return segments.map((segment, lane) => ({
    ...segment,
    lane,
    laneCount,
  }));
}

export function minimapHunksToDiffModel(hunks: AgentHunkDecoration[], totalLines: number): CmMinimapDiffModel {
  return {
    totalLines,
    lineColumns: undefined,
    ranges: hunks.flatMap((hunk): CmMinimapDiffRange[] => {
      const startLine = Math.max(1, hunk.startLine);
      const endLine = Math.max(startLine, hunk.endLine);
      if (hunk.changeKind === "added") {
        return [{ startLine, endLine, type: "insert", tone: "base", contentColumns: 1 }];
      }
      if (hunk.changeKind === "deleted") {
        return [{ startLine, endLine, type: "delete", tone: "base", contentColumns: 1 }];
      }
      return [
        { startLine, endLine, type: "insert", tone: "strong", contentColumns: 1 },
        { startLine, endLine, type: "delete", tone: "strong", contentColumns: 1 },
      ];
    }),
  };
}

function getVisualColumns(line: string, wrapColumn?: number | null): number[] {
  if (!wrapColumn || wrapColumn <= 0) {
    return [line.length];
  }
  const normalizedWrapColumn = Math.max(1, Math.floor(wrapColumn));
  if (line.length === 0) return [0];
  const columns: number[] = [];
  let remaining = line.length;
  while (remaining > normalizedWrapColumn) {
    columns.push(normalizedWrapColumn);
    remaining -= normalizedWrapColumn;
  }
  columns.push(remaining);
  return columns;
}

export function estimateWrapColumn(view: EditorView): number | null {
  if (!view.lineWrapping) return null;
  const charWidth = view.defaultCharacterWidth;
  const contentWidth = view.contentDOM.clientWidth;
  if (!Number.isFinite(charWidth) || charWidth <= 0 || contentWidth <= 0) return null;
  return Math.max(1, Math.floor(contentWidth / charWidth));
}

/**
 * Parse an rgba(r, g, b, alpha) string, boost the alpha channel for minimap
 * visibility (~3.5x editor alpha, capped at 0.5), and return the new rgba string.
 * Falls back to the provided fallback if parsing fails.
 */
function minimapBoostRgbaAlpha(rgbaStr: string, fallback: string): string {
  const match = rgbaStr.match(
    /rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d*\.?\d+)\s*\)/,
  );
  if (!match) return fallback;
  const [, r, g, b, alphaStr] = match;
  const alpha = parseFloat(alphaStr);
  if (!Number.isFinite(alpha)) return fallback;
  const minimapAlpha = Math.min(0.5, alpha * 3.5);
  return `rgba(${r}, ${g}, ${b}, ${minimapAlpha.toFixed(2)})`;
}

const minimapDiffModelField = StateField.define<CmMinimapDiffModel | null>({
  create: () => null,
  update: (value, tr) => {
    for (const effect of tr.effects) {
      if (effect.is(setMinimapDiffModel)) return effect.value;
      if (effect.is(setMinimapDiffHunks)) return minimapHunksToDiffModel(effect.value, tr.state.doc.lines);
    }
    return value;
  },
});

class MinimapPlugin implements PluginValue {
  private dom: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private slider: HTMLElement;
  private settings: MinimapSettings;
  private isDragging = false;
  private dragOffsetY = 0;
  private frame = 0;
  private pendingScrollTop: number | null = null;
  private diffModel: CmMinimapDiffModel | null = null;
  private host: HTMLElement;
  private scrollElement: HTMLElement;
  private notifyDragAfterRelease = false;
  private handleWheel: (e: WheelEvent) => void;
  private resizeObserver: ResizeObserver | null = null;
  private handleWindowResize = () => {
    this.syncFrameToHost();
    this.scheduleRender();
  };
  private handleSettingsChanged = () => {
    this.settings = loadMinimapSettings(this.options.scopeId);
    this.render();
    this.updateSlider();
    this.updateScrollbarStyle();
  };

  constructor(private view: EditorView, private options: CmMinimapExtensionOptions = {}) {
    this.settings = loadMinimapSettings(this.options.scopeId);

    this.dom = document.createElement("div");
    this.dom.className = "adl-cm-minimap";
    this.dom.addEventListener("contextmenu", this.handleContextMenu);

    this.canvas = document.createElement("canvas");
    this.canvas.className = "adl-cm-minimap-canvas";
    this.dom.appendChild(this.canvas);

    this.ctx = this.canvas.getContext("2d")!;

    this.slider = document.createElement("div");
    this.slider.className = "adl-cm-minimap-slider";
    this.dom.appendChild(this.slider);

    this.canvas.addEventListener("pointerdown", this.handleCanvasPointerDown);
    this.slider.addEventListener("pointerdown", this.handleSliderPointerDown);
    this.scrollElement = this.getScrollElement();
    this.scrollElement.addEventListener("scroll", this.handleEditorScroll, { passive: true });

    this.handleWheel = (e: WheelEvent) => {
      const scrollElement = this.getScrollElement();
      const previousScrollTop = scrollElement.scrollTop;
      scrollElement.scrollTop += e.deltaY;
      if (scrollElement.scrollTop !== previousScrollTop) {
        this.options.onScroll?.(scrollElement.scrollTop);
      }
      e.preventDefault();
    };
    this.dom.addEventListener("wheel", this.handleWheel, { passive: false });

    this.host = view.dom;
    this.attachToHost();
    window.addEventListener("resize", this.handleWindowResize);
    window.addEventListener(SETTINGS_CHANGED_EVENT, this.handleSettingsChanged);
    requestAnimationFrame(() => {
      this.refreshScrollElement();
      this.attachToHost();
      this.syncFrameToHost();
      this.render();
      this.updateSlider();
    });

    this.diffModel = view.state.field(minimapDiffModelField, false) ?? null;
    this.updateScrollbarStyle();
  }

  update(update: ViewUpdate) {
    this.refreshScrollElement();
    this.attachToHost();
    const shouldRerender = update.docChanged
      || update.viewportChanged
      || update.geometryChanged
      || update.transactions.some(tr => tr.reconfigured);
    if (shouldRerender) {
      this.diffModel = update.state.field(minimapDiffModelField, false) ?? null;
      this.scheduleRender();
    }
    if (update.transactions.some(tr => tr.effects.some(e => e.is(setMinimapDiffModel) || e.is(setMinimapDiffHunks)))) {
      this.diffModel = update.state.field(minimapDiffModelField, false) ?? null;
      this.scheduleRender();
    }
  }

  private scheduleRender() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
      this.updateSlider();
    });
  }

  destroy() {
    closeActiveMinimapMenu();
    this.dom.removeEventListener("contextmenu", this.handleContextMenu);
    this.canvas.removeEventListener("pointerdown", this.handleCanvasPointerDown);
    this.slider.removeEventListener("pointerdown", this.handleSliderPointerDown);
    this.scrollElement.removeEventListener("scroll", this.handleEditorScroll);
    this.scrollElement.classList.remove("adl-cm-scroller--minimap-scrollbar");
    this.dom.removeEventListener("wheel", this.handleWheel);
    if (this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
    this.host.style.removeProperty("--adl-editor-minimap-width");
    const surfaceHost = this.findSurfaceHost();
    if (surfaceHost && surfaceHost !== this.host) {
      surfaceHost.style.removeProperty("--adl-editor-minimap-width");
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    window.removeEventListener("resize", this.handleWindowResize);
    window.removeEventListener(SETTINGS_CHANGED_EVENT, this.handleSettingsChanged);
    this.dom.remove();
  }

  private findSurfaceHost(): HTMLElement | null {
    let el: HTMLElement | null = this.view.dom;
    while (el) {
      if (el.classList.contains("adl-tool-editor__surface")) return el;
      el = el.parentElement;
    }
    return null;
  }

  /** Find the nearest ancestor that creates a containing block for position:fixed
   *  (elements with transform/perspective/filter/will-change). */
  private findFixedContainBlock(): HTMLElement | null {
    let el: HTMLElement | null = this.view.dom;
    while (el) {
      if (el.classList.contains("adl-rightpanel__content")) return el;
      el = el.parentElement;
    }
    return null;
  }

  private findRightEdgeHost(): HTMLElement | null {
    let el: HTMLElement | null = this.host;
    while (el) {
      if (
        el.classList.contains("adl-rightpanel") ||
        el.classList.contains("adl-rightpanel__content") ||
        el.classList.contains("adl-tool-panel")
      ) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  private findFrameHost(): HTMLElement {
    let el: HTMLElement | null = this.host;
    while (el) {
      if (el.classList.contains("adl-tool-editor__surface")) return el;
      if (el.classList.contains("adl-tool-surface")) return el;
      if (el.classList.contains("adl-tool-editor")) return el;
      el = el.parentElement;
    }
    return this.host;
  }

  private getScrollElement(): HTMLElement {
    return this.options.scrollElement?.() ?? this.view.scrollDOM;
  }

  private getTrackWidth(): number {
    return this.settings.scrollbarType === "standard" ? STANDARD_SCROLLBAR_WIDTH : this.settings.thumbnailSize;
  }

  private getContentElement(): HTMLElement | null {
    return this.view.contentDOM instanceof HTMLElement ? this.view.contentDOM : null;
  }

  private getContentInsets() {
    const contentElement = this.getContentElement();
    if (!contentElement) {
      return { contentTopInset: 0, contentBottomInset: 0 };
    }
    const style = getComputedStyle(contentElement);
    const parseInset = (value: string) => {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    };
    return {
      contentTopInset: parseInset(style.paddingTop),
      contentBottomInset: parseInset(style.paddingBottom),
    };
  }

  private getContentMetrics(scrollElement: HTMLElement = this.scrollElement): MinimapContentMetrics {
    const { contentTopInset, contentBottomInset } = this.getContentInsets();
    return measureMinimapContentMetrics({
      scrollTop: scrollElement.scrollTop,
      scrollHeight: scrollElement.scrollHeight,
      clientHeight: scrollElement.clientHeight,
      contentTopInset,
      contentBottomInset,
    });
  }

  private refreshScrollElement() {
    const nextScrollElement = this.getScrollElement();
    if (nextScrollElement === this.scrollElement) return;
    this.scrollElement.removeEventListener("scroll", this.handleEditorScroll);
    this.scrollElement.classList.remove("adl-cm-scroller--minimap-scrollbar");
    this.scrollElement = nextScrollElement;
    this.scrollElement.addEventListener("scroll", this.handleEditorScroll, { passive: true });
    this.updateScrollbarStyle();
    this.observeHost();
  }

  private attachToHost() {
    const surfaceHost = this.findSurfaceHost();
    // Prefer the fixed-positioning containing block as the DOM parent so the
    // minimap is never clipped by the surface's overflow:hidden / isolation:isolate.
    const fixedHost = this.findFixedContainBlock();
    const nextHost = fixedHost ?? surfaceHost ?? this.view.dom;

    if (nextHost === this.host && this.dom.parentElement === nextHost) {
      // Keep the --adl-editor-minimap-width variable on the surfaceHost so
      // .cm-scroller padding-right stays in sync per-editor.
      if (surfaceHost) {
        surfaceHost.style.setProperty("--adl-editor-minimap-width", `${this.getTrackWidth()}px`);
      }
      this.syncFrameToHost();
      return;
    }
    this.host.style.removeProperty("--adl-editor-minimap-width");
    this.host = nextHost;
    this.host.appendChild(this.dom);
    // Always set the minimap-width variable on the surfaceHost (not the DOM host)
    // so each editor's .cm-scroller gets the correct padding-right.
    if (surfaceHost) {
      surfaceHost.style.setProperty("--adl-editor-minimap-width", `${this.getTrackWidth()}px`);
    }
    this.observeHost();
    this.syncFrameToHost();
  }

  private observeHost() {
    this.resizeObserver?.disconnect();
    if (typeof ResizeObserver === "undefined") {
      this.resizeObserver = null;
      return;
    }
    this.resizeObserver = new ResizeObserver(() => {
      this.syncFrameToHost();
      this.scheduleRender();
    });
    this.resizeObserver.observe(this.host);
    const frameHost = this.findFrameHost();
    if (frameHost !== this.host) {
      this.resizeObserver.observe(frameHost);
    }
    this.resizeObserver.observe(this.scrollElement);
    const contentElement = this.getContentElement();
    if (contentElement) {
      this.resizeObserver.observe(contentElement);
    }
    // Also observe the fixed-positioning containing block so the minimap
    // recalculates when the right panel resizes or shifts.
    const fixedHost = this.findFixedContainBlock();
    if (fixedHost && fixedHost !== this.host && fixedHost !== frameHost) {
      this.resizeObserver.observe(fixedHost);
    }
  }

  private syncFrameToHost() {
    const surfaceHost = this.findSurfaceHost();
    const fixedHost = this.findFixedContainBlock();

    // Primary path: minimap lives inside .adl-rightpanel__content (fixedHost)
    // which has transform, making it the containing block for position:fixed.
    // position:fixed; right:0 guarantees the minimap always snaps to the
    // application's right edge, regardless of the surface's layout quirks.
    if (fixedHost && this.dom.parentElement === fixedHost) {
      const surfaceRect = surfaceHost?.getBoundingClientRect();
      const hostRect = fixedHost.getBoundingClientRect();

      this.dom.style.position = "fixed";
      this.dom.style.top = surfaceRect ? `${surfaceRect.top - hostRect.top}px` : "0";
      this.dom.style.right = "0";
      this.dom.style.bottom = "auto";
      this.dom.style.left = "auto";
      this.dom.style.height = surfaceRect ? `${surfaceRect.height}px` : "100%";
      return;
    }

    // Fallback: minimap is inside the surface host — use absolute positioning
    if (surfaceHost && this.dom.parentElement === surfaceHost) {
      if (fixedHost) {
        const surfaceRect = surfaceHost.getBoundingClientRect();
        const hostRect = fixedHost.getBoundingClientRect();
        this.dom.style.position = "fixed";
        this.dom.style.top = `${surfaceRect.top - hostRect.top}px`;
        this.dom.style.right = "0";
        this.dom.style.bottom = "auto";
        this.dom.style.left = "auto";
        this.dom.style.height = `${surfaceRect.height}px`;
      } else {
        this.dom.style.position = "absolute";
        this.dom.style.top = "0";
        this.dom.style.right = "0";
        this.dom.style.bottom = "0";
        this.dom.style.left = "auto";
        this.dom.style.height = "";
      }
      return;
    }

    // Last resort: viewport-relative fixed positioning
    const rect = this.findFrameHost().getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const rightEdgeRect = this.findRightEdgeHost()?.getBoundingClientRect();
    const rightEdge = rightEdgeRect?.right ?? window.innerWidth;
    this.dom.style.position = "fixed";
    this.dom.style.top = `${Math.max(0, rect.top)}px`;
    this.dom.style.right = `${Math.max(0, window.innerWidth - rightEdge)}px`;
    this.dom.style.left = "auto";
    this.dom.style.bottom = "auto";
    this.dom.style.height = `${Math.max(1, rect.height)}px`;
  }

  private getEffectiveLineCount(): number {
    const diffModel = this.diffModel;
    const hasDiffRanges = diffModel && diffModel.ranges.length > 0;
    if (hasDiffRanges && diffModel.lineColumns && diffModel.lineColumns.length > 0) {
      return diffModel.lineColumns.length;
    }
    if (hasDiffRanges && diffModel.totalLines > 0) {
      return diffModel.totalLines;
    }
    return this.getDocumentLineColumns().length || this.view.state.doc.lines;
  }

  private getDocumentLineColumns(): number[] {
    const wrapColumn = estimateWrapColumn(this.view);
    const columns: number[] = [];
    for (let lineNumber = 1; lineNumber <= this.view.state.doc.lines; lineNumber += 1) {
      columns.push(...getVisualColumns(this.view.state.doc.line(lineNumber).text, wrapColumn));
    }
    return columns;
  }

  private getFixedMinimapSliderHeight(viewportHeight: number): number {
    return computeMinimapFixedSliderHeight(viewportHeight, this.settings.zoomLevel);
  }

  private getNaturalMinimapContentHeight(viewportHeight: number): number {
    const naturalLineHeight = Math.max(1, 2 * this.settings.zoomLevel);
    return Math.max(1, this.getEffectiveLineCount() * naturalLineHeight);
  }

  private getStandardTrackMetrics(scrollElement: HTMLElement = this.scrollElement): MinimapTrackMetrics {
    const viewportHeight = Math.max(1, this.dom.clientHeight || scrollElement.clientHeight || 1);
    return {
      top: 0,
      viewportHeight,
      trackHeight: viewportHeight,
      contentHeight: viewportHeight,
      contentOffset: 0,
      fixedSliderHeight: 0,
    };
  }

  private getMinimapTrackMetrics(scrollElement: HTMLElement = this.scrollElement): MinimapTrackMetrics {
    const viewportHeight = Math.max(1, this.dom.clientHeight || scrollElement.clientHeight || 1);
    const fixedSliderHeight = this.getFixedMinimapSliderHeight(viewportHeight);
    const naturalContentHeight = this.getNaturalMinimapContentHeight(viewportHeight);
    const contentMetrics = this.getContentMetrics(scrollElement);
    const contentTrack = computeMinimapContentTrackMetrics({
      viewportHeight,
      contentScrollHeight: contentMetrics.contentScrollHeight,
      contentViewportHeight: contentMetrics.contentViewportHeight,
      contentScrollTop: contentMetrics.contentScrollTop,
      fixedSliderHeight,
      naturalContentHeight,
    });

    return {
      top: 0,
      viewportHeight,
      trackHeight: Math.min(contentTrack.contentHeight, viewportHeight),
      contentHeight: contentTrack.contentHeight,
      contentOffset: contentTrack.contentOffset,
      fixedSliderHeight,
    };
  }

  private getTrackMetrics(scrollElement: HTMLElement = this.scrollElement): MinimapTrackMetrics {
    return this.settings.scrollbarType === "standard"
      ? this.getStandardTrackMetrics(scrollElement)
      : this.getMinimapTrackMetrics(scrollElement);
  }

  private render() {
    if (this.settings.scrollbarType === "standard") {
      const width = this.getTrackWidth();
      const height = Math.max(1, this.dom.clientHeight || this.scrollElement.clientHeight || 1);
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      this.dom.style.width = `${width}px`;
      this.dom.style.setProperty("--adl-cm-minimap-width", `${width}px`);
      this.findSurfaceHost()?.style.setProperty("--adl-editor-minimap-width", `${width}px`);
      this.canvas.width = width * window.devicePixelRatio;
      this.canvas.height = height * window.devicePixelRatio;
      this.ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
      this.ctx.clearRect(0, 0, width, height);
      return;
    }

    const docLineCount = this.view.state.doc.lines;
    const diffModel = this.diffModel;
    const hasDiffRanges = diffModel && diffModel.ranges.length > 0;
    const documentLineColumns = !hasDiffRanges ? this.getDocumentLineColumns() : null;

    let lineCount: number;
    let useDocLines: boolean;

    if (hasDiffRanges && diffModel.lineColumns && diffModel.lineColumns.length > 0) {
      lineCount = diffModel.lineColumns.length;
      useDocLines = false;
    } else if (hasDiffRanges && diffModel.totalLines > 0) {
      lineCount = diffModel.totalLines;
      useDocLines = false;
    } else if (documentLineColumns) {
      lineCount = Math.max(1, documentLineColumns.length);
      useDocLines = false;
    } else {
      lineCount = docLineCount;
      useDocLines = true;
    }
    lineCount = Math.max(1, lineCount);

    const width = this.getTrackWidth();
    const trackMetrics = this.getTrackMetrics();
    this.syncFrameToHost();
    const height = Math.max(trackMetrics.viewportHeight, 1);
    const dpr = window.devicePixelRatio || 1;
    const renderHeight = Math.max(1, trackMetrics.contentHeight);
    const renderLineHeight = renderHeight / lineCount;

    this.canvas.width = Math.max(1, Math.floor(width * dpr));
    this.canvas.height = Math.max(1, Math.floor(height * dpr));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.dom.style.width = `${width}px`;
    this.dom.style.setProperty("--adl-cm-minimap-width", `${width}px`);
    this.host.style.setProperty("--adl-editor-minimap-width", `${width}px`);

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.ctx.clearRect(0, 0, width, height);

    const computedStyle = getComputedStyle(this.view.dom);
    const fgColor = computedStyle.color || "rgba(148, 163, 184, 0.45)";

    const charWidth = width / 80;

    const renderedLines: MinimapRenderedLineMetric[] = Array.from({ length: lineCount }, (_, index) => ({
      lineNumber: index + 1,
      top: index * renderLineHeight - trackMetrics.contentOffset,
      height: renderLineHeight,
      contentColumns: documentLineColumns?.[index]
        ?? (useDocLines && index + 1 <= docLineCount
          ? this.view.state.doc.line(index + 1).length
          : diffModel?.lineColumns?.[index] ?? 0),
    }));

    for (const renderedLine of renderedLines) {
      const i = renderedLine.lineNumber;
      const y = renderedLine.top;
      const lineHeight = renderedLine.height;
      if (y + lineHeight < 0 || y > height) {
        continue;
      }
      this.ctx.fillStyle = fgColor;

      const lineColumnsValue = renderedLine.contentColumns;
      const linePixelWidth = Math.min(lineColumnsValue * charWidth, width);
      if (linePixelWidth > 0) {
        if (this.settings.renderCharacters) {
          const glyphWidth = Math.max(1, charWidth * 0.85);
          const glyphGap = Math.max(1, charWidth * 0.45);
          for (let x = 0; x < linePixelWidth; x += glyphWidth + glyphGap) {
            this.ctx.fillRect(x, y, Math.min(glyphWidth, linePixelWidth - x), Math.max(1, lineHeight * 0.65));
          }
        } else {
          const structuralWidth = Math.max(2, Math.min(linePixelWidth, width * 0.72));
          this.ctx.fillRect(0, y, structuralWidth, Math.max(1, lineHeight * 0.55));
        }
      }

      const segments = getMinimapDiffSegmentsForLine(diffModel, i);
      for (const segment of segments) {
        this.ctx.fillStyle = this.getSegmentColor(segment);
        const laneWidth = width / Math.max(1, segment.laneCount);
        const x = segment.lane * laneWidth;
        const contentWidth = Math.max(3, Math.min(segment.contentColumns * charWidth, laneWidth));
        this.ctx.fillRect(x, y, contentWidth, Math.max(1, lineHeight));
      }
    }
  }

  private getEffectiveSliderBehavior(): "proportional" | "fixed" {
    if (this.settings.scrollbarType === "standard") {
      return "proportional";
    }
    return "fixed";
  }

  private updateSlider() {
    this.applyModeClasses();
    const trackMetrics = this.getTrackMetrics();
    const scrollDom = this.scrollElement;
    const { contentTopInset, contentBottomInset } = this.getContentInsets();
    const metrics = computeMinimapSliderMetrics({
      scrollTop: scrollDom.scrollTop,
      scrollHeight: scrollDom.scrollHeight,
      clientHeight: scrollDom.clientHeight,
      trackHeight: trackMetrics.trackHeight,
      contentTopInset,
      contentBottomInset,
      minHeight: 20,
      sliderBehavior: this.getEffectiveSliderBehavior(),
      fixedHeight: trackMetrics.fixedSliderHeight,
    });

    if (!metrics.visible) {
      this.slider.style.display = "none";
      return;
    }

    this.slider.style.display = "";
    this.slider.style.top = `${trackMetrics.top + metrics.top}px`;
    this.slider.style.height = `${metrics.height}px`;
  }

  private handleCanvasPointerDown = (e: PointerEvent) => {
    if (e.button === 0) {
      e.preventDefault();
      this.notifyDragAfterRelease = true;
      this.isDragging = true;
      const sliderRect = this.slider.getBoundingClientRect();
      this.dragOffsetY = sliderRect.height / 2;
      this.dom.setPointerCapture(e.pointerId);
      this.dom.addEventListener("pointermove", this.handlePointerMove);
      this.dom.addEventListener("pointerup", this.handlePointerUp);
      this.dom.addEventListener("pointercancel", this.handlePointerUp);
      this.scrollToPointer(e.clientY);
    }
  };

  private handleSliderPointerDown = (e: PointerEvent) => {
    if (e.button === 0) {
      e.preventDefault();
      e.stopPropagation();
      this.notifyDragAfterRelease = true;
      this.isDragging = true;
      const sliderRect = this.slider.getBoundingClientRect();
      this.dragOffsetY = clamp(e.clientY - sliderRect.top, 0, sliderRect.height);
      this.slider.setPointerCapture(e.pointerId);
      this.slider.addEventListener("pointermove", this.handlePointerMove);
      this.slider.addEventListener("pointerup", this.handlePointerUp);
      this.slider.addEventListener("pointercancel", this.handlePointerUp);
    }
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (!this.isDragging) return;
    e.preventDefault();
    this.scrollToPointer(e.clientY);
  };

  private handlePointerUp = (e: PointerEvent) => {
    this.isDragging = false;
    if (this.dom.hasPointerCapture(e.pointerId)) {
      this.dom.releasePointerCapture(e.pointerId);
    }
    if (this.slider.hasPointerCapture(e.pointerId)) {
      this.slider.releasePointerCapture(e.pointerId);
    }
    this.dom.removeEventListener("pointermove", this.handlePointerMove);
    this.dom.removeEventListener("pointerup", this.handlePointerUp);
    this.dom.removeEventListener("pointercancel", this.handlePointerUp);
    this.slider.removeEventListener("pointermove", this.handlePointerMove);
    this.slider.removeEventListener("pointerup", this.handlePointerUp);
    this.slider.removeEventListener("pointercancel", this.handlePointerUp);
    if (this.notifyDragAfterRelease) {
      this.notifyDragAfterRelease = false;
      this.options.onDragStart?.();
    }
  };

  private scrollToPointer(pointerY: number) {
    const trackMetrics = this.getTrackMetrics();
    const scrollDom = this.scrollElement;
    const { contentTopInset, contentBottomInset } = this.getContentInsets();
    const contentMetrics = this.getContentMetrics(scrollDom);
    const metrics = computeMinimapSliderMetrics({
      scrollTop: scrollDom.scrollTop,
      scrollHeight: scrollDom.scrollHeight,
      clientHeight: scrollDom.clientHeight,
      trackHeight: trackMetrics.trackHeight,
      contentTopInset,
      contentBottomInset,
      minHeight: 20,
      sliderBehavior: this.getEffectiveSliderBehavior(),
      fixedHeight: trackMetrics.fixedSliderHeight,
    });
    if (!metrics.visible) return;
    const rect = this.dom.getBoundingClientRect();
    const scrollTop = computeMinimapScrollTopFromPointer({
      pointerY,
      trackTop: rect.top + trackMetrics.top,
      dragOffsetY: this.dragOffsetY,
      trackHeight: trackMetrics.trackHeight,
      sliderHeight: metrics.height,
      contentScrollHeight: contentMetrics.contentScrollHeight,
      contentViewportHeight: contentMetrics.contentViewportHeight,
    });

    this.pendingScrollTop = toDomScrollTop(scrollTop, contentMetrics);
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.pendingScrollTop === null) return;
      const nextScrollTop = this.pendingScrollTop;
      this.pendingScrollTop = null;
      scrollDom.scrollTop = nextScrollTop;
      this.options.onScroll?.(scrollDom.scrollTop);
      this.updateSlider();
    });
  }

  private updateScrollbarStyle() {
    this.dom.style.display = "";
    this.scrollElement.classList.add("adl-cm-scroller--minimap-scrollbar");
    this.scrollElement.style.setProperty("scrollbar-width", "none");
    this.applyModeClasses();
    this.syncFrameToHost();
  }

  private applyModeClasses() {
    this.dom.classList.toggle("adl-cm-minimap--standard", this.settings.scrollbarType === "standard");
    this.dom.classList.toggle("adl-cm-minimap--thumbnail", this.settings.scrollbarType === "minimap");
    this.slider.className = [
      "adl-cm-minimap-slider",
      `adl-cm-minimap-slider--${this.settings.sliderProminence}`,
    ].join(" ");
  }

  private handleEditorScroll = () => {
    this.updateSlider();
  };

  private getSegmentColor(segment: CmMinimapDiffSegment): string {
    const cssVarName =
      segment.type === "insert"
        ? "--editor-diff-insert-bg"
        : "--editor-diff-remove-bg";

    const fallback =
      segment.type === "insert"
        ? "rgba(22,163,74,0.42)"
        : "rgba(239,68,68,0.42)";

    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue(cssVarName)
      .trim();
    if (!raw) return fallback;

    return minimapBoostRgbaAlpha(raw, fallback);
  }

  private handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    closeActiveMinimapMenu();
    const menu = document.createElement("div");
    menu.id = MINIMAP_MENU_ROOT_ID;
    menu.className = "adl-cm-minimap-context-menu";
    menu.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    const createSeparator = (): MenuItem => ({
      label: "",
      checked: false,
      onClick: () => {},
      separator: true,
    });
    const getMenuItems = (): MenuItem[] => {
      const settings = this.settings;
      const modeSpecificItems: MenuItem[] =
        settings.scrollbarType === "minimap"
          ? [
              {
                label: "渲染字符",
                checked: settings.renderCharacters,
                onClick: () => { settings.renderCharacters = !settings.renderCharacters; this.applySettings(); },
              },
              createSeparator(),
              {
                label: "缩放: 50%",
                checked: settings.zoomLevel === 0.5,
                onClick: () => { settings.zoomLevel = 0.5; this.applySettings(); },
              },
              {
                label: "缩放: 100%",
                checked: settings.zoomLevel === 1,
                onClick: () => { settings.zoomLevel = 1; this.applySettings(); },
              },
              {
                label: "缩放: 150%",
                checked: settings.zoomLevel === 1.5,
                onClick: () => { settings.zoomLevel = 1.5; this.applySettings(); },
              },
              {
                label: "缩放: 200%",
                checked: settings.zoomLevel === 2,
                onClick: () => { settings.zoomLevel = 2; this.applySettings(); },
              },
              createSeparator(),
              {
                label: "宽度: 60px",
                checked: settings.thumbnailSize === 60,
                onClick: () => { settings.thumbnailSize = 60; this.applySettings(); },
              },
              {
                label: "宽度: 80px",
                checked: settings.thumbnailSize === 80,
                onClick: () => { settings.thumbnailSize = 80; this.applySettings(); },
              },
              {
                label: "宽度: 100px",
                checked: settings.thumbnailSize === 100,
                onClick: () => { settings.thumbnailSize = 100; this.applySettings(); },
              },
              createSeparator(),
            ]
          : [];

      return [
        ...modeSpecificItems,
        {
          label: "滑块样式: 轻",
          checked: settings.sliderProminence === "subtle",
          onClick: () => { settings.sliderProminence = "subtle"; this.applySettings(); },
        },
        {
          label: "滑块样式: 标准",
          checked: settings.sliderProminence === "normal",
          onClick: () => { settings.sliderProminence = "normal"; this.applySettings(); },
        },
        createSeparator(),
        {
          label: "设置: 全局",
          checked: settings.isGlobal,
          onClick: () => { settings.isGlobal = true; this.applySettings(); },
        },
        {
          label: "设置: 独立",
          checked: !settings.isGlobal,
          onClick: () => { settings.isGlobal = false; this.applySettings(); },
        },
      ];
    };

    const renderMenuContent = () => {
      menu.replaceChildren();
      const settings = this.settings;
      const items = getMenuItems();
      const scrollbarModeGroup = document.createElement("div");
      scrollbarModeGroup.className = "adl-cm-minimap-menu-segmented";

      const createModeButton = (label: string, selected: boolean, onClick: () => void) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "adl-cm-minimap-menu-segmented__button";
        button.setAttribute("aria-pressed", selected ? "true" : "false");
        button.textContent = label;
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          onClick();
          renderMenuContent();
        });
        return button;
      };

      scrollbarModeGroup.appendChild(createModeButton("滑动条: Minimap", settings.scrollbarType === "minimap", () => {
        settings.scrollbarType = "minimap";
        this.applySettings();
      }));
      scrollbarModeGroup.appendChild(createModeButton("滑动条: 普通", settings.scrollbarType === "standard", () => {
        settings.scrollbarType = "standard";
        this.applySettings();
      }));
      menu.appendChild(scrollbarModeGroup);
      menu.appendChild(Object.assign(document.createElement("div"), {
        className: "adl-cm-minimap-menu-separator",
      }));

      for (const item of items) {
        if (item.separator) {
          const separator = document.createElement("div");
          separator.className = "adl-cm-minimap-menu-separator";
          menu.appendChild(separator);
          continue;
        }
        const el = document.createElement("button");
        el.type = "button";
        el.className = `adl-cm-minimap-menu-item${item.checked ? " adl-cm-minimap-menu-item--checked" : ""}`;
        const label = document.createElement("span");
        label.className = "adl-cm-minimap-menu-item__label";
        label.textContent = item.label;
        el.appendChild(label);
        const check = document.createElement("span");
        check.className = "adl-cm-minimap-menu-item__check";
        check.textContent = item.checked ? "√" : "";
        el.appendChild(check);
        el.addEventListener("click", (event) => {
          event.stopPropagation();
          item.onClick();
          renderMenuContent();
        });
        menu.appendChild(el);
      }
      return items;
    };

    const items = renderMenuContent();

    const rect = e.currentTarget instanceof Element ? e.currentTarget.getBoundingClientRect() : document.body.getBoundingClientRect();
    let menuX = e.clientX;
    let menuY = e.clientY;

    const menuWidth = 196;
    const menuHeight = 42 + items.filter(i => !i.separator).length * 28 + items.filter(i => i.separator).length * 8 + 16;

    if (menuX + menuWidth > window.innerWidth) {
      menuX = window.innerWidth - menuWidth - 8;
    }
    if (menuY + menuHeight > window.innerHeight) {
      menuY = window.innerHeight - menuHeight - 8;
    }

    menu.style.left = `${menuX}px`;
    menu.style.top = `${menuY}px`;
    document.body.appendChild(menu);

    const cleanup = () => {
      menu.remove();
      document.removeEventListener("click", close);
      document.removeEventListener("contextmenu", close);
      if (activeMinimapMenuCleanup === cleanup) {
        activeMinimapMenuCleanup = null;
      }
    };
    const close = (ev: MouseEvent) => {
      if (!menu.contains(ev.target as Node)) {
        cleanup();
      }
    };
    setTimeout(() => {
      document.addEventListener("click", close);
      document.addEventListener("contextmenu", close);
    }, 0);
    activeMinimapMenuCleanup = cleanup;
  }

  private applySettings() {
    this.settings = normalizeMinimapSettings(this.settings);
    saveMinimapSettings(this.settings, this.options.scopeId);
    window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT));
    this.render();
    this.updateSlider();
    this.updateScrollbarStyle();
  }
}

export function getMinimapExtension(options: CmMinimapExtensionOptions = {}): Extension[] {
  return [
    minimapDiffModelField,
    ViewPlugin.define((view) => new MinimapPlugin(view, options)),
  ];
}

export function updateMinimapDiffHunks(view: EditorView, hunks: AgentHunkDecoration[]) {
  view.dispatch({ effects: setMinimapDiffHunks.of(hunks) });
}

export function updateMinimapDiffModel(view: EditorView, model: CmMinimapDiffModel | null) {
  view.dispatch({ effects: setMinimapDiffModel.of(model) });
}
