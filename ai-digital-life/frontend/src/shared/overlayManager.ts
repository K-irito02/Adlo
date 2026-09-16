const OVERLAY_SELECTORS = [
  '.adl-sidebar-menu',
  '.adl-multitree-entry__menu',
  '.adl-menu__dropdown',
  '.adl-search-engine-popover',
  '.adl-download-menu',
  '.adl-confirm-overlay',
  '.adl-hamburger__dropdown',
  '.adl-hamburger__submenu',
  '.hint-card',
  '.adl-prompt-modal',
  '.adl-clipboard-viewer',
  '.adl-toast',
  '.toast-card',
  '.toast-card-region',
  '.adl-statusbar__menu',
  '.adl-statusbar__model-menu',
  '.adl-conflict-modal-overlay',
  '.adl-notif-dropdown',
] as const;

export const WEBVIEW_OVERLAY_SELECTOR = OVERLAY_SELECTORS.join(', ');

type SubscriberCallback = (isOverlapped: boolean) => void;

interface Subscriber {
  container: HTMLElement;
  callback: SubscriberCallback;
}

class OverlayManagerClass {
  private observer: MutationObserver | null = null;
  private rafId: number | null = null;
  private subscribers: Set<Subscriber> = new Set();
  private selector = WEBVIEW_OVERLAY_SELECTOR;

  subscribe(container: HTMLElement, callback: SubscriberCallback): () => void {
    const sub: Subscriber = { container, callback };
    this.subscribers.add(sub);

    if (this.subscribers.size === 1) {
      this.startObserver();
    }

    const overlaps = this.checkOverlap(container);
    callback(overlaps);

    return () => {
      this.subscribers.delete(sub);
      if (this.subscribers.size === 0) {
        this.stopObserver();
      }
    };
  }

  checkOverlap(container: HTMLElement): boolean {
    const overlays = document.querySelectorAll(this.selector);
    if (overlays.length === 0) {
      return false;
    }

    const containerRect = container.getBoundingClientRect();

    for (const el of overlays) {
      const overlayRect = el.getBoundingClientRect();
      if (
        overlayRect.left < containerRect.right &&
        overlayRect.right > containerRect.left &&
        overlayRect.top < containerRect.bottom &&
        overlayRect.bottom > containerRect.top
      ) {
        return true;
      }
    }
    return false;
  }

  getSelector(): string {
    return this.selector;
  }

  private scheduleCheck = () => {
    if (this.rafId !== null) {
      return;
    }
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.notifySubscribers();
    });
  };

  private notifySubscribers() {
    for (const sub of this.subscribers) {
      const overlaps = this.checkOverlap(sub.container);
      sub.callback(overlaps);
    }
  }

  private startObserver() {
    if (this.observer) {
      return;
    }
    this.observer = new MutationObserver(this.scheduleCheck);
    this.observer.observe(document.body, { childList: true, subtree: true });
    this.notifySubscribers();
  }

  private stopObserver() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}

let instance: OverlayManagerClass | null = null;

export function getOverlayManager(): OverlayManagerClass {
  if (!instance) {
    instance = new OverlayManagerClass();
  }
  return instance;
}
