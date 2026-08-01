'use client';

import { animate, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LINE_LOADING_PULSE_EASE } from './line-loading-timing';
import {
  computeSeriesPathPoints,
  interpolateSeriesPathPoints,
  type SeriesPathPoint,
  seriesPathFromPoints,
  seriesPathTransitionSignature,
} from './series-path-utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CurveFactory = any;

export interface UseAnimatedSeriesPathOptions {
  renderData: Record<string, unknown>[];
  xAccessor: (datum: Record<string, unknown>) => Date;
  xScale: (value: Date) => number | undefined;
  yScale: (value: number) => number | undefined;
  dataKey: string;
  curve: CurveFactory;
  chartPhase: string;
  durationMs: number;
  innerWidth: number;
  enabled: boolean;
}

export function useAnimatedSeriesPath({
  renderData,
  xAccessor,
  xScale,
  yScale,
  dataKey,
  curve,
  chartPhase,
  durationMs,
  innerWidth,
  enabled,
}: UseAnimatedSeriesPathOptions) {
  const reducedMotion = useReducedMotion();
  const [animatedPoints, setAnimatedPoints] = useState<SeriesPathPoint[] | null>(null);
  const displayedPointsRef = useRef<SeriesPathPoint[] | null>(null);
  const animatingRef = useRef(false);

  const xScaleDomain = useMemo(() => {
    const scaleWithDomain = xScale as { domain?: () => [Date, Date] };
    return scaleWithDomain.domain?.() ?? [new Date(0), new Date(0)];
  }, [xScale]);

  const transitionSignature = useMemo(
    () =>
      seriesPathTransitionSignature({
        renderData,
        xAccessor,
        dataKey,
        innerWidth,
        xDomainMin: xScaleDomain[0]?.getTime?.() ?? 0,
        xDomainMax: xScaleDomain[1]?.getTime?.() ?? 0,
      }),
    [renderData, xAccessor, dataKey, innerWidth, xScaleDomain],
  );

  const targetPoints = useMemo(
    () => computeSeriesPathPoints(renderData, xAccessor, xScale, yScale, dataKey),
    [renderData, xAccessor, xScale, yScale, dataKey],
  );

  // Live refs so the animation reads the current scales/data without re-running
  // its effect every time a y-domain tween churns `yScale` per frame (which
  // would stop + restart the animation on every frame → render loop).
  const liveRefs = useRef({ renderData, xAccessor, xScale, yScale, dataKey });
  liveRefs.current = { renderData, xAccessor, xScale, yScale, dataKey };
  const targetPointsRef = useRef(targetPoints);
  targetPointsRef.current = targetPoints;

  const prevTransitionSignatureRef = useRef(transitionSignature);

  // [ADL-GITVIS] temporary render-loop detector
  const runCountRef = useRef(0);
  useEffect(() => {
    runCountRef.current += 1;
    if (runCountRef.current % 25 === 0) {
      console.error('[ADL-GITVIS][loop] useAnimatedSeriesPath', {
        runs: runCountRef.current,
        sig: transitionSignature.slice(0, 60),
      });
    }
  });

  useEffect(() => {
    if (!animatingRef.current) {
      displayedPointsRef.current = targetPointsRef.current;
    }
  }, [targetPoints]);

  useEffect(() => {
    const shouldAnimate =
      enabled &&
      !reducedMotion &&
      chartPhase === 'ready' &&
      durationMs > 0 &&
      liveRefs.current.renderData.length > 0;

    if (!shouldAnimate) {
      animatingRef.current = false;
      setAnimatedPoints(null);
      displayedPointsRef.current = targetPointsRef.current;
      prevTransitionSignatureRef.current = transitionSignature;
      return;
    }

    if (prevTransitionSignatureRef.current === transitionSignature) {
      return;
    }
    prevTransitionSignatureRef.current = transitionSignature;

    const fromPoints = displayedPointsRef.current ?? targetPointsRef.current;
    if (fromPoints.length === 0) {
      displayedPointsRef.current = targetPointsRef.current;
      return;
    }

    animatingRef.current = true;
    const fromSnapshot = fromPoints;

    const control = animate(0, 1, {
      duration: durationMs / 1000,
      ease: [...LINE_LOADING_PULSE_EASE],
      onUpdate: (progress) => {
        // Read the current scales/data via liveRefs on every frame so the
        // interpolated path tracks a y-domain that snaps (brush zoom) or a
        // scale that changes mid-animation, instead of freezing the snapshot
        // captured when the effect started.
        const lr = liveRefs.current;
        const currentTarget = computeSeriesPathPoints(
          lr.renderData,
          lr.xAccessor,
          lr.xScale,
          lr.yScale,
          lr.dataKey,
        );
        const next = interpolateSeriesPathPoints(fromSnapshot, currentTarget, progress);
        displayedPointsRef.current = next;
        setAnimatedPoints(next);
      },
      onComplete: () => {
        animatingRef.current = false;
        displayedPointsRef.current = targetPointsRef.current;
        setAnimatedPoints(null);
      },
    });

    return () => {
      control.stop();
      animatingRef.current = false;
    };
  }, [transitionSignature, chartPhase, durationMs, enabled, reducedMotion]);

  const activePoints = animatedPoints ?? targetPoints;
  const pathD = useMemo(() => seriesPathFromPoints(activePoints, curve), [activePoints, curve]);

  return {
    pathD,
    isPathAnimating: animatedPoints != null,
  };
}
