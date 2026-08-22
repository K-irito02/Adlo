'use client';

import { motion, useReducedMotion, type Variants } from 'motion/react';
import { type ComponentProps, useCallback } from 'react';
import { cn } from '@/lib/utils';

export type ShimmeringTextProps = Omit<ComponentProps<typeof motion.span>, 'children'> & {
  /** The text to render with the shimmering effect. */
  text: string;
  /**
   * Duration in seconds for one shimmer cycle.
   * @defaultValue 1
   */
  duration?: number;
  /**
   * Pause the shimmer (e.g. when the hero leaves the viewport).
   * @defaultValue false
   */
  paused?: boolean;
  /**
   * Legacy alias for `paused`.
   * @defaultValue false
   */
  isStopped?: boolean;
  /**
   * 相邻字符扫光相位的间距缩放因子。默认 1 为现有满带宽（约 70% 文字同时处于高光）；
   * 值越大高光带越窄越集中。仅影响扫光带宽，不影响整体速度。
   * @defaultValue 1
   */
  staggerSpread?: number;
};

export function ShimmeringText({
  text,
  duration = 1,
  isStopped = false,
  paused = false,
  staggerSpread = 1,
  className,
  ...props
}: ShimmeringTextProps) {
  const reducedMotion = useReducedMotion();
  const stopped = isStopped || paused || reducedMotion === true;
  const effectiveStagger = Number.isFinite(staggerSpread) && staggerSpread > 0 ? staggerSpread : 1;

  const createCharVariants = useCallback(
    (charIndex: number): Variants => ({
      running: {
        color: ['var(--color)', 'var(--shimmering-color)', 'var(--color)'],
        transition: {
          duration,
          repeat: Number.POSITIVE_INFINITY,
          repeatType: 'loop',
          repeatDelay: text.length * 0.05,
          delay: ((charIndex * duration) / text.length) * effectiveStagger,
          ease: 'easeInOut',
        },
      },
      stopped: {
        color: 'var(--color)',
        transition: {
          duration: duration * 0.5,
          ease: 'easeOut',
        },
      },
    }),
    [duration, text.length, effectiveStagger],
  );

  return (
    <motion.span
      className={cn(
        'inline-flex select-none items-center leading-none',
        '[--color:var(--chart-foreground-muted,var(--muted-foreground))] [--shimmering-color:var(--chart-foreground,var(--foreground))]',
        className,
      )}
      {...props}
    >
      {text.split('').map((char, index) => (
        <motion.span
          animate={stopped ? 'stopped' : 'running'}
          aria-hidden
          className="inline-block whitespace-pre leading-none"
          initial="stopped"
          // biome-ignore lint/suspicious/noArrayIndexKey: static label text, order never changes
          key={index}
          variants={createCharVariants(index)}
        >
          {char}
        </motion.span>
      ))}
      <span className="sr-only">{text}</span>
    </motion.span>
  );
}
