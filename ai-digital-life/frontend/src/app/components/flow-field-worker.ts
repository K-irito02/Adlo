/// <reference lib="webworker" />

interface ParticleTraits {
  size: number;
  friction: number;
  flowResponse: number;
  mouseResponse: number;
  wanderStrength: number;
  minAlpha: number;
  alphaRange: number;
  alphaSpeed: number;
  alphaPhase: number;
  fieldOffX: number;
  fieldOffY: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  t: ParticleTraits;
}

interface WorkerInitMessage {
  type: 'init';
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  dpr: number;
  particleCount: number;
  color: string;
  bgColor: string;
  trailColor: string;
  trailOpacity: number;
  speed: number;
  freqScale: number;
}

interface WorkerResizeMessage {
  type: 'resize';
  width: number;
  height: number;
  dpr: number;
}

interface WorkerMouseMessage {
  type: 'mouse';
  x: number;
  y: number;
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
  | WorkerUpdateColorsMessage;

let ctx: OffscreenCanvasRenderingContext2D | null = null;
let canvas: OffscreenCanvas | null = null;
let particles: Particle[] = [];

let width = 0;
let height = 0;
let color = '#6366f1';
let bgColor = '#000';
let trailColor = '0, 0, 0';
let trailOpacity = 0.15;
let particleCount = 200;
let speed = 1;
let dpr = 1;
// 流场频率常量（根据 freqScale 预计算，避免每粒子重复乘法）
let f1x = 0.002,
  f1y = 0.004;
let f2x = 0.008,
  f2y = -0.003;
let f3x = 0.015,
  f3y = 0.01;
let f4x = 0.022,
  f4y = -0.028;

const mouse = { x: -1000, y: -1000 };

let running = false;
let frameCount = 0;

function randomTraits(): ParticleTraits {
  return {
    size: 0.8 + Math.random() * 1.7,
    friction: 0.93 + Math.random() * 0.04,
    flowResponse: 0.4 + Math.random() * 0.9,
    mouseResponse: Math.random() * 1.5,
    wanderStrength: 0.02 + Math.random() * 0.07,
    minAlpha: 0.15 + Math.random() * 0.25,
    alphaRange: 0.3 + Math.random() * 0.5,
    alphaSpeed: 0.0015 + Math.random() * 0.008,
    alphaPhase: Math.random() * Math.PI * 2,
    fieldOffX: (Math.random() - 0.5) * 400,
    fieldOffY: (Math.random() - 0.5) * 400,
  };
}

function createParticle(): Particle {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    vx: 0,
    vy: 0,
    age: Math.random() * 2000,
    t: randomTraits(),
  };
}

function updateParticle(p: Particle) {
  const fx = p.x + p.t.fieldOffX;
  const fy = p.y + p.t.fieldOffY;
  const n1 = Math.sin(fx * f1x + fy * f1y) * 1.0;
  const n2 = Math.cos(fx * f2x + fy * f2y) * 0.7;
  const n3 = Math.sin(fx * f3x + fy * f3y) * 0.5;
  const n4 = Math.cos(fx * f4x + fy * f4y) * 0.35;
  const angle = (n1 + n2 + n3 + n4) * Math.PI;
  p.vx += Math.cos(angle) * 0.2 * speed * p.t.flowResponse;
  p.vy += Math.sin(angle) * 0.2 * speed * p.t.flowResponse;

  p.vx += (Math.random() - 0.5) * p.t.wanderStrength;
  p.vy += (Math.random() - 0.5) * p.t.wanderStrength;

  const dx = mouse.x - p.x;
  const dy = mouse.y - p.y;
  const distSq = dx * dx + dy * dy;

  if (distSq < 32400) {
    const distance = Math.sqrt(distSq);
    const force = (180 - distance) / 180;
    p.vx -= dx * force * 0.05 * p.t.mouseResponse;
    p.vy -= dy * force * 0.05 * p.t.mouseResponse;
  }

  p.x += p.vx;
  p.y += p.vy;
  p.vx *= p.t.friction;
  p.vy *= p.t.friction;

  p.age++;

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
  const wave = 0.5 + 0.5 * Math.sin(p.age * p.t.alphaSpeed + p.t.alphaPhase);
  ctx.globalAlpha = p.t.minAlpha + wave * p.t.alphaRange;
  ctx.fillRect(p.x, p.y, p.t.size, p.t.size);
}

function animate() {
  if (!running || !ctx) {
    return;
  }

  ctx.globalAlpha = 1;
  ctx.fillStyle = `rgba(${trailColor}, ${trailOpacity})`;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = color;

  for (const p of particles) {
    updateParticle(p);
    drawParticle(p);
  }

  // 动态调节粒子数量：目标在基准 ±30% 间正弦波动
  frameCount++;
  const target = particleCount + Math.sin(frameCount * 0.005) * particleCount * 0.3;
  const diff = target - particles.length;
  if (diff > 0 && Math.random() < diff * 0.003) {
    particles.push(createParticle());
  } else if (diff < 0 && Math.random() < -diff * 0.003) {
    particles.splice(Math.floor(Math.random() * particles.length), 1);
  }

  requestAnimationFrame(animate);
}

function initCanvas(msg: WorkerInitMessage) {
  canvas = msg.canvas;
  dpr = msg.dpr;
  canvas.width = msg.width * dpr;
  canvas.height = msg.height * dpr;

  const context = canvas.getContext('2d');
  if (!context) {
    console.error('[FLOW-WORKER] Failed to get 2d context');
    return;
  }
  ctx = context;
  ctx.scale(dpr, dpr);

  width = msg.width;
  height = msg.height;
  color = msg.color;
  bgColor = msg.bgColor;
  trailColor = msg.trailColor;
  trailOpacity = msg.trailOpacity;
  particleCount = msg.particleCount;
  speed = msg.speed;
  const fs = msg.freqScale;
  f1x = 0.002 * fs;
  f1y = 0.004 * fs;
  f2x = 0.008 * fs;
  f2y = -0.003 * fs;
  f3x = 0.015 * fs;
  f3y = 0.01 * fs;
  f4x = 0.022 * fs;
  f4y = -0.028 * fs;

  particles = [];
  // 初始仅创建 ~35% 粒子，剩余在 animate 中动态添加，实现数量渐变
  const initialCount = Math.max(60, Math.floor(particleCount * (0.25 + Math.random() * 0.2)));
  for (let i = 0; i < initialCount; i++) {
    particles.push(createParticle());
  }
  frameCount = 0;

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  running = true;
  animate();
}

function handleResize(msg: WorkerResizeMessage) {
  if (!canvas || !ctx) {
    return;
  }
  width = msg.width;
  height = msg.height;
  dpr = msg.dpr;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
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
  }
};
