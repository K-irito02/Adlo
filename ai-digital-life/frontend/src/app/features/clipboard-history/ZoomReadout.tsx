import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { clampZoomRatio, formatZoomPercent, parseZoomPercentInput } from './zoomPercent';

interface ZoomReadoutProps {
  /** 当前缩放比例（1 = 100%）。 */
  value: number;
  /** 下界（比例制，如 0.25 = 25%）。 */
  min: number;
  /** 上界（比例制，如 4 = 400%）。 */
  max: number;
  /** 未进入编辑态时的单击行为（重置到 100%）。 */
  onReset: () => void;
  /** 提交合法数值后的回调，收到已钳制到 [min,max] 的比例。 */
  onCommit: (value: number) => void;
  /** 未进入编辑态时按钮的 aria-label。 */
  resetLabel: string;
  /** 进入编辑态时输入框的 aria-label。 */
  inputLabel: string;
  /** 输入框 title（提示可用范围）。 */
  rangeHint: string;
  /** 未进入编辑态时按钮的 class（沿用调用方的 `adl-icon-btn` 系样式）。 */
  className: string;
}

/**
 * 缩放百分比读数：单击重置到 100%，**双击进入内联数值编辑**。
 *
 * 文本字号与图片缩放共用本组件（各自 min/max 不同），编辑态用编辑底色提示。
 *
 * 键盘：Enter 提交、Esc 取消、Tab/失焦提交。Enter/Esc 都 `stopPropagation()`，
 * 让弹窗级 document 键盘处理（Esc 关弹窗 / 撤销文本编辑）不误触发。
 */
export function ZoomReadout({
  value,
  min,
  max,
  onReset,
  onCommit,
  resetLabel,
  inputLabel,
  rangeHint,
  className,
}: ZoomReadoutProps) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Enter 提交会先卸载输入框，浏览器随之补一次 blur；用一次性门控避免重复提交。
  const closingRef = useRef(false);
  // 单击延迟：双击 = 两次 click + 一次 dblclick，直接重置会让双击先把值清零。
  // 220ms 内等 dblclick，到了就取消重置、进入编辑；等不到才真正重置。
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== undefined) {
        clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!editing) {
      return;
    }
    const input = inputRef.current;
    input?.focus();
    input?.select();
  }, [editing]);

  const open = () => {
    closingRef.current = false;
    setEditing(true);
  };

  const close = (commit: boolean) => {
    if (closingRef.current) {
      return;
    }
    closingRef.current = true;
    const input = inputRef.current;
    const percent = input ? parseZoomPercentInput(input.value) : null;
    if (commit && percent !== null) {
      onCommit(clampZoomRatio(percent, min, max));
    }
    setEditing(false);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(false);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="adl-clipboard-viewer__zoom-input"
        // 非受控：编辑期间值可任意（含 "-" / "1." 等中间态），
        // 只有提交时才解析 —— 受控会立刻把非法中间态回滚掉。
        defaultValue={String(Math.round(value * 100))}
        aria-label={inputLabel}
        title={rangeHint}
        inputMode="decimal"
        autoComplete="off"
        onKeyDown={handleKeyDown}
        onBlur={() => close(true)}
      />
    );
  }

  return (
    <button
      type="button"
      className={className}
      title={resetLabel}
      onClick={(event) => {
        // 双击的第 2 次 click（detail>1）忽略，交给 onDoubleClick；
        // 第 1 次 click 延迟执行，可被随后到达的 dblclick 取消。
        if (event.detail > 1) {
          return;
        }
        if (resetTimerRef.current !== undefined) {
          clearTimeout(resetTimerRef.current);
        }
        resetTimerRef.current = setTimeout(() => {
          resetTimerRef.current = undefined;
          onReset();
        }, 220);
      }}
      onDoubleClick={() => {
        if (resetTimerRef.current !== undefined) {
          clearTimeout(resetTimerRef.current);
          resetTimerRef.current = undefined;
        }
        open();
      }}
      aria-label={resetLabel}
    >
      {formatZoomPercent(value)}
    </button>
  );
}
