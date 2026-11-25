import { useCallback, useRef } from 'react';
import './HorizontalVolumeSlider.css';

interface HorizontalVolumeSliderProps {
  /** 0–1 */
  value: number;
  onVolumeChange: (value: number) => void;
  label: string;
  className?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 弹窗内的 S1 横向滑杆：细轨 + 圆点；拖拽用 window 级事件，避免丢失。 */
export function HorizontalVolumeSlider({
  value,
  onVolumeChange,
  label,
  className,
}: HorizontalVolumeSliderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const percent = Math.round(clamp(value, 0, 1) * 100);

  const applyFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) {
        return;
      }
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) {
        return;
      }
      onVolumeChange(clamp((clientX - rect.left) / rect.width, 0, 1));
    },
    [onVolumeChange],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      draggingRef.current = true;
      applyFromClientX(event.clientX);
      const handleMove = (moveEvent: PointerEvent) => {
        if (draggingRef.current) {
          applyFromClientX(moveEvent.clientX);
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
    [applyFromClientX],
  );

  return (
    <div
      ref={trackRef}
      className={`adl-hslider${className ? ` ${className}` : ''}`}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-orientation="horizontal"
      onPointerDown={handlePointerDown}
      onDragStart={(event) => event.preventDefault()}
      onWheel={(event) => {
        event.stopPropagation();
        onVolumeChange(clamp(value + (event.deltaY < 0 ? 0.05 : -0.05), 0, 1));
      }}
      onKeyDown={(event) => {
        const step = event.key === 'PageUp' || event.key === 'PageDown' ? 0.1 : 0.05;
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'PageUp') {
          event.preventDefault();
          onVolumeChange(clamp(value + step, 0, 1));
        } else if (
          event.key === 'ArrowLeft' ||
          event.key === 'ArrowDown' ||
          event.key === 'PageDown'
        ) {
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
      <div className="adl-hslider__track">
        <div className="adl-hslider__fill" style={{ width: `${percent}%` }} />
        <div className="adl-hslider__thumb" style={{ left: `${percent}%` }} />
      </div>
    </div>
  );
}
