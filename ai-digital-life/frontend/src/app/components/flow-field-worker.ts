/// <reference lib="webworker" />

// 粒子流场动画 Worker — 在独立线程中运行，零主线程开销。
// 主线程通过 transferControlToOffscreen() 将 canvas 控制权转移给此 Worker。

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
}

interface WorkerInitMessage {
  type: 'init';
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  particleCount: number;
  color: string;
  bgColor: string;
  trailColor: string;
  trailOpacity: number;
  speed: number;
}

interface WorkerResizeMessage {
  type: 'resize';
  width: number;
  height: number;
}

interface WorkerMouseMessage {
  type: 'mouse';
  x: number;
  y: number;
}

interface WorkerDestroyMessage {
  type: 'destroy';
}

interface WorkerUpdateColorsMessage {
  type: 'updateColors';
  color: string;
  bgColor: string;
  trailColor: string;
  trailOpacity: number;
}

type WorkerMessage =
  | WorkerInitMessage
  | WorkerResizeMessage
  | WorkerMouseMessage
  | WorkerDestroyMessage
  | WorkerUpdateColorsMessage;

let ctx: OffscreenCanvasRenderingContext2D | null = null;
let canvas: OffscreenCanvas | null = null;
let particles: Particle[] = [];
let animationFrameId: number | null = null;

let width = 0;
let height = 0;
let color = '#6366f1';
let bgColor = '#000';
let trailColor = '0, 0, 0';
let trailOpacity = 0.15;
let particleCount = 200;
let speed = 1;

const mouse = { x: -1000, y: -1000 };

const FRAME_INTERVAL = 1000 / 30;
let lastRenderTime = 0;
let running = false;

function createParticle(): Particle {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    vx: 0,
    vy: 0,
    age: 0,
    life: Math.random() * 200 + 100,
  };
}

function updateParticle(p: Particle) {
  const angle = (Math.cos(p.x * 0.005) + Math.sin(p.y * 0.005)) * Math.PI;
  p.vx += Math.cos(angle) * 0.2 * speed;
  p.vy += Math.sin(angle) * 0.2 * speed;

  const dx = mouse.x - p.x;
  const dy = mouse.y - p.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance < 150) {
    const force = (150 - distance) / 150;
    p.vx -= dx * force * 0.05;
    p.vy -= dy * force * 0.05;
  }

  p.x += p.vx;
  p.y += p.vy;
  p.vx *= 0.95;
  p.vy *= 0.95;
  if (p.vx > 5) {
    p.vx = 5;
  } else if (p.vx < -5) {
    p.vx = -5;
  }
  if (p.vy > 5) {
    p.vy = 5;
  } else if (p.vy < -5) {
    p.vy = -5;
  }

  p.age++;
  if (p.age > p.life) {
    p.x = Math.random() * width;
    p.y = Math.random() * height;
    p.vx = 0;
    p.vy = 0;
    p.age = 0;
    p.life = Math.random() * 200 + 100;
  }

  if (p.x < 0) {
    p.x = width;
  }
  if (p.x > width) {
    p.x = 0;
  }
  if (p.y < 0) {
    p.y = height;
  }
  if (p.y > height) {
    p.y = 0;
  }
}

function drawParticle(p: Particle) {
  if (!ctx) {
    return;
  }
  ctx.fillStyle = color;
  const alpha = 1 - Math.abs(p.age / p.life - 0.5) * 2;
  ctx.globalAlpha = alpha;
  ctx.fillRect(p.x, p.y, 1.5, 1.5);
}

function animate() {
  if (!running || !ctx) {
    return;
  }

  const now = performance.now();
  if (now - lastRenderTime < FRAME_INTERVAL) {
    animationFrameId = requestAnimationFrame(animate);
    return;
  }
  lastRenderTime = now;

  ctx.fillStyle = `rgba(${trailColor}, ${trailOpacity})`;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1;

  for (const p of particles) {
    updateParticle(p);
    drawParticle(p);
  }

  animationFrameId = requestAnimationFrame(animate);
}

function initCanvas(msg: WorkerInitMessage) {
  canvas = msg.canvas;
  canvas.width = msg.width;
  canvas.height = msg.height;

  const context = canvas.getContext('2d');
  if (!context) {
    console.error('[FLOW-WORKER] Failed to get 2d context');
    return;
  }
  ctx = context;

  width = msg.width;
  height = msg.height;
  color = msg.color;
  bgColor = msg.bgColor;
  trailColor = msg.trailColor;
  trailOpacity = msg.trailOpacity;
  particleCount = msg.particleCount;
  speed = msg.speed;

  particles = [];
  for (let i = 0; i < particleCount; i++) {
    particles.push(createParticle());
  }

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  running = true;
  lastRenderTime = performance.now();
  animate();
}

function handleResize(msg: WorkerResizeMessage) {
  if (!canvas || !ctx) {
    return;
  }
  width = msg.width;
  height = msg.height;
  canvas.width = width;
  canvas.height = height;
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);
}

function handleMouse(msg: WorkerMouseMessage) {
  mouse.x = msg.x;
  mouse.y = msg.y;
}

function handleUpdateColors(msg: WorkerUpdateColorsMessage) {
  color = msg.color;
  bgColor = msg.bgColor;
  trailColor = msg.trailColor;
  trailOpacity = msg.trailOpacity;
  if (ctx) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);
  }
}

function destroy() {
  running = false;
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  particles = [];
  ctx = null;
  canvas = null;
}

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  switch (e.data.type) {
    case 'init':
      initCanvas(e.data);
      break;
    case 'resize':
      handleResize(e.data);
      break;
    case 'mouse':
      handleMouse(e.data);
      break;
    case 'updateColors':
      handleUpdateColors(e.data);
      break;
    case 'destroy':
      destroy();
      break;
  }
};
