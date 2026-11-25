import { useEffect, useRef, useState } from 'react';
import './VolumePercent.css';

interface VolumePercentProps {
  /** 0–1 */
  volume: number;
  label: string;
  /** 悬停提示（原生 title）。 */
  editHint: string;
  onVolumeChange: (volume: number) => void;
  className?: string;
}

function toPercent(volume: number): number {
  return Math.round(Math.min(1, Math.max(0, volume)) * 100);
}

/**
 * 双击进入编辑的百分比数值（原生 input，Enter/失焦提交，Esc 取消）。
 *
 * 外层固定宽度的 slot 保证显示态与编辑态宽度一致——双击时进度条长度不会跳动。
 */
export function VolumePercent({
  volume,
  label,
  editHint,
  onVolumeChange,
  className,
}: VolumePercentProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const percent = toPercent(volume);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const parsed = Number(draft.replace('%', '').trim());
    if (Number.isFinite(parsed)) {
      onVolumeChange(Math.min(100, Math.max(0, parsed)) / 100);
    }
    setEditing(false);
  };

  return (
    <span className={`adl-volume-percent-slot${className ? ` ${className}` : ''}`}>
      {editing ? (
        <input
          ref={inputRef}
          className="adl-volume-percent__input"
          type="text"
          inputMode="numeric"
          value={draft}
          aria-label={label}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.stopPropagation();
              commit();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              setEditing(false);
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="adl-volume-percent"
          onDoubleClick={() => {
            setDraft(String(percent));
            setEditing(true);
          }}
          title={editHint}
          aria-label={label}
        >
          {percent}%
        </button>
      )}
    </span>
  );
}
