export function moveIdBeforeTarget(ids: string[], draggedId: string, targetId: string): string[] {
  const next = ids.filter((id) => id !== draggedId);
  const targetIndex = next.indexOf(targetId);
  if (targetIndex < 0) {
    next.push(draggedId);
    return next;
  }
  next.splice(targetIndex, 0, draggedId);
  return next;
}

export function moveIdToBucketEnd(ids: string[], draggedId: string): string[] {
  const next = ids.filter((id) => id !== draggedId);
  next.push(draggedId);
  return next;
}

export function moveIdAfterTarget(ids: string[], draggedId: string, targetId: string): string[] {
  const next = ids.filter((id) => id !== draggedId);
  const targetIndex = next.indexOf(targetId);
  if (targetIndex < 0) {
    next.push(draggedId);
    return next;
  }
  next.splice(targetIndex + 1, 0, draggedId);
  return next;
}

/**
 * Merge an external id list into a current order. Preserves the current order
 * for ids still present in `externalIds`, and appends new ids (in external
 * order) at the end. Used to keep `localOrder` in sync when `workspaceItems`
 * changes externally (pin/unpin, add/remove workspace).
 */
export function mergeOrderPreserving(currentOrder: string[], externalIds: string[]): string[] {
  const externalSet = new Set(externalIds);
  const kept = currentOrder.filter((id) => externalSet.has(id));
  const existing = new Set(currentOrder);
  const appended = externalIds.filter((id) => !existing.has(id));
  return [...kept, ...appended];
}

/**
 * Compute the new full-list order after a single-bucket reorder.
 *
 * Splits `currentOrder` into same-bucket ids and other-bucket ids, reorders
 * the same-bucket slice using `moveIdBeforeTarget` / `moveIdAfterTarget`,
 * then recombines with pinned-first ordering (matches the WorkspaceList
 * render convention).
 *
 * `isPinnedById` is a lookup function so callers can pass a Map or a closure
 * over `workspaceItems`.
 */
export function computeReorderedList(
  currentOrder: string[],
  draggedId: string,
  targetId: string,
  position: 'before' | 'after',
  isPinnedBucket: boolean,
  isPinnedById: (id: string) => boolean
): string[] {
  // No-op when dragged and target are the same. Without this guard, the
  // underlying moveId*Target helpers would treat the dragged id as "not
  // found" (they filter it out first) and append it to the bucket end,
  // which is not the intent of "drop on self".
  if (draggedId === targetId) {
    return currentOrder;
  }

  const bucketIds = currentOrder.filter((id) => isPinnedById(id) === isPinnedBucket);
  const otherIds = currentOrder.filter((id) => isPinnedById(id) !== isPinnedBucket);
  const nextBucket =
    position === 'after'
      ? moveIdAfterTarget(bucketIds, draggedId, targetId)
      : moveIdBeforeTarget(bucketIds, draggedId, targetId);
  return isPinnedBucket ? [...nextBucket, ...otherIds] : [...otherIds, ...nextBucket];
}
