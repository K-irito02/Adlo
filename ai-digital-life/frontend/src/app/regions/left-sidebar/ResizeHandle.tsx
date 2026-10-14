import { useCallback, useEffect, useRef } from 'react';
import { useTCopy } from '../../i18n/useTCopy';
import { useAppStore } from '../../stores/slicedStore';
import {
  LEFT_PANEL_WIDTH_MIN,
  LEFT_PANEL_WIDTH_MAX,
  DEFAULT_LEFT_PANEL_WIDTH,
} from '../../stores/slices/uiSliceTypes';

export function ResizeHandle() {
  const { t } = useTCopy();
  const draggingRef = useRef(false);
  const rafRef = useRef(0);
  const cleanupDragRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (cleanupDragRef.current) {
        cleanupDragRef.current();
        cleanupDragRef.current = null;
      }
    };
  }, []);

  const handleResizeMouseDown = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const shellBody = document.querySelector<HTMLElement>('.adl-shell__body');
    if (!shellBody) {
      return;
    }
    draggingRef.current = true;
    shellBody.classList.add('is-resizing');
    const startX = event.clientX;
    const root = document.documentElement;
    // 起始宽度读 shellBody 的实时计算值（App 已把 store 持久化宽度以内联 --leftbar-width 落到该元素）；
    // min/max 仍读 :root 上的设计 token。
    const startWidth = Math.round(
      parseFloat(getComputedStyle(shellBody).getPropertyValue('--leftbar-width')) ||
        DEFAULT_LEFT_PANEL_WIDTH,
    );
    const minWidth =
      parseFloat(getComputedStyle(root).getPropertyValue('--leftbar-width-min')) ||
      LEFT_PANEL_WIDTH_MIN;
    const maxWidth =
      parseFloat(getComputedStyle(root).getPropertyValue('--leftbar-width-max')) ||
      LEFT_PANEL_WIDTH_MAX;
    // 中央区最小宽只有 CSS token（center.css），无 store 常量，缺失时回退 360。
    const centerMinWidth =
      parseFloat(getComputedStyle(root).getPropertyValue('--center-width-min')) || 360;
    const latestWidth = { current: startWidth };

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!draggingRef.current || rafRef.current) {
        return;
      }
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        const delta = moveEvent.clientX - startX;
        // 网格实际预留的右侧宽度：docked 用面板宽（真实网格列，必须预留否则挤出视口）；
        // overlay（含部分/全覆盖）不预留——面板绝对定位不占网格，锚列是固定值，
        // 若按它预留会把左栏钉死在进入覆盖时的宽度（事项 7）。左栏 token 范围仅
        // 80px（180–260），最大增量远小于中心下限 360，网格不会溢出，由中心吸收；
        // 全覆盖时中心隐藏故连中心下限也不保留；右栏收起为 0。
        // （事项 1-A 修过用面板绝对宽度导致的钉死；事项 7 修 overlay 下仍用锚列宽
        // 导致的钉死。docked 下仍按面板宽+中心下限保护，此为预期行为。）
        let reservedRight = 0;
        let centerReserve = centerMinWidth;
        if (!shellBody.classList.contains('is-right-collapsed')) {
          if (shellBody.classList.contains('is-rightpanel-overlay-expanded')) {
            reservedRight = 0;
            centerReserve = 0;
          } else if (!shellBody.classList.contains('is-rightpanel-overlay-active')) {
            reservedRight =
              parseFloat(getComputedStyle(shellBody).getPropertyValue('--rightpanel-width')) || 0;
          }
        }
        const shellWidth = shellBody.getBoundingClientRect().width;
        const allowedMax = Math.max(minWidth, shellWidth - reservedRight - centerReserve);
        const newWidth = Math.min(
          Math.min(maxWidth, allowedMax),
          Math.max(minWidth, startWidth + delta),
        );
        // 取整后提交与直写：避免亚像素小数落盘，且零位移时恒等于 store 值而跳过写入。
        latestWidth.current = Math.round(newWidth);
        // 拖拽中直写 DOM（避免逐帧 setState 重渲染）；释放时一次性 commit 到 store 持久化。
        shellBody.style.setProperty('--leftbar-width', `${latestWidth.current}px`);
      });
    };

    const cleanup = () => {
      // mouseup/blur/unmount 可能重复进入，首次之后互斥。
      if (!draggingRef.current) {
        return;
      }
      draggingRef.current = false;
      shellBody.classList.remove('is-resizing');
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      // 释放时 commit：持久化到 localStorage 并同步 store（App 内联样式取同一值，无闪动）。
      // 仅值变化时写，避免 unmount/blur 无位移时的多余写入与重渲染。
      const store = useAppStore.getState();
      if (latestWidth.current !== store.leftbarWidth) {
        store.setLeftbarWidth(latestWidth.current);
      }
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onBlur);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      cleanupDragRef.current = null;
    };

    const onBlur = () => cleanup();
    const onMouseUp = () => cleanup();

    cleanupDragRef.current = cleanup;
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('blur', onBlur);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  return (
    <div
      className="adl-leftbar__resize-handle"
      onMouseDown={handleResizeMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label={t.resizeSidebar}
    />
  );
}
