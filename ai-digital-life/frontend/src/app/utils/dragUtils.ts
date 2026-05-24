export function moveIdWithinBucket(ids: string[], draggedId: string, targetId: string): string[] {
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
