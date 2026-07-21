export interface RenderHintCardOptions {
  content: string;
  buttonRect: DOMRect;
  menuRect: DOMRect;
  containerEl: HTMLElement;
  direction?: 'right' | 'left';
  onCardMouseEnter?: () => void;
  onCardMouseLeave?: () => void;
}

/**
 * Creates and appends hint card DOM elements (card + arrow + arrow border)
 * to a container element (typically the parent menu). Avoids duplicating
 * this imperative DOM construction across 5+ context menu components.
 *
 * Returns [card, arrow, arrowBorder] for cleanup purposes.
 */
export function renderHintCard({
  content,
  buttonRect,
  menuRect,
  containerEl,
  direction = 'right',
  onCardMouseEnter,
  onCardMouseLeave,
}: RenderHintCardOptions): HTMLElement[] {
  const centerY = buttonRect.top + buttonRect.height / 2;

  const card = document.createElement('div');
  card.className = `adl-sub-hint-card${direction === 'left' ? ' adl-sub-hint-card--left' : ''}`;
  card.textContent = content;
  card.style.pointerEvents = 'auto';
  card.style.userSelect = 'text';
  if (direction === 'left') {
    card.style.right = `${window.innerWidth - menuRect.left + 1}px`;
  } else {
    card.style.left = `${menuRect.right + 1}px`;
  }
  card.style.top = `${centerY}px`;
  card.style.transform = 'translateY(-50%)';
  card.addEventListener('mousedown', (e) => e.stopPropagation());
  if (onCardMouseEnter) {
    card.addEventListener('mouseenter', onCardMouseEnter);
  }
  if (onCardMouseLeave) {
    card.addEventListener('mouseleave', onCardMouseLeave);
  }

  const arrow = document.createElement('div');
  arrow.className = `adl-sub-hint-card__arrow${direction === 'left' ? ' adl-sub-hint-card__arrow--left' : ''}`;
  if (direction === 'left') {
    arrow.style.left = `${menuRect.left}px`;
  } else {
    arrow.style.left = `${menuRect.right - 4}px`;
  }
  arrow.style.top = `${centerY - 4}px`;

  const arrowBorder = document.createElement('div');
  arrowBorder.className = `adl-sub-hint-card__arrow-border${direction === 'left' ? ' adl-sub-hint-card__arrow-border--left' : ''}`;
  if (direction === 'left') {
    arrowBorder.style.left = `${menuRect.left}px`;
  } else {
    arrowBorder.style.left = `${menuRect.right - 5}px`;
  }
  arrowBorder.style.top = `${centerY - 5}px`;

  containerEl.appendChild(card);
  containerEl.appendChild(arrow);
  containerEl.appendChild(arrowBorder);

  return [card, arrow, arrowBorder];
}
