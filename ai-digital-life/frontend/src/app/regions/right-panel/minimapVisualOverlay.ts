const MINIMAP_SELECTOR = ".minimap";
const SLIDER_SELECTOR = ".minimap-slider";
const OVERLAY_CLASS = "adl-minimap-slider-visual";
const DIFF_INDICATORS_LAYER_CLASS = "adl-minimap-diff-indicators";
const DIFF_INDICATOR_CLASS = "adl-minimap-diff-indicator";
const DEFAULT_VISUAL_HEIGHT = 48;
const DEFAULT_MINIMAP_MAX_COLUMN = 80;
const MIN_INDICATOR_WIDTH = 3;
const INDICATOR_LEFT_PADDING = 4;
const INDICATOR_RIGHT_PADDING = 3;

export type ScrollState = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

export type DiffRange = {
  startLine: number;
  endLine: number;
  type: "insert" | "delete";
  tone?: "base" | "strong" | "block";
  contentColumns?: number;
};

export type MinimapOverlayOptions = {
  getScrollState?: () => ScrollState | null;
  setScrollTop?: (value: number) => void;
  getDiffRanges?: () => DiffRange[] | null;
  getTotalLines?: () => number | null;
};

type VisualFrameInput = {
  minimapHeight: number;
  scrollRatio: number;
  visualHeight: number;
};

type DiffIndicatorStyleInput = {
  range: DiffRange;
  totalLines: number;
  minimapHeight: number;
  minimapWidth: number;
  maxColumn?: number;
};

export type MinimapVisualFrame = {
  top: number;
  height: number;
};

export type MinimapDiffIndicatorStyle = {
  top: number;
  height: number;
  left: number;
  width: number;
};

export function computeMinimapVisualFrame(input: VisualFrameInput): MinimapVisualFrame {
  const minimapHeight = Math.max(0, input.minimapHeight);
  const height = Math.max(0, Math.min(input.visualHeight, minimapHeight));
  if (height === 0) {
    return { top: 0, height: 0 };
  }

  const ratio = Math.max(0, Math.min(input.scrollRatio, 1));
  const travelRange = minimapHeight - height;
  const top = ratio * travelRange;
  return { top, height };
}

export function computeScrollRatio(state: ScrollState): number {
  const maxScroll = state.scrollHeight - state.clientHeight;
  if (maxScroll <= 0) return 0;
  return Math.max(0, Math.min(state.scrollTop / maxScroll, 1));
}

export function computeMinimapDiffIndicatorStyle(input: DiffIndicatorStyleInput): MinimapDiffIndicatorStyle | null {
  const totalLines = Math.max(0, input.totalLines);
  const minimapHeight = Math.max(0, input.minimapHeight);
  const minimapWidth = Math.max(0, input.minimapWidth);

  if (totalLines <= 0 || minimapHeight <= 0 || minimapWidth <= 0) return null;

  const startLine = Math.max(1, input.range.startLine);
  const endLine = Math.max(startLine, input.range.endLine);
  if (endLine < 1 || startLine > totalLines) return null;

  const startY = Math.max(0, (startLine - 1) / totalLines) * minimapHeight;
  const endY = Math.min(minimapHeight, endLine / totalLines) * minimapHeight;
  const height = Math.max(2, endY - startY);
  const availableWidth = Math.max(0, minimapWidth - INDICATOR_LEFT_PADDING - INDICATOR_RIGHT_PADDING);
  if (availableWidth <= 0) return null;

  const maxColumn = Math.max(1, input.maxColumn ?? DEFAULT_MINIMAP_MAX_COLUMN);
  const contentColumns = Math.max(1, input.range.contentColumns ?? maxColumn);
  const contentRatio = Math.max(MIN_INDICATOR_WIDTH / availableWidth, Math.min(contentColumns / maxColumn, 1));
  const width = Math.min(availableWidth, Math.max(MIN_INDICATOR_WIDTH, availableWidth * contentRatio));

  return {
    top: startY,
    height,
    left: INDICATOR_LEFT_PADDING,
    width
  };
}

function readVisualHeight(minimap: HTMLElement): number {
  const raw = getComputedStyle(minimap).getPropertyValue("--adl-minimap-slider-visual-height").trim();
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : DEFAULT_VISUAL_HEIGHT;
}

function getOrCreateOverlay(minimap: HTMLElement) {
  let overlay = minimap.querySelector<HTMLElement>(`:scope > .${OVERLAY_CLASS}`);
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = OVERLAY_CLASS;
    overlay.setAttribute("aria-hidden", "true");
    minimap.appendChild(overlay);
  }
  return overlay;
}

