/**
 * 内部拖拽的「抬起副本」：克隆被拖拽行/标题，固定在光标下。
 * 原型行仍留在原位，副本只负责跟随光标，不接收指针事件。
 *
 * 浏览器书签树与文件/变更导航树共用同一份实现。
 */
export interface DragGhostHandle {
  move: (clientX: number, clientY: number) => void;
  remove: () => void;
}

/**
 * 克隆源元素时的可见区域：书签树的行包装里含整棵子树，
 * 幽灵只该是「行」本身，因此优先取 header。
 */
function ghostSource(source: HTMLElement): HTMLElement {
  if (source.classList.contains('adl-browser-entry')) {
    return source.querySelector<HTMLElement>('.adl-browser-entry__header') ?? source;
  }
  // 文件/变更树：克隆整个 <li>（保留 `--adl-tree-indent` / `--adl-tree-row-offset`
  // 内联变量与行宽），随后在克隆体里移除嵌套子树，只留下这一行。
  return source;
}

export function createDragGhost(
  source: HTMLElement,
  pointerX: number,
  pointerY: number,
): DragGhostHandle {
  const cloneSource = ghostSource(source);
  const sourceRect = cloneSource.getBoundingClientRect();
  const element = cloneSource.cloneNode(true) as HTMLElement;

  // 文件/变更树的节点是 <li>：去掉克隆体里嵌套的子树，只保留这一行，
  // 同时保留 li 上的内联缩进变量与行宽。
  if (element.tagName === 'LI') {
    element.querySelectorAll('ul').forEach((child) => child.remove());
    // 行的宽度必须与侧栏一致：书签树副本的 1.03 放大不适用于整行宽的树行。
    element.classList.add('adl-browser-dnd-lift--tree');
  }

  element.classList.add('adl-browser-dnd-lift');
  element.setAttribute('aria-hidden', 'true');
  element.removeAttribute('data-testid');
  element.removeAttribute('data-path');
  element.removeAttribute('data-workspace-id');
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
