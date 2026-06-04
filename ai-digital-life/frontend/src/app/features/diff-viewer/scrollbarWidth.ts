let initialized = false;

export function initScrollbarWidth(): void {
  if (initialized) return;
  initialized = true;

  if (typeof document === 'undefined') return;

  const outer = document.createElement('div');
  outer.style.cssText = [
    'position: fixed',
    'left: -9999px',
    'top: -9999px',
    'overflow: scroll',
    'scrollbar-width: thin',
  ].join(';');
  document.body.appendChild(outer);
  const inner = document.createElement('div');
  outer.appendChild(inner);
  const width = outer.offsetWidth - inner.offsetWidth;
  document.body.removeChild(outer);

  document.documentElement.style.setProperty('--adl-scrollbar-width', `${width}px`);
}
