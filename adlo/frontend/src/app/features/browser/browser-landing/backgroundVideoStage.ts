/**
 * 视频背景的「单解码 + 多 canvas 镜像」舞台。
 *
 * 设计目标（用户确认方案 C）：
 * - 整个应用只有一个隐藏的 `<video>` 负责解码、进度与音频，避免多标签页进度/声音不一致；
 * - 每个可见的新建标签页只是一个 `<canvas>`，每帧从主视频 `drawImage`，两处画面同源；
 * - 新建标签页隐藏（面板切走 / 中心切标签 / 面板收起）时**继续播放**，但主视频静音；
 * - 任一可见区域出现时恢复该界面的音量（配置里的 volume/muted）。
 *
 * 主视频是模块级常驻元素（挂在 body 的屏外容器里），不随 React 组件卸载；
 * 只要还有任一着陆页 surface 挂载（哪怕隐藏），中心标签切走再回来进度也连续；
 * 全部 surface 卸载时才释放解码资源。
 */
import type { BackgroundAdjust, BackgroundFit } from '@stores/slices/browserSlice';

export interface VideoStageConfig {
  /** 素材标识（assetPath / assetId）。同一素材的多个 surface 共享同一个主视频源。 */
  key: string | null;
  url: string | null;
  muted: boolean;
  volume: number;
}

interface Surface {
  canvas: HTMLCanvasElement;
  active: boolean;
  fit: BackgroundFit;
  adjust: BackgroundAdjust;
}

interface DrawRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

const surfaces = new Set<Surface>();
let master: HTMLVideoElement | null = null;
let currentKey: string | null = null;
let config: VideoStageConfig = {
  key: null,
  url: null,
  muted: true,
  volume: 0,
};
let animationHandle: number | null = null;
let lastDrawAt = 0;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function ensureMaster(): HTMLVideoElement {
  if (master) {
    return master;
  }
  const container = document.createElement('div');
  container.setAttribute('data-adl-video-stage', '');
  container.style.cssText =
    'position:fixed;left:-10000px;top:0;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none;';
  const video = document.createElement('video');
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.autoplay = true;
  video.setAttribute('aria-hidden', 'true');
  container.appendChild(video);
  document.body.appendChild(container);
  master = video;

  const resume = () => {
    void video.play().catch(() => {
      /* 自动播放策略：保持静音继续尝试（canplay 时还会再触发） */
    });
    syncAudio();
  };
  video.addEventListener('canplay', resume);
  video.addEventListener('loadeddata', resume);
  video.addEventListener('playing', syncAudio);
  document.addEventListener('visibilitychange', syncAudio);
  return video;
}

function anySurfaceVisible(): boolean {
  if (document.visibilityState === 'hidden') {
    return false;
  }
  for (const surface of surfaces) {
    if (surface.active) {
      return true;
    }
  }
  return false;
}

/** 只有存在可见区域且未被用户静音时出声；后台继续播放但静音。 */
function syncAudio(): void {
  const video = master;
  if (!video) {
    return;
  }
  const audible = anySurfaceVisible() && !config.muted && config.volume > 0;
  video.volume = clamp(config.volume, 0, 1);
  if (audible) {
    if (video.muted) {
      video.muted = false;
      const played = video.play();
      if (played && typeof played.catch === 'function') {
        played.catch(() => {
          // 带声自动播放被拒：回退静音，避免整段视频停住。
          video.muted = true;
          void video.play().catch(() => {});
        });
      }
    }
    return;
  }
  video.muted = true;
}

/** 覆盖 / 适应 的源裁切与目标矩形（纯函数，可单测）。 */
export function computeDrawRect(
  videoWidth: number,
  videoHeight: number,
  targetWidth: number,
  targetHeight: number,
  fit: BackgroundFit,
): DrawRect {
  if (videoWidth <= 0 || videoHeight <= 0) {
    return { sx: 0, sy: 0, sw: 0, sh: 0, dx: 0, dy: 0, dw: 0, dh: 0 };
  }
  const videoAspect = videoWidth / videoHeight;
  const targetAspect = targetWidth / targetHeight;

  if (fit === 'contain') {
    const width = videoAspect > targetAspect ? targetWidth : targetHeight * videoAspect;
    const height = videoAspect > targetAspect ? targetWidth / videoAspect : targetHeight;
    return {
      sx: 0,
      sy: 0,
      sw: videoWidth,
      sh: videoHeight,
      dx: (targetWidth - width) / 2,
      dy: (targetHeight - height) / 2,
      dw: width,
      dh: height,
    };
  }

  // cover：居中裁切源画面。
  let sw = videoWidth;
  let sh = videoHeight;
  if (videoAspect > targetAspect) {
    sw = videoHeight * targetAspect;
  } else {
    sh = videoWidth / targetAspect;
  }
  return {
    sx: (videoWidth - sw) / 2,
    sy: (videoHeight - sh) / 2,
    sw,
    sh,
    dx: 0,
    dy: 0,
    dw: targetWidth,
    dh: targetHeight,
  };
}

