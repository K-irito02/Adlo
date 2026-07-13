import React, { useEffect, useRef } from 'react';

interface FlowFieldBackgroundProps {
  className?: string;
  color?: string;
  trailColor?: string;
  trailOpacity?: number;
  particleCount?: number;
  speed?: number;
  containerClass?: string;
}

export default function FlowFieldBackground({
  className = '',
  color = '#6366f1',
  trailColor = '0, 0, 0',
  trailOpacity = 0.15,
  particleCount = 600,
  speed = 1,
  containerClass = 'bg-black',
}: FlowFieldBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    let width = container.clientWidth;
    let height = container.clientHeight;
    let particles: Particle[] = [];
    let animationFrameId: number;
    const mouse = { x: -1000, y: -1000 };

    class Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      age: number;
      life: number;

      constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.vx = 0;
        this.vy = 0;
        this.age = 0;
        this.life = Math.random() * 200 + 100;
      }

      update() {
        const angle = (Math.cos(this.x * 0.005) + Math.sin(this.y * 0.005)) * Math.PI;
        this.vx += Math.cos(angle) * 0.2 * speed;
        this.vy += Math.sin(angle) * 0.2 * speed;

        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 150) {
          const force = (150 - distance) / 150;
          this.vx -= dx * force * 0.05;
          this.vy -= dy * force * 0.05;
        }

        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.95;
        this.vy *= 0.95;
        if (this.vx > 5) {
          this.vx = 5;
        } else if (this.vx < -5) {
          this.vx = -5;
        }
        if (this.vy > 5) {
          this.vy = 5;
        } else if (this.vy < -5) {
          this.vy = -5;
        }

        this.age++;
        if (this.age > this.life) {
          this.reset();
        }

        if (this.x < 0) {
          this.x = width;
        }
        if (this.x > width) {
          this.x = 0;
        }
        if (this.y < 0) {
          this.y = height;
        }
        if (this.y > height) {
          this.y = 0;
        }
      }

      reset() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.vx = 0;
        this.vy = 0;
        this.age = 0;
        this.life = Math.random() * 200 + 100;
      }

      draw(context: CanvasRenderingContext2D) {
        context.fillStyle = color;
        const alpha = 1 - Math.abs(this.age / this.life - 0.5) * 2;
        context.globalAlpha = alpha;
        context.fillRect(this.x, this.y, 1.5, 1.5);
      }
    }

    const init = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      particles = [];
      // 初始只创建 200 个粒子，其余在 animate 中渐进补充
      const initialCount = 200;
      for (let i = 0; i < initialCount; i++) {
        particles.push(new Particle());
      }
    };

    let lastFrameTime = performance.now();

    const animate = () => {
      const now = performance.now();
      const gap = now - lastFrameTime;
      lastFrameTime = now;

      ctx.fillStyle = `rgba(${trailColor}, ${trailOpacity})`;
      ctx.fillRect(0, 0, width, height);

      if (gap < 100) {
        particles.forEach((p) => {
          p.update();
          p.draw(ctx);
        });
      } else {
        particles.forEach((p) => {
          p.draw(ctx);
        });
      }

      // 每帧补充最多 10 个粒子，直到达到目标数量
      if (particles.length < particleCount) {
        const batchSize = Math.min(10, particleCount - particles.length);
        for (let i = 0; i < batchSize; i++) {
          particles.push(new Particle());
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    const refreshRect = () => {
      canvasRect = canvas.getBoundingClientRect();
    };
    const handleResize = () => {
      width = container.clientWidth;
      height = container.clientHeight;
      init();
      refreshRect();
    };

    let canvasRect = canvas.getBoundingClientRect();
    const handlePointerMove = (e: PointerEvent) => {
      mouse.x = e.clientX - canvasRect.left;
      mouse.y = e.clientY - canvasRect.top;
    };

    const handlePointerLeave = () => {
      mouse.x = -1000;
      mouse.y = -1000;
    };

    init();
    // 预填全黑背景，消除 trail 累积期视觉卡顿
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    animate();

    window.addEventListener('resize', handleResize);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerleave', handlePointerLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, [color, trailColor, trailOpacity, particleCount, speed]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full ${containerClass} overflow-hidden${className ? ` ${className}` : ''}`}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
