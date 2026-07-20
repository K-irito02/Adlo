import { useRef, useEffect, useMemo } from 'react';

import keRanRaw from '../assets/logos/ke-ran.svg?raw';
import koraRaw from '../assets/logos/kora.svg?raw';

interface LogoSvgProps {
  language: string;
  color: string;
  width?: number;
  strokeWidth?: number;
  staggerDelay?: number;
  drawDuration?: number;
  pauseDuration?: number;
}

function parseSvgPaths(raw: string): string[] {
  const paths: string[] = [];
  const re = /<path\s+d="([^"]+)"/g;
  let m = re.exec(raw);
  while (m) {
    paths.push(m[1]);
    m = re.exec(raw);
  }
  return paths;
}

function parseViewBox(raw: string): string {
  return raw.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 100 100';
}

function avgX(d: string): number {
  const nums = [...d.matchAll(/[MLQCATSZ]\s*([-\d.]+)/g)].map((r) => parseFloat(r[1]));
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function sortLeftToRight(paths: string[]): string[] {
  return [...paths].sort((a, b) => avgX(a) - avgX(b));
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

interface AnimState {
  offset: number;
  opacity: number;
}

function computeAnimState(
  elapsed: number,
  length: number,
  draw: number,
  hold: number,
  total: number,
): AnimState {
  const cycleTime = elapsed % total;
  if (cycleTime < draw) {
    const p = easeInOutCubic(cycleTime / draw);
    return { offset: lerp(length, 0, p), opacity: lerp(0, 1, p) };
  }
  if (cycleTime < draw + hold) {
    return { offset: 0, opacity: 1 };
  }
  if (cycleTime < draw * 2 + hold) {
    const eraseElapsed = cycleTime - draw - hold;
    const p = easeInOutCubic(eraseElapsed / draw);
    return { offset: lerp(0, -length, p), opacity: lerp(1, 0, p) };
  }
  return { offset: -length, opacity: 0 };
}

function AnimatedPath({
  d,
  color,
  strokeWidth,
  delay,
  drawDuration,
  pauseDuration,
}: {
  d: string;
  color: string;
  strokeWidth: number;
  delay: number;
  drawDuration: number;
  pauseDuration: number;
}) {
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const el = pathRef.current;
    if (!el) {
      return;
    }
    const pathEl: SVGPathElement = el;
    const pathLength = pathEl.getTotalLength();
    pathEl.style.strokeDasharray = String(pathLength);
    pathEl.style.strokeDashoffset = String(pathLength);
    pathEl.style.opacity = '0';

    const draw = drawDuration;
    const hold = pauseDuration;
    const total = (draw + hold) * 2;
    const animStart = performance.now() + delay * 1000;

    let raf: number;

    function tick(now: number) {
      const elapsed = now - animStart;
      if (elapsed < 0) {
        pathEl.style.strokeDashoffset = String(pathLength);
        pathEl.style.opacity = '0';
        raf = requestAnimationFrame(tick);
        return;
      }

      const { offset, opacity } = computeAnimState(elapsed / 1000, pathLength, draw, hold, total);
      pathEl.style.strokeDashoffset = String(offset);
      pathEl.style.opacity = String(opacity);
      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [d, color, strokeWidth, delay, drawDuration, pauseDuration]);

  return (
    <path
      ref={pathRef}
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

export default function LogoSvg({
  language,
  color,
  width = 320,
  strokeWidth = 14,
  staggerDelay = 0.2,
  drawDuration = 0.6,
  pauseDuration = 0.4,
}: LogoSvgProps) {
  const raw = useMemo(() => (language.startsWith('zh') ? keRanRaw : koraRaw), [language]);
  const sortedPaths = useMemo(() => sortLeftToRight(parseSvgPaths(raw)), [raw]);
  const viewBox = useMemo(() => parseViewBox(raw), [raw]);

  return (
    <svg viewBox={viewBox} style={{ width, height: 'auto', maxWidth: '80vw' }} aria-hidden="true">
      {sortedPaths.map((d, i) => (
        <AnimatedPath
          key={i}
          d={d}
          color={color}
          strokeWidth={strokeWidth}
          delay={i * staggerDelay}
          drawDuration={drawDuration}
          pauseDuration={pauseDuration}
        />
      ))}
    </svg>
  );
}
