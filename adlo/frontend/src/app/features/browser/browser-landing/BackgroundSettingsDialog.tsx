import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type {
  BackgroundAdjust,
  BackgroundConfig,
  BackgroundFit,
  BackgroundMode,
} from '@stores/slices/browserSlice';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { IconRefreshCw } from '@icons';
import { Spinner } from '@components/Spinner';
import { BackgroundVolumeControl } from './BackgroundVolumeControl';
import { BackgroundVideoCanvas } from './BackgroundVideoCanvas';
import { backgroundSourceKey } from './backgroundAssets';
import {
  backgroundKindForFile,
  draftFromLocalFile,
  fileExtension,
  importDroppedPath,
  isBackgroundExtensionAllowed,
  isDesktopShell,
  pickDesktopBackground,
  pruneBackgroundBlobs,
  pruneDesktopBackgrounds,
  putBackgroundBlob,
  resolveBackgroundUrl,
  type BackgroundDraft,
  type BackgroundKind,
} from './backgroundAssets';
import { registerNativeFileDropHandler } from '../../../hooks/fileDropRouter';
import { invokeIpc, subscribeChannel } from '../../../../tauri-bridge/tauri-shared';
import './BackgroundSettingsDialog.css';

interface BackgroundSettingsDialogProps {
  open: boolean;
  t: Record<string, string>;
  onClose: () => void;
}

const DEFAULT_ADJUST: BackgroundAdjust = { scale: 1, offsetX: 0, offsetY: 0 };
const FILL_OPTIONS: readonly BackgroundFit[] = ['cover', 'contain', 'repeat'];

interface DraftState extends BackgroundDraft {
  assetId?: string;
  revoke?: () => void;
}

type Drafts = Record<BackgroundKind, DraftState | null>;

const EMPTY_DRAFTS: Drafts = { image: null, video: null };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeAdjust(adjust: BackgroundAdjust | undefined): BackgroundAdjust {
  if (!adjust) {
    return DEFAULT_ADJUST;
  }
  return {
    scale: clamp(Number.isFinite(adjust.scale) ? adjust.scale : 1, 0.25, 5),
    offsetX: clamp(Number.isFinite(adjust.offsetX) ? adjust.offsetX : 0, -50, 50),
    offsetY: clamp(Number.isFinite(adjust.offsetY) ? adjust.offsetY : 0, -50, 50),
  };
}

/** 三种填充模式共用同一套自由调整：平移 + 缩放叠加在预设尺寸之上。 */
function adjustTransform(adjust: BackgroundAdjust): string {
  return `translate(${adjust.offsetX}%, ${adjust.offsetY}%) scale(${adjust.scale})`;
}

function errorMessage(error: unknown, t: Record<string, string>): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('unsupported') || message.includes('extension')) {
    return t.browserBgUnsupported;
  }
  return t.browserBgLoadFailed;
}

