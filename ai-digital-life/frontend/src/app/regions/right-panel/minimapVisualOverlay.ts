const MINIMAP_SELECTOR = ".minimap";
const SLIDER_SELECTOR = ".minimap-slider";
const OVERLAY_CLASS = "adl-minimap-slider-visual";
const CONTEXT_MENU_CLASS = "adl-minimap-context-menu";
const DEFAULT_VISUAL_HEIGHT = 48;

export type ScrollState = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

export type MinimapSettings = {
  renderCharacters: boolean;
  size: "proportional" | "fill";
  scale: number;
  showSlider: "always" | "mouseover";
  sliderIntensity: number;
};

export const SLIDER_INTENSITY_RANGE = { min: 5, max: 100 } as const;

export const MINIMAP_DEFAULTS: MinimapSettings = {
  renderCharacters: true,
  size: "proportional",
  scale: 1.5,
  showSlider: "always",
  sliderIntensity: 50,
};

const MINIMAP_SETTINGS_STORAGE_KEY = "adl-minimap-settings";

export function loadMinimapSettings(): MinimapSettings {
  try {
    const raw = localStorage.getItem(MINIMAP_SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...MINIMAP_DEFAULTS, ...parsed };
    }
  } catch {
    /* ignore parse errors */
  }
  return { ...MINIMAP_DEFAULTS };
}

