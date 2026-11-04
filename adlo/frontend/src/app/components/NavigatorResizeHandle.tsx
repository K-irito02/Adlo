import React from 'react';

interface NavigatorResizeHandleProps {
  label: string;
  minWidth: number;
  maxWidth: number;
  currentWidth: number;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
}

export const NavigatorResizeHandle = React.memo(function NavigatorResizeHandle({
  label,
  minWidth,
  maxWidth,
  currentWidth,
  onPointerDown,
}: NavigatorResizeHandleProps) {
  return (
    <div
      className="adl-tool-navigator__resize-handle"
      onPointerDown={onPointerDown}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-valuenow={currentWidth}
    />
  );
});
