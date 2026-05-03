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
};

export const MINIMAP_DEFAULTS: MinimapSettings = {
  renderCharacters: true,
  size: "proportional",
  scale: 1.5,
  showSlider: "always",
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
};

type VisualFrameInput = {
  minimapHeight: number;
  scrollRatio: number;
  visualHeight: number;
};

export type MinimapVisualFrame = {
  top: number;
  height: number;
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

function syncMinimapOverlay(
  minimap: HTMLElement,
  options?: MinimapOverlayOptions
) {
  const { getScrollState } = options ?? {};
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
  const { getScrollState, setScrollTop, onSettingsChange, getSettings } = options ?? {};
  let disposed = false;
  let rafId = 0;
  const interactionDisposers = new Map<HTMLElement, () => void>();
  let contextMenuEl: HTMLElement | null = null;

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
  };

  const overlayOptions: MinimapOverlayOptions = {
    getScrollState,
    setScrollTop,
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

    menu.appendChild(createCheckItem(
      "渲染字符",
      settings.renderCharacters,
      (value) => onSettingsChange({ ...settings, renderCharacters: value })
    ));

    menu.appendChild(createRadioGroup("缩略图大小", [
      { value: "proportional", label: "按比例" },
      { value: "fill", label: "填充" },
    ], settings.size, (value) => onSettingsChange({ ...settings, size: value as MinimapSettings["size"] })));

    menu.appendChild(createRadioGroup("缩放比例", [
      { value: "1", label: "1x" },
      { value: "1.5", label: "1.5x" },
      { value: "2", label: "2x" },
    ], String(settings.scale), (value) => onSettingsChange({ ...settings, scale: Number(value) })));

    menu.appendChild(createRadioGroup("滑块行为", [
      { value: "always", label: "始终" },
      { value: "mouseover", label: "悬停" },
    ], settings.showSlider, (value) => onSettingsChange({ ...settings, showSlider: value as MinimapSettings["showSlider"] })));

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

  root.addEventListener("contextmenu", handleContextMenu);
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
      root.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("mousedown", handleDismissContextMenu, true);
      document.removeEventListener("keydown", handleEscape, true);
      closeContextMenu();
      root.querySelectorAll<HTMLElement>(`.${OVERLAY_CLASS}`).forEach((el) => el.remove());
    }
  };
}
