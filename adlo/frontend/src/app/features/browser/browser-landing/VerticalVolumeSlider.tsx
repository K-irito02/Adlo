import { useCallback, useRef } from 'react';
import './VerticalVolumeSlider.css';

interface VerticalVolumeSliderProps {
  /** 0–1 */
  value: number;
  onVolumeChange: (value: number) => void;
  label: string;
  className?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 自绘竖向音量滑杆：细轨 + 圆点。
 * 拖拽用 window 级 pointermove/pointerup，避免元素重渲染或指针移出时丢失拖动。
 */
export function VerticalVolumeSlider({
  value,
  onVolumeChange,
  label,
  className,
}: VerticalVolumeSliderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const percent = Math.round(clamp(value, 0, 1) * 100);

  const applyFromClientY = useCallback(
    (clientY: number) => {
      const track = trackRef.current;
      if (!track) {
        return;
      }
      const rect = track.getBoundingClientRect();
      if (rect.height <= 0) {
        return;
      }
      const ratio = 1 - (clientY - rect.top) / rect.height;
      onVolumeChange(clamp(ratio, 0, 1));
    },
    [onVolumeChange],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      draggingRef.current = true;
      applyFromClientY(event.clientY);
      const handleMove = (moveEvent: PointerEvent) => {
        if (draggingRef.current) {
          applyFromClientY(moveEvent.clientY);
        }
      };
      const stop = () => {
        draggingRef.current = false;
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', stop);
        window.removeEventListener('pointercancel', stop);
      };
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', stop);
      window.addEventListener('pointercancel', stop);
    },
    [applyFromClientY],
  );

  return (
    <div
      ref={trackRef}
      className={`adl-vslider${className ? ` ${className}` : ''}`}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-orientation="vertical"
      onPointerDown={handlePointerDown}
      onDragStart={(event) => event.preventDefault()}
      onWheel={(event) => {
        event.stopPropagation();
        onVolumeChange(clamp(value + (event.deltaY < 0 ? 0.05 : -0.05), 0, 1));
      }}
      onKeyDown={(event) => {
        const step = event.key === 'PageUp' || event.key === 'PageDown' ? 0.1 : 0.05;
        if (event.key === 'ArrowUp' || event.key === 'PageUp') {
          event.preventDefault();
          onVolumeChange(clamp(value + step, 0, 1));
        } else if (event.key === 'ArrowDown' || event.key === 'PageDown') {
          event.preventDefault();
          onVolumeChange(clamp(value - step, 0, 1));
        } else if (event.key === 'Home') {
          event.preventDefault();
          onVolumeChange(0);
        } else if (event.key === 'End') {
          event.preventDefault();
          onVolumeChange(1);
        }
      }}
    >
      <div className="adl-vslider__track">
        <div className="adl-vslider__fill" style={{ height: `${percent}%` }} />
        <div className="adl-vslider__thumb" style={{ bottom: `${percent}%` }} />
      </div>
    </div>
  );
}
