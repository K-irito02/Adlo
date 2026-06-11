import { useCallback, useEffect, useRef } from 'react';

interface NavigatorResizeOptions {
  onWidthCommit: (width: number) => void;
  minWidth?: number;
  maxWidth?: number;
}

export function useNavigatorResize({
  onWidthCommit,
  minWidth = 180,
  maxWidth = 300,
}: NavigatorResizeOptions) {
  const rafRef = useRef(0);
  const onWidthCommitRef = useRef(onWidthCommit);

  useEffect(() => {
    onWidthCommitRef.current = onWidthCommit;
  }, [onWidthCommit]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);

      const navigator = target.closest<HTMLElement>('.adl-tool-navigator');
      if (!navigator) {
        return;
      }

      const startX = event.clientX;
      const startWidth = navigator.offsetWidth;
      const body = document.body;
      body.classList.add('adl-is-resizing');

      const handleMove = (moveEvent: PointerEvent) => {
        if (rafRef.current) {
          return;
        }
        rafRef.current = window.requestAnimationFrame(() => {
          rafRef.current = 0;
          const delta = moveEvent.clientX - startX;
          navigator.style.width = `${Math.max(minWidth, Math.min(maxWidth, startWidth + delta))}px`;
        });
      };

      const handleUp = () => {
        if (rafRef.current) {
          window.cancelAnimationFrame(rafRef.current);
          rafRef.current = 0;
        }
        body.classList.remove('adl-is-resizing');
        onWidthCommitRef.current(navigator.offsetWidth);
        target.removeEventListener('pointermove', handleMove);
        target.removeEventListener('pointerup', handleUp);
        target.removeEventListener('pointercancel', handleUp);
        target.removeEventListener('lostpointercapture', handleUp);
      };

      target.addEventListener('pointermove', handleMove);
      target.addEventListener('pointerup', handleUp);
      target.addEventListener('pointercancel', handleUp);
      target.addEventListener('lostpointercapture', handleUp);
    },
    [minWidth, maxWidth]
  );

  return { handlePointerDown };
}