export function saveMinimapSettings(settings: MinimapSettings): void {
  try {
    localStorage.setItem(MINIMAP_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* storage may be unavailable */
  }
}

export type MinimapOverlayOptions = {
  getScrollState?: () => ScrollState | null;
  setScrollTop?: (value: number) => void;
  onSettingsChange?: (settings: MinimapSettings) => void;
  getSettings?: () => MinimapSettings;
  getLineCount?: () => number | null;
};

type VisualFrameInput = {
  minimapHeight: number;
  scrollRatio: number;
  visualHeight: number;
  /** Actual content height rendered inside the minimap canvas. When omitted,
   *  falls back to `minimapHeight` (i.e. assumes content fills the minimap). */
  contentHeight?: number;
};

export type MinimapVisualFrame = {
  top: number;
  height: number;
};

export function computeMinimapVisualFrame(input: VisualFrameInput): MinimapVisualFrame {
  const minimapHeight = Math.max(0, input.minimapHeight);
  const contentHeight = input.contentHeight != null ? Math.max(0, input.contentHeight) : minimapHeight;
  const effectiveHeight = Math.min(minimapHeight, contentHeight);

  const height = Math.max(0, Math.min(input.visualHeight, effectiveHeight));
  if (height === 0) {
    return { top: 0, height: 0 };
  }

  const ratio = Math.max(0, Math.min(input.scrollRatio, 1));
  const travelRange = effectiveHeight - height;
  const top = ratio * travelRange;
  return { top, height };
}

export function computeScrollRatio(state: ScrollState): number {
  const maxScroll = state.scrollHeight - state.clientHeight;
  if (maxScroll <= 0) return 0;
  return Math.max(0, Math.min(state.scrollTop / maxScroll, 1));
}

function readVisualHeight(minimap: HTMLElement): number {
  const raw = getComputedStyle(minimap).getPropertyValue("--adl-minimap-slider-visual-height").trim();
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : DEFAULT_VISUAL_HEIGHT;
}

export function computeMinimapLineHeight(scale: number): number {
  return Math.max(2, Math.round(2 * scale));
}

function getMinimapContentHeight(
  minimap: HTMLElement,
  scrollState: ScrollState | null,
  lineCount?: number | null,
  scale?: number,
  size?: "proportional" | "fill"
): number {
  const minimapHeight = minimap.getBoundingClientRect().height;
  if (!scrollState || minimapHeight <= 0) return minimapHeight;

  if (size === "fill") return minimapHeight;

  const canvas = minimap.querySelector<HTMLCanvasElement>("canvas.minimap-decorations-layer, canvas");
  if (canvas) {
    const canvasHeight = canvas.getBoundingClientRect().height;
    if (canvasHeight > 0) {
      return Math.min(canvasHeight, minimapHeight);
    }
  }

  if (lineCount != null && lineCount >= 0) {
    if (lineCount === 0) return 0;
    const effectiveScale = scale ?? 1.5;
    const minimapLineHeight = computeMinimapLineHeight(effectiveScale);
    const contentHeight = lineCount * minimapLineHeight;
    return Math.min(minimapHeight, Math.max(0, contentHeight));
  }

  const slider = minimap.querySelector<HTMLElement>(SLIDER_SELECTOR);
  if (slider && scrollState.scrollHeight > 0 && scrollState.clientHeight > 0) {
    const sliderHeight = slider.getBoundingClientRect().height;
    if (sliderHeight > 0) {
      const estimated = sliderHeight * scrollState.scrollHeight / scrollState.clientHeight;
      if (estimated > 0 && estimated < minimapHeight) {
        return estimated;
      }
    }
  }

  const maxScroll = Math.max(0, scrollState.scrollHeight - scrollState.clientHeight);
  if (maxScroll <= 0) {
    const contentRatio = scrollState.scrollHeight / Math.max(1, scrollState.clientHeight);
    if (contentRatio < 1) {
      return Math.min(minimapHeight, Math.max(0, minimapHeight * contentRatio));
    }
  }

  return minimapHeight;
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

function syncMinimapOverlay(
  minimap: HTMLElement,
  options?: MinimapOverlayOptions
) {
  const { getScrollState, getSettings, getLineCount } = options ?? {};
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

  const sliderRect = slider.getBoundingClientRect();
  const sliderHeight = sliderRect.height;
  const sliderTop = sliderRect.top - minimapRect.top;

  if (sliderHeight <= 0) {
    overlay.style.display = "none";
    return;
  }

  const settings = getSettings?.();
  const intensity = settings?.sliderIntensity ?? 50;
  overlay.style.setProperty("--adl-slider-intensity", `${intensity}%`);
  overlay.style.setProperty("--adl-slider-top", `${sliderTop}px`);
  overlay.style.setProperty("--adl-slider-height", `${sliderHeight}px`);
  overlay.style.display = "block";
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

  const getSliderMetrics = () => {
    const minimapRect = minimap.getBoundingClientRect();
    const minimapHeight = minimapRect.height;
    if (minimapHeight <= 0) return null;
    
    const slider = minimap.querySelector<HTMLElement>(SLIDER_SELECTOR);
    
    if (slider) {
      const sliderRect = slider.getBoundingClientRect();
      const sliderHeight = sliderRect.height;
      const sliderTop = sliderRect.top - minimapRect.top;
      
      if (sliderHeight > 0) {
        const state = getScrollState();
        if (state && state.scrollHeight > 0 && state.clientHeight > 0) {
          const maxScroll = state.scrollHeight - state.clientHeight;
          if (maxScroll <= 0) return { sliderHeight, sliderTop, contentHeight: minimapHeight, maxScroll: 0 };
          
          const contentHeight = (sliderHeight / state.clientHeight) * state.scrollHeight;
          return { sliderHeight, sliderTop, contentHeight: Math.min(contentHeight, minimapHeight), maxScroll };
        }
      }
    }
    
    const style = window.getComputedStyle(overlay);
    const sliderTop = parseFloat(style.getPropertyValue("--adl-slider-top")) || 0;
    const sliderHeight = parseFloat(style.getPropertyValue("--adl-slider-height")) || 0;
    
    if (sliderHeight <= 0) return null;
    
    const state = getScrollState();
    if (!state || state.scrollHeight <= 0 || state.clientHeight <= 0) return null;
    
    const maxScroll = state.scrollHeight - state.clientHeight;
    if (maxScroll <= 0) return { sliderHeight, sliderTop, contentHeight: minimapHeight, maxScroll: 0 };
    
    const contentHeight = (sliderHeight / state.clientHeight) * state.scrollHeight;
    return { sliderHeight, sliderTop, contentHeight: Math.min(contentHeight, minimapHeight), maxScroll };
  };

  const scrollToPointer = (clientY: number) => {
    const metrics = getSliderMetrics();
    if (!metrics || metrics.maxScroll <= 0) return;
    
    const minimapRect = minimap.getBoundingClientRect();
    const { sliderHeight, contentHeight, maxScroll } = metrics;
    
    const maxTravel = contentHeight - sliderHeight;
    if (maxTravel <= 0) return;
    
    const relativeY = Math.max(0, Math.min(clientY - minimapRect.top, contentHeight));
    const ratio = Math.max(0, Math.min((relativeY - sliderHeight / 2) / maxTravel, 1));
    
    setScrollTop(ratio * maxScroll);
  };

  const DRAGGING_CLASS = "adl-minimap-slider-visual--dragging";
  const OVER_SLIDER_CLASS = "adl-minimap-slider-visual--over-slider";

  const getOverlaySliderMetrics = () => {
    const style = window.getComputedStyle(overlay);
    const sliderTop = parseFloat(style.getPropertyValue("--adl-slider-top")) || 0;
    const sliderHeight = parseFloat(style.getPropertyValue("--adl-slider-height")) || 0;
    return { sliderTop, sliderHeight };
  };

  const isOverSlider = (clientY: number): boolean => {
    const minimapRect = minimap.getBoundingClientRect();
    const relativeY = clientY - minimapRect.top;
    const { sliderTop, sliderHeight } = getOverlaySliderMetrics();
    return relativeY >= sliderTop && relativeY <= sliderTop + sliderHeight;
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    const metrics = getSliderMetrics();
    if (!metrics) return;

    const minimapRect = minimap.getBoundingClientRect();
    const relativeY = event.clientY - minimapRect.top;
    if (relativeY > metrics.contentHeight) return;

    dragging = true;
    overlay.classList.add(DRAGGING_CLASS);
    try {
      overlay.setPointerCapture(event.pointerId);
    } catch {
      /* element may be detached */
    }
    scrollToPointer(event.clientY);
  };

  const suppressMouseDown = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (!dragging) {
      if (isOverSlider(event.clientY)) {
        overlay.classList.add(OVER_SLIDER_CLASS);
      } else {
        overlay.classList.remove(OVER_SLIDER_CLASS);
      }
      return;
    }

    event.preventDefault();

    const metrics = getSliderMetrics();
    if (!metrics) {
      dragging = false;
      overlay.classList.remove(DRAGGING_CLASS);
      return;
    }

    scrollToPointer(event.clientY);
  };

  const handlePointerUp = () => {
    if (!dragging) return;
    dragging = false;
    overlay.classList.remove(DRAGGING_CLASS);
  };

  const handlePointerLeave = () => {
    overlay.classList.remove(OVER_SLIDER_CLASS);
  };

  overlay.addEventListener("pointerdown", handlePointerDown);
  overlay.addEventListener("pointermove", handlePointerMove);
  overlay.addEventListener("pointerup", handlePointerUp);
  overlay.addEventListener("pointercancel", handlePointerUp);
  overlay.addEventListener("pointerleave", handlePointerLeave);
  overlay.addEventListener("mousedown", suppressMouseDown);

  return () => {
    overlay.removeEventListener("pointerdown", handlePointerDown);
    overlay.removeEventListener("pointermove", handlePointerMove);
    overlay.removeEventListener("pointerup", handlePointerUp);
    overlay.removeEventListener("pointercancel", handlePointerUp);
    overlay.removeEventListener("pointerleave", handlePointerLeave);
    overlay.removeEventListener("mousedown", suppressMouseDown);
  };
}

export function attachMinimapVisualOverlays(root: HTMLElement, options?: MinimapOverlayOptions) {
  const { getScrollState, setScrollTop, onSettingsChange, getSettings } = options ?? {};
  let disposed = false;
  let rafId = 0;
  const interactionDisposers = new Map<HTMLElement, () => void>();
  let contextMenuEl: HTMLElement | null = null;
  /**
   * When the user is actively dragging the intensity slider (or typing in the
   * numeric input), we update the overlay visuals directly via DOM (bypassing
   * React state) for instant feedback.  However, ResizeObserver or non-overlay
   * MutationObserver mutations can still trigger `syncAll()`, which would read
   * the **stale** React state via `getSettings()` and overwrite the live value.
   *
   * `liveIntensity` bridges this gap: while the context-menu slider is open,
   * `getSettings` returns `liveIntensity` for `sliderIntensity` so that any
   * `syncAll()` triggered during interaction uses the correct, up-to-date value.
   */
  let liveIntensity: number | undefined;

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

  const closeContextMenu = () => {
    if (contextMenuEl) {
      contextMenuEl.remove();
      contextMenuEl = null;
    }
    /* Reset live override so subsequent syncs read persisted React state */
    liveIntensity = undefined;
  };

  const overlayOptions: MinimapOverlayOptions = {
    getScrollState,
    setScrollTop,
    getSettings: getSettings
      ? () => {
          const settings = getSettings();
          if (liveIntensity !== undefined && settings) {
            return { ...settings, sliderIntensity: liveIntensity };
          }
          return settings;
        }
      : undefined,
    getLineCount: options?.getLineCount,
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
      syncMinimapOverlay(minimap, overlayOptions);

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

  const mutationObserver = new MutationObserver((mutations) => {
    let shouldSync = false;
    for (const mutation of mutations) {
      const target = mutation.target as HTMLElement;
      /* Skip style changes on our own overlays to avoid race with direct visual updates */
      if (target.classList?.contains(OVERLAY_CLASS)) continue;
      shouldSync = true;
      break;
    }
    if (shouldSync) scheduleSync();
  });
  mutationObserver.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class", "style"]
  });

  const resizeObserver = new ResizeObserver(scheduleSync);
  resizeObserver.observe(root);
  collectMinimaps(root).forEach((minimap) => resizeObserver.observe(minimap));

  const handleContextMenu = (event: MouseEvent) => {
    if (!onSettingsChange || !getSettings) return;
    const minimap = (event.target as HTMLElement).closest(MINIMAP_SELECTOR);
    if (!minimap || !root.contains(minimap)) return;

    event.preventDefault();
    event.stopPropagation();

    closeContextMenu();

    const menu = document.createElement("div");
    menu.className = CONTEXT_MENU_CLASS;
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;

    const settings = getSettings();

    const createCheckItem = (label: string, checked: boolean, onChange: (value: boolean) => void) => {
      const item = document.createElement("button");
      item.className = `${CONTEXT_MENU_CLASS}__item`;
      item.type = "button";

      const labelSpan = document.createElement("span");
      labelSpan.textContent = label;
      item.appendChild(labelSpan);

      const checkSpan = document.createElement("span");
      checkSpan.className = `${CONTEXT_MENU_CLASS}__check`;
      checkSpan.textContent = checked ? "✓" : "";
      item.appendChild(checkSpan);

      item.addEventListener("click", (e) => {
        e.stopPropagation();
        onChange(!checked);
        closeContextMenu();
      });
      return item;
    };

    const createRadioGroup = (label: string, options: { value: string; label: string }[], currentValue: string, onChange: (value: string) => void) => {
      const item = document.createElement("div");
      item.className = `${CONTEXT_MENU_CLASS}__group`;

      const header = document.createElement("span");
      header.className = `${CONTEXT_MENU_CLASS}__group-label`;
      header.textContent = label;
      item.appendChild(header);

      const optionsContainer = document.createElement("div");
      optionsContainer.className = `${CONTEXT_MENU_CLASS}__group-options`;

      options.forEach((opt) => {
        const btn = document.createElement("button");
        btn.className = `${CONTEXT_MENU_CLASS}__option${opt.value === currentValue ? " is-selected" : ""}`;
        btn.type = "button";
        btn.textContent = opt.label;
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          onChange(opt.value);
          closeContextMenu();
        });
        optionsContainer.appendChild(btn);
      });

      item.appendChild(optionsContainer);
      return item;
    };

    const createSeparator = () => {
      const sep = document.createElement("div");
      sep.className = `${CONTEXT_MENU_CLASS}__separator`;
      return sep;
    };

    /* ── range slider with live preview & manual numeric input ── */
    const createSliderControl = (
      label: string,
      currentValue: number,
      range: { min: number; max: number },
      onChange: (value: number) => void
    ) => {
      const item = document.createElement("div");
      item.className = `${CONTEXT_MENU_CLASS}__slider`;

      const headerRow = document.createElement("div");
      headerRow.className = `${CONTEXT_MENU_CLASS}__slider-header`;

      const headerLabel = document.createElement("span");
      headerLabel.className = `${CONTEXT_MENU_CLASS}__group-label`;
      headerLabel.textContent = label;
      headerRow.appendChild(headerLabel);

      const valueDisplay = document.createElement("input");
      valueDisplay.className = `${CONTEXT_MENU_CLASS}__slider-value`;
      valueDisplay.type = "text";
      valueDisplay.value = String(Math.round(currentValue));
      valueDisplay.inputMode = "numeric";
      valueDisplay.setAttribute("aria-label", label + "\u6570\u503C");

      let editingValue = false;

      /* Immediately update all overlay visuals without touching React */
      const applyVisualIntensity = (intensity: number) => {
        const clamped = Math.max(range.min, Math.min(range.max, intensity));
        liveIntensity = clamped;
        root.querySelectorAll<HTMLElement>(`.${OVERLAY_CLASS}`).forEach((el) => {
          el.style.setProperty("--adl-slider-intensity", `${clamped}%`);
        });
      };

      valueDisplay.addEventListener("focus", () => { editingValue = true; });
      valueDisplay.addEventListener("blur", () => {
        editingValue = false;
        const num = Number.parseFloat(valueDisplay.value);
        if (Number.isFinite(num)) {
          const clamped = Math.max(range.min, Math.min(range.max, num));
          onChange(clamped);
          applyVisualIntensity(clamped);
          valueDisplay.value = String(Math.round(clamped));
        } else {
          valueDisplay.value = String(Math.round(currentValue));
        }
      });
      valueDisplay.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); valueDisplay.blur(); }
        if (e.key === "Escape") { editingValue = false; valueDisplay.value = String(Math.round(currentValue)); valueDisplay.blur(); }
      });

      const percentSign = document.createElement("span");
      percentSign.className = `${CONTEXT_MENU_CLASS}__slider-unit`;
      percentSign.textContent = "%";

      const valueGroup = document.createElement("span");
      valueGroup.className = `${CONTEXT_MENU_CLASS}__slider-value-group`;
      valueGroup.appendChild(valueDisplay);
      valueGroup.appendChild(percentSign);
      headerRow.appendChild(valueGroup);
      item.appendChild(headerRow);

      const trackWrap = document.createElement("div");
      trackWrap.className = `${CONTEXT_MENU_CLASS}__slider-track-wrap`;

      const rangeInput = document.createElement("input");
      rangeInput.type = "range";
      rangeInput.min = String(range.min);
      rangeInput.max = String(range.max);
      rangeInput.step = "1";
      rangeInput.value = String(currentValue);
      rangeInput.className = `${CONTEXT_MENU_CLASS}__slider-range`;
      rangeInput.setAttribute("aria-label", label);

      /* ── Input event: update visual only, NO React state ── */
      rangeInput.addEventListener("input", () => {
        const val = Number(rangeInput.value);
        if (!editingValue) valueDisplay.value = String(val);
        applyVisualIntensity(val);
        fillTrack.style.width = ((val - range.min) / (range.max - range.min)) * 100 + "%";
      });

      /* ── Change event (mouse release): persist via React once ── */
      rangeInput.addEventListener("change", () => {
        onChange(Number(rangeInput.value));
      });

      const fillTrack = document.createElement("div");
      fillTrack.className = `${CONTEXT_MENU_CLASS}__slider-fill`;
      fillTrack.style.width = ((currentValue - range.min) / (range.max - range.min)) * 100 + "%";

      trackWrap.appendChild(fillTrack);
      trackWrap.appendChild(rangeInput);
      item.appendChild(trackWrap);

      return item;
    };

    menu.appendChild(createCheckItem(
      "\u6E32\u67D3\u5B57\u7B26",
      settings.renderCharacters,
      (value) => onSettingsChange({ ...settings, renderCharacters: value })
    ));

    menu.appendChild(createSeparator());

    menu.appendChild(createRadioGroup("\u7F29\u7565\u56FE\u5927\u5C0F", [
      { value: "proportional", label: "\u6309\u6BD4\u4F8B" },
      { value: "fill", label: "\u586B\u5145" },
    ], settings.size, (value) => onSettingsChange({ ...settings, size: value as MinimapSettings["size"] })));

    menu.appendChild(createRadioGroup("\u7F29\u653E\u6BD4\u4F8B", [
      { value: "1", label: "1x" },
      { value: "1.5", label: "1.5x" },
      { value: "2", label: "2x" },
    ], String(settings.scale), (value) => onSettingsChange({ ...settings, scale: Number(value) })));

    menu.appendChild(createRadioGroup("\u6ED1\u5757\u884C\u4E3A", [
      { value: "always", label: "\u59CB\u7EC8" },
      { value: "mouseover", label: "\u60AC\u505C" },
    ], settings.showSlider, (value) => onSettingsChange({ ...settings, showSlider: value as MinimapSettings["showSlider"] })));

    menu.appendChild(createSeparator());

    menu.appendChild(createSliderControl(
      "\u6ED1\u5757\u7A81\u51FA\u5EA6",
      settings.sliderIntensity,
      { min: SLIDER_INTENSITY_RANGE.min, max: SLIDER_INTENSITY_RANGE.max },
      (value) => onSettingsChange({ ...settings, sliderIntensity: value })
    ));

    document.body.appendChild(menu);
    contextMenuEl = menu;

    const menuRect = menu.getBoundingClientRect();
    if (menuRect.right > window.innerWidth) {
      menu.style.left = `${window.innerWidth - menuRect.width - 4}px`;
    }
    if (menuRect.bottom > window.innerHeight) {
      menu.style.top = `${window.innerHeight - menuRect.height - 4}px`;
    }
  };

  const handleDismissContextMenu = (event: MouseEvent) => {
    if (!contextMenuEl) return;
    if (!contextMenuEl.contains(event.target as Node)) {
      closeContextMenu();
    }
  };

  const handleEscape = (event: KeyboardEvent) => {
    if (event.key === "Escape") closeContextMenu();
  };

  root.addEventListener("contextmenu", handleContextMenu, true);
  document.addEventListener("mousedown", handleDismissContextMenu, true);
  document.addEventListener("keydown", handleEscape, true);

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
      root.removeEventListener("contextmenu", handleContextMenu, true);
      document.removeEventListener("mousedown", handleDismissContextMenu, true);
      document.removeEventListener("keydown", handleEscape, true);
      closeContextMenu();
      root.querySelectorAll<HTMLElement>(`.${OVERLAY_CLASS}`).forEach((el) => el.remove());
    }
  };
}
