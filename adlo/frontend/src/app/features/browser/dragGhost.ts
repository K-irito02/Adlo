/**
 * 内部拖拽的“抬起副本”：克隆被拖拽行/标题，固定在光标下。
 * 原型行仍留在原位，副本只负责跟随光标，不接收指针事件。
 */
export interface DragGhostHandle {
  move: (clientX: number, clientY: number) => void;
  remove: () => void;
}

export function createDragGhost(
  source: HTMLElement,
  pointerX: number,
  pointerY: number,
): DragGhostHandle {
  const cloneSource = source.classList.contains('adl-browser-entry')
    ? (source.querySelector<HTMLElement>('.adl-browser-entry__header') ?? source)
    : source;
  const sourceRect = cloneSource.getBoundingClientRect();
  const element = cloneSource.cloneNode(true) as HTMLElement;

  element.classList.add('adl-browser-dnd-lift');
  element.setAttribute('aria-hidden', 'true');
  element.removeAttribute('data-testid');
  element.removeAttribute('data-path');
  element.removeAttribute('data-tab-index');
  element.removeAttribute('data-tab-end');
  element.removeAttribute('data-dnd-category');
  element.removeAttribute('id');
  element.style.margin = '0';
  element.style.width = `${sourceRect.width}px`;
  element.style.height = `${sourceRect.height}px`;
  element.style.left = `${sourceRect.left}px`;
  element.style.top = `${sourceRect.top}px`;
  document.body.appendChild(element);

  const offsetX = pointerX - sourceRect.left;
  const offsetY = pointerY - sourceRect.top;

  return {
    move: (clientX: number, clientY: number) => {
      element.style.left = `${clientX - offsetX}px`;
      element.style.top = `${clientY - offsetY}px`;
    },
    remove: () => element.remove(),
  };
}
