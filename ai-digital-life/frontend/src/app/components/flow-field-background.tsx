import { useEffect, useRef } from 'react';

interface FlowFieldBackgroundProps {
  color?: string;
  bgColor?: string;
  trailColor?: string;
  trailOpacity?: number;
  particleCount?: number;
  speed?: number;
}

export default function FlowFieldBackground({
  color = '#6366f1',
  bgColor = '#000',
  trailColor = '0, 0, 0',
  trailOpacity = 0.15,
  particleCount = 200,
  speed = 1,
}: FlowFieldBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker | null>(null);

  // 颜色更新：通过 postMessage 通知 Worker，不重建 canvas
  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) {
      return;
    }
    worker.postMessage({ type: 'updateColors', color, bgColor, trailColor, trailOpacity });
  }, [color, bgColor, trailColor, trailOpacity]);

  // canvas 初始化：仅执行一次（空依赖数组）
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) {
      return;
    }

    if (typeof OffscreenCanvas === 'undefined') {
      console.warn('[FLOW-FIELD] OffscreenCanvas not supported, animation disabled');
      return;
    }

    const worker = new Worker(new URL('./flow-field-worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    const offscreen = canvas.transferControlToOffscreen();

    // 容器尺寸为 0 时（窗口 visible:false 期间或布局未完成）使用窗口尺寸作为 fallback，
    // 避免粒子在 0x0 空间内不可见。窗口显示后 resize 事件会修正尺寸。
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    // 每次启动生成随机频率缩放因子，使流场结构每次都不同
    const freqScale = 0.4 + Math.random() * 1.6;

    worker.postMessage(
      {
        type: 'init',
        canvas: offscreen,
        width,
        height,
        dpr,
        particleCount,
        color,
        bgColor,
        trailColor,
        trailOpacity,
        speed,
        freqScale,
      },
      [offscreen]
    );

    // 缓存 canvas 边界避免每次 pointermove 触发 reflow
    let canvasLeft = 0;
    let canvasTop = 0;
    const updateCanvasBounds = () => {
      const rect = canvas.getBoundingClientRect();
      canvasLeft = rect.left;
      canvasTop = rect.top;
    };
    updateCanvasBounds();

    let resizePending = false;
    const handleResize = () => {
      if (!resizePending) {
        resizePending = true;
        requestAnimationFrame(() => {
          resizePending = false;
          const w = container.clientWidth;
          const h = container.clientHeight;
          const newDpr = window.devicePixelRatio || 1;
          worker.postMessage({ type: 'resize', width: w, height: h, dpr: newDpr });
          updateCanvasBounds();
        });
      }
    };

    let mousePending = false;
    let mouseX = -1000;
    let mouseY = -1000;
    const handlePointerMove = (e: PointerEvent) => {
      mouseX = e.clientX - canvasLeft;
      mouseY = e.clientY - canvasTop;
      if (!mousePending) {
        mousePending = true;
        requestAnimationFrame(() => {
          mousePending = false;
          worker.postMessage({ type: 'mouse', x: mouseX, y: mouseY });
        });
      }
    };

    const handlePointerLeave = () => {
      worker.postMessage({ type: 'mouse', x: -1000, y: -1000 });
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('pointermove', handlePointerMove);
    document.documentElement.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', handlePointerMove);
      document.documentElement.removeEventListener('pointerleave', handlePointerLeave);
      worker.terminate();
      workerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: bgColor,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%', backgroundColor: bgColor }}
      />
    </div>
  );
}