function getOrCreateDiffIndicatorsLayer(minimap: HTMLElement) {
  let layer = minimap.querySelector<HTMLElement>(`:scope > .${DIFF_INDICATORS_LAYER_CLASS}`);
  if (!layer) {
    layer = document.createElement("div");
    layer.className = DIFF_INDICATORS_LAYER_CLASS;
    layer.setAttribute("aria-hidden", "true");
    minimap.appendChild(layer);
  }
  return layer;
}

function computeDiffIndicatorMaxColumn(diffRanges: DiffRange[]) {
  return Math.max(
    DEFAULT_MINIMAP_MAX_COLUMN,
    ...diffRanges.map((range) => Math.max(0, range.contentColumns ?? 0))
  );
}

function renderDiffIndicators(
  minimap: HTMLElement,
  diffRanges: DiffRange[],
  totalLines: number
) {
  const layer = getOrCreateDiffIndicatorsLayer(minimap);
  layer.replaceChildren();

  if (!diffRanges.length || totalLines <= 0) return;

  const minimapRect = minimap.getBoundingClientRect();
  const minimapHeight = minimapRect.height;
  const minimapWidth = minimapRect.width;
  if (minimapHeight <= 0 || minimapWidth <= 0) return;

  const fragment = document.createDocumentFragment();
  const maxColumn = computeDiffIndicatorMaxColumn(diffRanges);

  diffRanges.forEach((range) => {
    const layout = computeMinimapDiffIndicatorStyle({
      range,
      totalLines,
      minimapHeight,
      minimapWidth,
      maxColumn
    });
    if (!layout) return;

    const indicator = document.createElement("div");
    indicator.className = `${DIFF_INDICATOR_CLASS} ${DIFF_INDICATOR_CLASS}--${range.type} ${DIFF_INDICATOR_CLASS}--${range.tone ?? "base"}`;
    indicator.style.top = `${layout.top}px`;
    indicator.style.height = `${layout.height}px`;
    indicator.style.left = `${layout.left}px`;
    indicator.style.width = `${layout.width}px`;
    indicator.setAttribute("aria-hidden", "true");

    fragment.appendChild(indicator);
  });

  layer.replaceChildren(fragment);
}

function syncMinimapOverlay(
  minimap: HTMLElement,
  getScrollState?: () => ScrollState | null,
  getDiffRanges?: () => DiffRange[] | null,
  getTotalLines?: () => number | null
) {
  const slider = minimap.querySelector<HTMLElement>(SLIDER_SELECTOR);
  const overlay = getOrCreateOverlay(minimap);

  if (!slider) {
    overlay.style.display = "none";
    return;
  }

  const minimapRect = minimap.getBoundingClientRect();
  const minimapHeight = minimapRect.height;

  if (minimapHeight <= 0) {
    overlay.style.display = "none";
    return;
  }

  const state = getScrollState?.() ?? null;
  const scrollRatio = state ? computeScrollRatio(state) : 0;
  const frame = computeMinimapVisualFrame({
    minimapHeight,
    scrollRatio,
    visualHeight: readVisualHeight(minimap)
  });

  if (frame.height <= 0) {
    overlay.style.display = "none";
    return;
  }

  overlay.style.display = "block";
  overlay.style.top = `${frame.top}px`;
  overlay.style.height = `${frame.height}px`;

  if (getDiffRanges && getTotalLines) {
    const diffRanges = getDiffRanges();
    const totalLines = getTotalLines();
    if (diffRanges && totalLines) {
      renderDiffIndicators(minimap, diffRanges, totalLines);
    }
  }
}

function collectMinimaps(root: ParentNode) {
  return Array.from(root.querySelectorAll<HTMLElement>(MINIMAP_SELECTOR)).filter((minimap) => {
    const style = getComputedStyle(minimap);
    return style.display !== "none" && minimap.getBoundingClientRect().height > 0;
  });
}