function drawSurface(surface: Surface): void {
  const video = master;
  const canvas = surface.canvas;
  if (!video || video.readyState < 2 || !canvas.isConnected) {
    return;
  }
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const adjust = surface.adjust;
  const scale = clamp(Number.isFinite(adjust.scale) ? adjust.scale : 1, 0.25, 5);
  const offsetX = (clamp(adjust.offsetX, -50, 50) / 100) * width;
  const offsetY = (clamp(adjust.offsetY, -50, 50) / 100) * height;
  const target = computeDrawRect(
    video.videoWidth,
    video.videoHeight,
    width,
    height,
    surface.fit === 'contain' ? 'contain' : 'cover',
  );

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, width, height);
  context.save();
  context.translate(width / 2 + offsetX, height / 2 + offsetY);
  context.scale(scale, scale);
  context.drawImage(
    video,
    target.sx,
    target.sy,
    target.sw,
    target.sh,
    target.dx - width / 2,
    target.dy - height / 2,
    target.dw,
    target.dh,
  );
  context.restore();
}

function tick(now: number): void {
  animationHandle = requestAnimationFrame(tick);
  if (document.visibilityState === 'hidden' || now - lastDrawAt < 33) {
    return;
  }
  lastDrawAt = now;
  for (const surface of surfaces) {
    if (surface.active) {
      drawSurface(surface);
    }
  }
}

function ensureLoop(): void {
  if (animationHandle !== null) {
    return;
  }
  lastDrawAt = 0;
  animationHandle = requestAnimationFrame(tick);
}

function stopLoopIfIdle(): void {
  if (surfaces.size > 0 || animationHandle === null) {
    return;
  }
  cancelAnimationFrame(animationHandle);
  animationHandle = null;
}

export function registerVideoSurface(
  canvas: HTMLCanvasElement,
  options: { fit: BackgroundFit; adjust: BackgroundAdjust },
): () => void {
  const surface: Surface = {
    canvas,
    active: false,
    fit: options.fit,
    adjust: options.adjust,
  };
  surfaces.add(surface);
  ensureMaster();
  ensureLoop();
  return () => {
    surfaces.delete(surface);
    stopLoopIfIdle();
    // 可见面减少后必须重新判定音频：否则中心标签切走、只剩隐藏的面板时，
    // 主视频仍会保持之前的非静音状态（用户实测：后台新建标签页还有声音）。
    syncAudio();
    if (surfaces.size === 0) {
      // 没有新建标签页在展示：释放解码资源；下次挂载会从配置重新开始。
      const video = master;
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      currentKey = null;
    }
  };
}

/** 每个 surface 自己的填充/自由调整参数：弹窗预览不会污染落地页。 */
export function updateVideoSurfaceOptions(
  canvas: HTMLCanvasElement | null,
  options: { fit: BackgroundFit; adjust: BackgroundAdjust },
): void {
  if (!canvas) {
    return;
  }
  for (const surface of surfaces) {
    if (surface.canvas === canvas) {
      surface.fit = options.fit;
      surface.adjust = options.adjust;
    }
  }
}

export function setVideoSurfaceActive(canvas: HTMLCanvasElement | null, active: boolean): void {
  if (!canvas) {
    return;
  }
  for (const surface of surfaces) {
    if (surface.canvas === canvas) {
      surface.active = active;
    }
  }
  syncAudio();
}

export function applyVideoStageConfig(next: VideoStageConfig): void {
  config = {
    key: next.key,
    url: next.url,
    muted: next.muted,
    volume: next.volume,
  };
  const video = ensureMaster();
  // 同一素材（key 相同）的多个 surface 各自解析出的 object URL 可能不同；
  // 只在素材真正变化时换源，避免弹窗预览把正在播放的主视频重置。
  if (next.key && next.key !== currentKey && next.url) {
    currentKey = next.key;
    video.src = next.url;
    video.muted = true;
    video.load();
    const played = video.play();
    if (played && typeof played.catch === 'function') {
      played.catch(() => {
        /* canplay 后再试 */
      });
    }
  } else if (!next.key && currentKey) {
    currentKey = null;
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
  syncAudio();
}
