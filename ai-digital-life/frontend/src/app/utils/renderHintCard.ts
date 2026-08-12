export interface RenderHintCardOptions {
  content: string;
  buttonRect: DOMRect;
  menuRect: DOMRect;
  direction?: 'right' | 'left';
  onCardMouseEnter?: () => void;
  onCardMouseLeave?: () => void;
}

function appendHintCardContent(card: HTMLElement, content: string): void {
  const lines = content.split('\n');
  lines.forEach((rawLine, idx) => {
    const line = rawLine;
    if (line.startsWith('· ')) {
      const item = document.createElement('div');
      item.className = 'adl-sub-hint-card__bullet-line';
      const bullet = document.createElement('span');
      bullet.className = 'adl-sub-hint-card__bullet';
      bullet.textContent = '·';
      const text = document.createElement('span');
      text.className = 'adl-sub-hint-card__bullet-text';
      text.textContent = line.slice(2);
      item.appendChild(bullet);
      item.appendChild(text);
      card.appendChild(item);
    } else if (line) {
      const p = document.createElement('div');
      p.className = 'adl-sub-hint-card__line';
      p.textContent = line;
      card.appendChild(p);
    } else if (idx !== lines.length - 1) {
      card.appendChild(document.createElement('br'));
    }
  });
}

/**
 * Creates and appends hint card DOM elements (card + arrow + arrow border).
 * Elements are appended to `document.body` because they use `position: fixed`
 * with viewport-space coordinates — appending inside a transformed ancestor
 * (e.g. `.adl-rightpanel__content`) would make `position: fixed` resolve
 * against that box instead of the viewport, misplacing the card by the
 * panel's offset. This mirrors `HintCardTrigger`, which portals to `body`.
 *
 * Returns [card, arrow, arrowBorder] for cleanup purposes.
 */
export function renderHintCard({
  content,
  buttonRect,
  menuRect,
  direction = 'right',
  onCardMouseEnter,
  onCardMouseLeave,
}: RenderHintCardOptions): HTMLElement[] {
  const centerY = buttonRect.top + buttonRect.height / 2;

  const card = document.createElement('div');
  card.className = `adl-sub-hint-card${direction === 'left' ? ' adl-sub-hint-card--left' : ''}`;
  appendHintCardContent(card, content);
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

  document.body.appendChild(card);
  document.body.appendChild(arrow);
  document.body.appendChild(arrowBorder);

  return [card, arrow, arrowBorder];
}