function attachOverlayInteraction(
  minimap: HTMLElement,
  overlay: HTMLElement,
  getScrollState: () => ScrollState | null,
  setScrollTop: (value: number) => void
): () => void {
  let dragging = false;
  let visualHeight = readVisualHeight(minimap);

  const scrollToPointer = (clientY: number) => {
    const state = getScrollState();
    if (!state) return;
    const minimapRect = minimap.getBoundingClientRect();
    const maxTravel = minimapRect.height - visualHeight;
    if (maxTravel <= 0) return;
    const relativeY = clientY - minimapRect.top;
    const ratio = Math.max(0, Math.min((relativeY - visualHeight / 2) / maxTravel, 1));
    const maxScroll = Math.max(0, state.scrollHeight - state.clientHeight);
    if (maxScroll <= 0) return;
    setScrollTop(ratio * maxScroll);
  };

  const DRAGGING_CLASS = "adl-minimap-slider-visual--dragging";

  const handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    dragging = true;
    overlay.classList.add(DRAGGING_CLASS);
    visualHeight = readVisualHeight(minimap);
    try {
      overlay.setPointerCapture(event.pointerId);
    } catch {
      /* element may be detached */
    }
    scrollToPointer(event.clientY);
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (!dragging) return;
    event.preventDefault();
    scrollToPointer(event.clientY);
  };

  const handlePointerUp = () => {
    if (!dragging) return;
    dragging = false;
    overlay.classList.remove(DRAGGING_CLASS);
  };

  overlay.addEventListener("pointerdown", handlePointerDown);
  overlay.addEventListener("pointermove", handlePointerMove);
  overlay.addEventListener("pointerup", handlePointerUp);
  overlay.addEventListener("pointercancel", handlePointerUp);

  return () => {
    overlay.removeEventListener("pointerdown", handlePointerDown);
    overlay.removeEventListener("pointermove", handlePointerMove);
    overlay.removeEventListener("pointerup", handlePointerUp);
    overlay.removeEventListener("pointercancel", handlePointerUp);
  };
}

export function attachMinimapVisualOverlays(root: HTMLElement, options?: MinimapOverlayOptions) {
  const { getScrollState, setScrollTop, getDiffRanges, getTotalLines } = options ?? {};
  let disposed = false;
  let rafId = 0;
  const interactionDisposers = new Map<HTMLElement, () => void>();

  const stripDiffBorders = () => {
    const DIFF_BORDER_CLASSES = ["char-insert", "char-delete", "line-insert", "line-delete"];
    const BORDER_PROPERTIES = [
      "border",
      "border-top",
      "border-right",
      "border-bottom",
      "border-left"
    ];
    for (const cls of DIFF_BORDER_CLASSES) {
      root.querySelectorAll(`.${cls}`).forEach((el) => {
        const node = el as HTMLElement;
        BORDER_PROPERTIES.forEach((property) => {
          node.style.setProperty(property, "none", "important");
        });
        node.style.setProperty("border-color", "transparent", "important");
        node.style.setProperty("outline", "none", "important");
        node.style.setProperty("outline-color", "transparent", "important");
        node.style.setProperty("box-shadow", "none", "important");
      });
    }
  };

  const syncAll = () => {
    if (disposed) return;
    stripDiffBorders();
    const minimaps = collectMinimaps(root);
    const activeSet = new Set(minimaps);

    for (const [minimap, disposer] of interactionDisposers) {
      if (!activeSet.has(minimap)) {
        disposer();
        interactionDisposers.delete(minimap);
      }
    }

    minimaps.forEach((minimap) => {
      syncMinimapOverlay(minimap, getScrollState, getDiffRanges, getTotalLines);

      if (getScrollState && setScrollTop) {
        const overlay = minimap.querySelector<HTMLElement>(`.${OVERLAY_CLASS}`);
        if (overlay && !interactionDisposers.has(minimap)) {
          interactionDisposers.set(minimap, attachOverlayInteraction(minimap, overlay, getScrollState, setScrollTop));
        }
      }
    });
  };

  const scheduleSync = () => {
    if (disposed || rafId) return;
    rafId = window.requestAnimationFrame(() => {
      rafId = 0;
      syncAll();
    });
  };

  const mutationObserver = new MutationObserver(scheduleSync);
  mutationObserver.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class", "style"]
  });

  const resizeObserver = new ResizeObserver(scheduleSync);
  resizeObserver.observe(root);
  collectMinimaps(root).forEach((minimap) => resizeObserver.observe(minimap));

  scheduleSync();

  return {
    refresh: scheduleSync,
    dispose() {
      disposed = true;
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      for (const disposer of interactionDisposers.values()) disposer();
      interactionDisposers.clear();
      root.querySelectorAll<HTMLElement>(`.${OVERLAY_CLASS}`).forEach((el) => el.remove());
      root.querySelectorAll<HTMLElement>(`.${DIFF_INDICATORS_LAYER_CLASS}`).forEach((el) => el.remove());
      root.querySelectorAll<HTMLElement>(`.${DIFF_INDICATOR_CLASS}`).forEach((el) => el.remove());
    }
  };
}
