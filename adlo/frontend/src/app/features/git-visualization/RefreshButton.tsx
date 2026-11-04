import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useAnimation } from 'motion/react';
import { REFRESH_ARC_PATH } from '@icons';

/**
 * 刷新按钮组件。
 *
 * 使用 motion/react 的 useAnimation 实现点击触发→加载完成停止的精确控制。
 * SVG 图标为环形弧线 (arc)，加载时绕中心旋转。
 *
 * 点击行为：
 * 1. controls.start("animate") — 弧线开始无限旋转（0.8s/圈，linear）
 * 2. await onRefresh() — 等待异步刷新完成
 * 3. controls.start("normal") — 弧线停止旋转（spring 缓动回正）
 *
 * 后续接入真实后端后：onRefresh 为真实 API 请求，动画时长由请求耗时自然决定。
 * 当前 stub 阶段：onRefresh 内部使用固定 delay 模拟，详见 useGitVisRefresh hook。
 *
 * @param onRefresh - 异步刷新回调，动画在其 Promise resolve 后停止
 * @param label - 无障碍标签与 tooltip 文本
 * @param className - 可选附加 class（如 adl-git-vis__refresh-btn--lg）
 */
export function RefreshButton({
  onRefresh,
  label,
  className,
}: {
  onRefresh: () => Promise<void>;
  label: string;
  className?: string;
}) {
  const controls = useAnimation();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleClick = useCallback(async () => {
    if (isRefreshing) {
      return;
    }
    setIsRefreshing(true);
    void controls.start('animate');
    try {
      await onRefresh();
    } catch {
      // Refresh failure is surfaced via the chart error state (setError);
      // swallow the rejection here so the spinner always stops cleanly.
    } finally {
      if (isMountedRef.current) {
        controls.start('normal');
        setIsRefreshing(false);
      }
    }
  }, [onRefresh, controls, isRefreshing]);

  return (
    <button
      type="button"
      className={`adl-git-vis__refresh-btn${className ? ` ${className}` : ''}`}
      onClick={handleClick}
      disabled={isRefreshing}
      title={label}
      aria-label={label}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <motion.path
          animate={controls}
          d={REFRESH_ARC_PATH}
          style={{ transformOrigin: '12px 12px' }}
          variants={{
            normal: { rotate: 0 },
            animate: {
              rotate: 360,
              transition: { repeat: Number.POSITIVE_INFINITY, duration: 0.8, ease: 'linear' },
            },
          }}
          transition={{ type: 'spring', stiffness: 50, damping: 10 }}
        />
      </svg>
    </button>
  );
}