export function BackgroundSettingsDialog({ open, t, onClose }: BackgroundSettingsDialogProps) {
  const { browserBgConfig, browserSetBgConfig, browserResetBgConfig } = useAppStore(
    useShallow((state) => ({
      browserBgConfig: state.browserBgConfig,
      browserSetBgConfig: state.browserSetBgConfig,
      browserResetBgConfig: state.browserResetBgConfig,
    })),
  );

  const [mode, setMode] = useState<BackgroundMode>(browserBgConfig.mode);
  const [fit, setFit] = useState<BackgroundFit>(browserBgConfig.fit);
  const [adjust, setAdjust] = useState<BackgroundAdjust>(normalizeAdjust(browserBgConfig.adjust));
  const [volume, setVolume] = useState(browserBgConfig.volume ?? 0);
  const [muted, setMuted] = useState(true);
  const [drafts, setDrafts] = useState<Drafts>(EMPTY_DRAFTS);
  const [busy, setBusy] = useState<'idle' | 'importing' | 'applying'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const draftsRef = useRef<Drafts>(EMPTY_DRAFTS);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const busyRef = useRef<'idle' | 'importing' | 'applying'>('idle');
  const adjustRef = useRef(adjust);
  const lastNativeDropRef = useRef<{ key: string; at: number }>({ key: '', at: 0 });
  const seededOpenRef = useRef(false);
  const pruneTimerRef = useRef<number | null>(null);
  const previewDragRef = useRef<{
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
    width: number;
    height: number;
  } | null>(null);

  const replaceDraft = useCallback((kind: BackgroundKind, next: DraftState | null) => {
    const previous = draftsRef.current[kind];
    if (previous && previous !== next) {
      previous.revoke?.();
    }
    const merged: Drafts = { ...draftsRef.current, [kind]: next };
    draftsRef.current = merged;
    setDrafts(merged);
  }, []);

  const clearDrafts = useCallback(() => {
    for (const draft of Object.values(draftsRef.current)) {
      draft?.revoke?.();
    }
    draftsRef.current = EMPTY_DRAFTS;
    setDrafts(EMPTY_DRAFTS);
  }, []);

  const cancelScheduledPrune = useCallback(() => {
    if (pruneTimerRef.current !== null) {
      window.clearTimeout(pruneTimerRef.current);
      pruneTimerRef.current = null;
    }
  }, []);

  const schedulePrune = useCallback(() => {
    // 延迟清理：落地页切换配置时会短暂保留旧 URL（asset 协议异步读取），
    // 立即删文件会出现 "File does not exist"。执行时按当前配置保留，避免误删新素材；
    // 新的导入/应用会取消上一次定时器，防止旧定时器删掉刚选的文件。
    cancelScheduledPrune();
    pruneTimerRef.current = window.setTimeout(() => {
      pruneTimerRef.current = null;
      const current = useAppStore.getState().browserBgConfig;
      if (isDesktopShell()) {
        void pruneDesktopBackgrounds(current.assetPath ? [current.assetPath] : []);
      } else {
        void pruneBackgroundBlobs(current.assetId ? [current.assetId] : []).catch(() => undefined);
      }
    }, 4000);
  }, [cancelScheduledPrune]);

  // `handleApply` 可能在 await 写入 IDB 期间被用户改动 adjust；
  // 用 ref 保存最新值，落库前重读（复位按钮同时受 busy 守卫）。
  useEffect(() => {
    adjustRef.current = adjust;
  }, [adjust]);

  useEffect(() => {
    if (!open) {
      return;
    }
    // 只在本次打开时做一次种子：弹窗内的音量/静音会写回 store，
    // 不能让 config 引用变化重新清空草稿（否则拖音量会丢草稿/缩放）。
    if (seededOpenRef.current) {
      return;
    }
    seededOpenRef.current = true;
    if (isDesktopShell()) {
      // 打开时排空一次历史落点：Rust 记录的是「最近一次窗口拖放」，
      // 开窗前的拖放不应被当成新拖拽导入；同时清掉跨次打开的去重键。
      void invokeIpc<string[]>('browser_take_pending_drop');
      lastNativeDropRef.current = { key: '', at: 0 };
    }
    setMode(browserBgConfig.mode);
    setFit(browserBgConfig.fit);
    setAdjust(normalizeAdjust(browserBgConfig.adjust));
    setVolume(browserBgConfig.volume ?? 0);
    setMuted(browserBgConfig.muted ?? true);
    setError(null);
    setBusy('idle');
    setDragActive(false);
    clearDrafts();

    const activeMode = browserBgConfig.mode;
    if (activeMode !== 'default' && (browserBgConfig.assetPath || browserBgConfig.assetId)) {
      let canceled = false;
      void resolveBackgroundUrl(browserBgConfig).then((resolved) => {
        if (canceled || !resolved.url) {
          resolved.revoke?.();
          return;
        }
        replaceDraft(activeMode, {
          fileName: browserBgConfig.fileName ?? '',
          previewUrl: resolved.url,
          assetPath: browserBgConfig.assetPath,
          assetId: browserBgConfig.assetId,
          revoke: resolved.revoke,
        });
      });
      return () => {
        canceled = true;
      };
    }
  }, [open, browserBgConfig, clearDrafts, replaceDraft]);

  // 关闭时释放 object URL（Blob 本身仍由 IndexedDB 持有）。
  useEffect(() => {
    if (open) {
      return;
    }
    seededOpenRef.current = false;
    clearDrafts();
    setBusy('idle');
    setError(null);
    setDragActive(false);
    schedulePrune();
  }, [open, clearDrafts, schedulePrune]);

  useEffect(
    () => () => {
      clearDrafts();
      cancelScheduledPrune();
    },
    [clearDrafts, cancelScheduledPrune],
  );

  const acceptFile = useCallback(
    (file: File) => {
      const inferred = backgroundKindForFile(file.name);
      if (!inferred || !isBackgroundExtensionAllowed(inferred, fileExtension(file.name))) {
        setError(t.browserBgUnsupported);
        return;
      }
      setMode(inferred);
      if (inferred === 'video' && fit === 'repeat') {
        setFit('cover');
      }
      setError(null);
      replaceDraft(inferred, draftFromLocalFile(file));
    },
    [fit, replaceDraft, t],
  );

  const importPath = useCallback(
    async (path: string, kind: BackgroundKind) => {
      if (busyRef.current !== 'idle') {
        return;
      }
      busyRef.current = 'importing';
      cancelScheduledPrune();
      setBusy('importing');
      setError(null);
      try {
        const draft = await importDroppedPath(path, kind);
        if (!draft) {
          setError(t.browserBgUnsupported);
          return;
        }
        setMode(kind);
        if (kind === 'video' && fit === 'repeat') {
          setFit('cover');
        }
        replaceDraft(kind, draft);
      } catch (caught) {
        setError(errorMessage(caught, t));
      } finally {
        busyRef.current = 'idle';
        setBusy('idle');
      }
    },
    [cancelScheduledPrune, fit, replaceDraft, t],
  );

  /** 原生拖放统一入口：事件通道与轮询兜底可能各触发一次，用 1.5s 去重。 */
  const handleNativeDrop = useCallback(
    (paths: string[]) => {
      if (busyRef.current !== 'idle') {
        return;
      }
      const key = paths.join('|');
      const now = Date.now();
      if (key === lastNativeDropRef.current.key && now - lastNativeDropRef.current.at < 1500) {
        return;
      }
      lastNativeDropRef.current = { key, at: now };
      setDragActive(false);
      const mediaPath = paths.find((path) => backgroundKindForFile(path) !== null);
      const kind = mediaPath ? backgroundKindForFile(mediaPath) : null;
      if (!mediaPath || !kind) {
        setError(t.browserBgUnsupported);
        return;
      }
      void importPath(mediaPath, kind);
    },
    [importPath, t],
  );

  // 桌面端拖放：Rust 侧收到窗口拖放后广播 `adl:file-drop`，并保留轮询兜底
  // （覆盖层监听器在部分环境下收不到 `tauri://drag-drop`）。
  useEffect(() => {
    if (!open || !isDesktopShell()) {
      return;
    }
    let disposed = false;
    const unregister = registerNativeFileDropHandler(({ paths }) => {
      handleNativeDrop(paths);
      return true;
    });
    const unsubscribe = subscribeChannel<{ type?: string; paths?: string[] }>(
      'adl:file-drop',
      (payload) => {
        if (disposed) {
          return;
        }
        if (payload?.type === 'enter') {
          setDragActive((payload.paths ?? []).some((path) => backgroundKindForFile(path) !== null));
          return;
        }
        if (payload?.type === 'leave') {
          setDragActive(false);
          return;
        }
        if (payload?.type === 'drop') {
          handleNativeDrop(Array.isArray(payload.paths) ? payload.paths : []);
        }
      },
    );
    const poll = window.setInterval(() => {
      void (async () => {
        const result = await invokeIpc<string[]>('browser_take_pending_drop');
        if (disposed || !result.ok || result.data.length === 0) {
          return;
        }
        handleNativeDrop(result.data);
      })();
    }, 300);

    return () => {
      disposed = true;
      unregister();
      unsubscribe();
      window.clearInterval(poll);
    };
  }, [open, handleNativeDrop]);

  const handlePick = useCallback(async () => {
    if (mode === 'default' || busy !== 'idle') {
      return;
    }
    const kind = mode;
    if (!isDesktopShell()) {
      fileInputRef.current?.click();
      return;
    }
    setError(null);
    let sourcePath: string | null = null;
    try {
      sourcePath = await pickDesktopBackground(kind);
    } catch (caught) {
      setError(errorMessage(caught, t));
      return;
    }
    if (!sourcePath) {
      return;
    }
    await importPath(sourcePath, kind);
  }, [busy, importPath, mode, t]);

  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = '';
      if (!file || mode === 'default' || busyRef.current !== 'idle') {
        return;
      }
      acceptFile(file);
    },
    [acceptFile, mode],
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragActive(false);
      if (busyRef.current !== 'idle') {
        return;
      }
      const files = event.dataTransfer.files;
      if (!files || files.length === 0) {
        return;
      }
      acceptFile(files[0]);
    },
    [acceptFile],
  );

  // 新建但尚未应用的视频预览：音量/静音直接作用在本地 <video> 上。
  useEffect(() => {
    const video = localVideoRef.current;
    if (!video) {
      return;
    }
    video.volume = clamp(volume, 0, 1);
    video.muted = muted;
  }, [volume, muted, drafts]);

  const handlePreviewPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (busyRef.current !== 'idle') {
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      previewDragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        baseX: adjust.offsetX,
        baseY: adjust.offsetY,
        width: rect.width || 1,
        height: rect.height || 1,
      };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [adjust.offsetX, adjust.offsetY],
  );

  const handlePreviewPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const state = previewDragRef.current;
    if (!state) {
      return;
    }
    const offsetX = clamp(
      state.baseX + ((event.clientX - state.startX) / state.width) * 100,
      -50,
      50,
    );
    const offsetY = clamp(
      state.baseY + ((event.clientY - state.startY) / state.height) * 100,
      -50,
      50,
    );
    setAdjust((previous) => ({ ...previous, offsetX, offsetY }));
  }, []);

  const handlePreviewPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    previewDragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  // 滚轮缩放：用原生非 passive 监听，避免弹窗滚动条跟着动。
  const previewRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const element = previewRef.current;
    if (!element || (mode !== 'image' && mode !== 'video') || !drafts[mode]) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      if (busyRef.current !== 'idle') {
        return;
      }
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.0015);
      setAdjust((previous) => ({
        ...previous,
        scale: clamp(previous.scale * factor, 0.25, 5),
      }));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [mode, drafts]);

  const handleApply = useCallback(async () => {
    if (busyRef.current !== 'idle') {
      return;
    }
    busyRef.current = 'applying';
    cancelScheduledPrune();
    setBusy('applying');
    setError(null);
    try {
      if (mode === 'default') {
        browserResetBgConfig();
        schedulePrune();
        onClose();
        return;
      }

      const draft = draftsRef.current[mode];
      if (!draft) {
        setError(t.browserBgUnsupported);
        return;
      }
      const base: BackgroundConfig = {
        mode,
        fit,
        adjust: adjustRef.current,
        volume: mode === 'video' ? volume : undefined,
        muted: mode === 'video' ? muted : undefined,
        fileName: draft.fileName || undefined,
      };

      if (isDesktopShell()) {
        const assetPath =
          draft.assetPath ??
          (mode === browserBgConfig.mode ? browserBgConfig.assetPath : undefined);
        if (!assetPath) {
          setError(t.browserBgLoadFailed);
          return;
        }
        browserSetBgConfig({ ...base, assetPath });
      } else {
        let assetId = draft.assetId;
        if (draft.blob) {
          assetId = await putBackgroundBlob(mode, draft.blob);
        }
        assetId = assetId ?? (mode === browserBgConfig.mode ? browserBgConfig.assetId : undefined);
        if (!assetId) {
          setError(t.browserBgLoadFailed);
          return;
        }
        browserSetBgConfig({ ...base, adjust: adjustRef.current, assetId });
      }
      schedulePrune();
      onClose();
    } catch (caught) {
      setError(errorMessage(caught, t));
    } finally {
      busyRef.current = 'idle';
      setBusy('idle');
    }
  }, [
    browserBgConfig.assetId,
    browserBgConfig.assetPath,
    browserBgConfig.mode,
    browserResetBgConfig,
    browserSetBgConfig,
    cancelScheduledPrune,
    fit,
    mode,
    muted,
    onClose,
    schedulePrune,
    t,
    volume,
  ]);

  const handleReset = useCallback(() => {
    clearDrafts();
    setMode('default');
    setFit('cover');
    setAdjust(DEFAULT_ADJUST);
    setVolume(0);
    setMuted(true);
    setError(null);
  }, [clearDrafts]);

  const handleBackdrop = useCallback(
    (event: React.MouseEvent) => {
      if (busy !== 'idle') {
        return;
      }
      if (event.target === event.currentTarget) {
        onClose();
      }
    },
    [busy, onClose],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (busy !== 'idle') {
        return;
      }
      if (event.key === 'Escape') {
        onClose();
      }
    },
    [busy, onClose],
  );

  if (!open) {
    return null;
  }

  const activeKind: BackgroundKind | null = mode === 'default' ? null : mode;
  const activeDraft = activeKind ? drafts[activeKind] : null;
  const showFill = activeDraft !== null;
  const transform = adjustTransform(adjust);
  const appliedStageKey = backgroundSourceKey(browserBgConfig);
  const draftStageKey = backgroundSourceKey({
    assetPath: activeDraft?.assetPath,
    assetId: activeDraft?.assetId,
  });
  const mirrorsAppliedVideo =
    mode === 'video' &&
    browserBgConfig.mode === 'video' &&
    appliedStageKey !== null &&
    draftStageKey === appliedStageKey;

  // 只有图片走 CSS 背景 + 外层 transform；视频由内部元素/共享舞台各自处理，
  // 外层再套 transform 会双重缩放。
  const previewStyle: CSSProperties =
    activeDraft && mode === 'image'
      ? {
          backgroundImage: `url(${activeDraft.previewUrl})`,
          backgroundSize: fit === 'contain' ? 'contain' : fit === 'repeat' ? '33% auto' : 'cover',
          backgroundRepeat: fit === 'repeat' ? 'repeat' : 'no-repeat',
          transform,
        }
      : {};

  return createPortal(
    <div
      className="adl-prompt-modal"
      onKeyDown={handleKeyDown}
      onClick={handleBackdrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className="adl-prompt-modal__panel adl-bg-settings"
        role="dialog"
        aria-modal="true"
        aria-label={t.browserBgSettings}
      >
        <div className="adl-prompt-modal__header">
          {t.browserBgSettings}
          <button
            type="button"
            className="adl-prompt-modal__header-close"
            onClick={onClose}
            aria-label={t.browserClose}
            disabled={busy !== 'idle'}
          >
            ✕
          </button>
        </div>

        <div className="adl-bg-settings__body">
          <div className="adl-bg-settings__section">
            <div
              className="adl-bg-settings__mode-group"
              role="group"
              aria-label={t.browserBgSettings}
            >
              {(['default', 'image', 'video'] as const).map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  className={`adl-bg-settings__mode-btn${mode === candidate ? ' is-active' : ''}`}
                  onClick={() => {
                    setMode(candidate);
                    if (candidate === 'video' && fit === 'repeat') {
                      setFit('cover');
                    }
                  }}
                  aria-pressed={mode === candidate}
                  disabled={busy !== 'idle'}
                >
                  {candidate === 'default'
                    ? t.browserBgModeDefault
                    : candidate === 'image'
                      ? t.browserBgModeImage
                      : t.browserBgModeVideo}
                </button>
              ))}
            </div>
          </div>

          {activeKind && (
            <div className="adl-bg-settings__section">
              <input
                ref={fileInputRef}
                type="file"
                accept={
                  activeKind === 'video'
                    ? 'video/mp4,video/webm'
                    : 'image/jpeg,image/png,image/gif,image/webp'
                }
                style={{ display: 'none' }}
                onChange={handleFileInputChange}
              />
              {activeDraft ? (
                <>
                  <div className="adl-bg-settings__preview" ref={previewRef}>
                    <div
                      className="adl-bg-settings__preview-media"
                      style={previewStyle}
                      onPointerDown={handlePreviewPointerDown}
                      onPointerMove={handlePreviewPointerMove}
                      onPointerUp={handlePreviewPointerUp}
                      onPointerCancel={handlePreviewPointerUp}
                    >
                      {mode === 'video' &&
                        (mirrorsAppliedVideo && appliedStageKey ? (
                          <BackgroundVideoCanvas
                            stageKey={appliedStageKey}
                            url={activeDraft.previewUrl}
                            fit={fit}
                            adjust={adjust}
                            active
                            muted={muted}
                            volume={volume}
                          />
                        ) : (
                          <video
                            ref={localVideoRef}
                            className="adl-bg-settings__preview-video"
                            src={activeDraft.previewUrl}
                            style={{
                              objectFit: fit === 'contain' ? 'contain' : 'cover',
                              transform,
                            }}
                            autoPlay
                            loop
                            muted={muted}
                            playsInline
                          />
                        ))}
                    </div>
                    <button
                      type="button"
                      className="adl-bg-settings__preview-reset"
                      onClick={() => {
                        if (busyRef.current === 'idle') {
                          setAdjust(DEFAULT_ADJUST);
                        }
                      }}
                      disabled={busy !== 'idle'}
                      title={t.browserBgAdjustReset}
                      aria-label={t.browserBgAdjustReset}
                    >
                      <IconRefreshCw size={14} decorative />
                    </button>
                    {busy === 'importing' && (
                      <div className="adl-bg-settings__busy">
                        <Spinner size="md" />
                        <span>{t.browserBgImporting}</span>
                      </div>
                    )}
                  </div>
                  <div className="adl-bg-settings__file-meta">
                    <span className="adl-bg-settings__file-name" title={activeDraft.fileName}>
                      {activeDraft.fileName}
                    </span>
                    <div className="adl-bg-settings__file-actions">
                      <button
                        type="button"
                        className="adl-bg-settings__link-btn"
                        onClick={() => void handlePick()}
                        disabled={busy !== 'idle'}
                      >
                        {t.browserBgRefreshFile}
                      </button>
                      <button
                        type="button"
                        className="adl-bg-settings__link-btn"
                        onClick={() => replaceDraft(activeKind, null)}
                        disabled={busy !== 'idle'}
                      >
                        {t.browserBgRemoveFile}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div
                  className={`adl-bg-settings__upload-zone${dragActive ? ' is-drag-active' : ''}`}
                  onClick={() => void handlePick()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      void handlePick();
                    }
                  }}
                >
                  {busy === 'importing' ? (
                    <>
                      <Spinner size="md" className="adl-bg-settings__upload-spinner" />
                      <div className="adl-bg-settings__upload-text">{t.browserBgImporting}</div>
                    </>
                  ) : (
                    <>
                      <div className="adl-bg-settings__upload-icon" aria-hidden="true">
                        📁
                      </div>
                      <div className="adl-bg-settings__upload-text">
                        {dragActive ? t.browserBgDropActive : t.browserBgUploadHint}
                      </div>
                      <div className="adl-bg-settings__upload-hint">{t.browserBgFileTypes}</div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {showFill && activeKind === 'video' && (
            <div className="adl-bg-settings__section">
              <div className="adl-bg-settings__volume-row">
                <label className="adl-bg-settings__label">{t.browserBgVolume}</label>
                <BackgroundVolumeControl
                  volume={volume}
                  muted={muted}
                  onVolumeChange={(next) => {
                    if (busyRef.current !== 'idle') {
                      return;
                    }
                    setVolume(next);
                    setMuted(next === 0);
                    if (mirrorsAppliedVideo) {
                      browserSetBgConfig({ ...browserBgConfig, volume: next, muted: next === 0 });
                    }
                  }}
                  onToggleMute={() => {
                    if (busyRef.current !== 'idle') {
                      return;
                    }
                    const nextMuted = !muted;
                    setMuted(nextMuted);
                    if (mirrorsAppliedVideo) {
                      browserSetBgConfig({ ...browserBgConfig, muted: nextMuted });
                    }
                  }}
                  label={t.browserBgVolume}
                  editHint={t.browserBgVolumeEditHint}
                />
              </div>
            </div>
          )}

          {showFill && activeKind && (
            <div className="adl-bg-settings__section">
              <label className="adl-bg-settings__label">{t.browserBgFillMode}</label>
              <div
                className="adl-bg-settings__fill-group"
                role="group"
                aria-label={t.browserBgFillMode}
              >
                {(activeKind === 'video' ? (['cover', 'contain'] as const) : FILL_OPTIONS).map(
                  (candidate) => (
                    <button
                      key={candidate}
                      type="button"
                      className={`adl-bg-settings__fill-btn${fit === candidate ? ' is-active' : ''}`}
                      onClick={() => {
                        setFit(candidate);
                        // 切换填充模式恢复该模式的默认尺寸/位置。
                        setAdjust(DEFAULT_ADJUST);
                      }}
                      aria-pressed={fit === candidate}
                      disabled={busy !== 'idle'}
                    >
                      {candidate === 'cover'
                        ? t.browserBgFillCover
                        : candidate === 'contain'
                          ? t.browserBgFillContain
                          : t.browserBgFillRepeat}
                    </button>
                  ),
                )}
              </div>
              <p className="adl-bg-settings__adjust-hint">{t.browserBgAdjustHint}</p>
            </div>
          )}

          {error && <div className="adl-bg-settings__error">{error}</div>}
        </div>

        <div className="adl-bg-settings__actions adl-prompt-modal__actions adl-prompt-modal__actions--fill">
          <button
            type="button"
            className="adl-btn adl-btn--ghost adl-btn--square"
            onClick={handleReset}
            disabled={busy !== 'idle'}
          >
            {t.browserBgResetDefault}
          </button>
          <button
            type="button"
            className="adl-btn adl-btn--primary adl-btn--square adl-bg-settings__apply"
            onClick={() => void handleApply()}
            disabled={busy !== 'idle'}
            aria-label={busy === 'applying' ? t.browserBgApplying : t.browserBgApply}
          >
            {busy === 'applying' ? <Spinner size="sm" /> : t.browserBgApply}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
