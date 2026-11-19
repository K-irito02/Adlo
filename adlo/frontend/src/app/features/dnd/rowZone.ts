/** 行内三区判定：上 20% 插入前、中间 放入、下 20% 插入后。 */
export function rowZone(clientY: number, rect: DOMRect): 'before' | 'after' | 'middle' {
  const y = clientY - rect.top;
  if (y <= rect.height * 0.2) {
    return 'before';
  }
  if (y >= rect.height * 0.8) {
    return 'after';
  }
  return 'middle';
}

/** 文件行只支持前后插入，用中线二分；不提供「放入文件」。 */
export function fileRowZone(clientY: number, rect: DOMRect): 'before' | 'after' {
  const y = clientY - rect.top;
  return y > rect.height / 2 ? 'after' : 'before';
}

export function closestElement(target: EventTarget | null, selector: string): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(selector) : null;
}
