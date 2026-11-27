import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BackgroundSettingsDialog } from './BackgroundSettingsDialog';
import { useAppStore } from '@stores/slicedStore';
import type { CopyDict } from '@i18n/types';
import type { BackgroundConfig } from '@stores/slices/browserSlice';

const assets = vi.hoisted(() => ({
  isDesktopShell: vi.fn(() => false),
  draftFromLocalFile: vi.fn(),
  backgroundKindForFile: vi.fn((name: string) => (name.endsWith('.mp4') ? 'video' : 'image')),
  backgroundSourceKey: vi.fn((config: { assetPath?: string; assetId?: string }) =>
    config.assetPath ? `path:${config.assetPath}` : config.assetId ? `idb:${config.assetId}` : null,
  ),
  fileExtension: vi.fn((name: string) => name.split('.').pop() ?? ''),
  isBackgroundExtensionAllowed: vi.fn(() => true),
  importDroppedPath: vi.fn(),
  pickDesktopBackground: vi.fn(),
  putBackgroundBlob: vi.fn(),
  pruneBackgroundBlobs: vi.fn(() => Promise.resolve()),
  pruneDesktopBackgrounds: vi.fn(() => Promise.resolve()),
  resolveBackgroundUrl: vi.fn(async () => ({ url: 'blob:saved' })),
}));

const canvasProbe = vi.hoisted(() => ({
  adjust: null as { scale: number; offsetX: number; offsetY: number } | null,
  fit: null as string | null,
}));

vi.mock('./backgroundAssets', () => assets);
vi.mock('./BackgroundVideoCanvas', () => ({
  BackgroundVideoCanvas: (props: {
    adjust?: { scale: number; offsetX: number; offsetY: number };
    fit?: string;
  }) => {
    canvasProbe.adjust = props.adjust ?? null;
    canvasProbe.fit = props.fit ?? null;
    return <div data-testid="video-canvas-mirror" />;
  },
}));

const t = {
  browserBgSettings: '自定义背景',
  browserBgModeDefault: '默认',
  browserBgModeImage: '图片',
  browserBgModeVideo: '视频',
  browserBgUploadHint: '点击选择文件或拖拽到此处',
  browserBgFileTypes: '支持 JPG、PNG、GIF、MP4、WebM',
  browserBgFillMode: '背景填充',
  browserBgFillCover: '铺满',
  browserBgFillContain: '适应',
  browserBgFillRepeat: '平铺',
  browserBgAdjustHint: '在预览区拖动可调整位置，滚轮可缩放',
  browserBgAdjustReset: '复位',
  browserBgVolumeEditHint: '双击输入',
  browserBgVolume: '音量',
  browserBgDropActive: '松开以使用该文件',
  browserBgImporting: '正在读取…',
  browserBgApplying: '正在应用…',
  browserBgUnsupported: '不支持该文件类型',
  browserBgLoadFailed: '背景素材加载失败',
  browserBgRemoveFile: '移除文件',
  browserBgRefreshFile: '更换文件',
  browserBgResetDefault: '重置',
  browserBgApply: '应用',
  browserClose: '关闭',
} as unknown as CopyDict;

const draft = {
  fileName: 'wall.png',
  previewUrl: 'blob:draft',
  blob: new File(['x'], 'wall.png', { type: 'image/png' }),
};

const realSetBgConfig = useAppStore.getState().browserSetBgConfig;

function renderDialog(onClose = vi.fn()) {
  return {
    onClose,
    ...render(<BackgroundSettingsDialog open t={t} onClose={onClose} />),
  };
}

function setConfig(config: BackgroundConfig) {
  useAppStore.setState({ browserBgConfig: config });
}

describe('BackgroundSettingsDialog', () => {
  beforeEach(() => {
    assets.draftFromLocalFile.mockReset().mockReturnValue(draft);
    assets.backgroundKindForFile
      .mockReset()
      .mockImplementation((name: string) => (name.endsWith('.mp4') ? 'video' : 'image'));
    assets.resolveBackgroundUrl.mockReset().mockResolvedValue({ url: 'blob:saved' });
    assets.putBackgroundBlob.mockReset().mockResolvedValue('background-image');
    assets.pruneBackgroundBlobs.mockReset().mockResolvedValue(undefined);
    setConfig({ mode: 'default', fit: 'cover' });
    useAppStore.setState({ browserSetBgConfig: vi.fn(), browserResetBgConfig: vi.fn() });
  });

  afterEach(() => {
    vi.useRealTimers();
    setConfig({ mode: 'default', fit: 'cover' });
  });

  it('「重置」只清空草稿并回到默认模式，不关闭弹窗', () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: '图片' }));
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['x'], 'wall.png', { type: 'image/png' })] },
    });
    expect(document.querySelector('.adl-bg-settings__preview')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '重置' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '默认' }).className).toContain('is-active');
    expect(document.querySelector('.adl-bg-settings__preview')).toBeNull();
    expect(document.querySelector('.adl-bg-settings__upload-zone')).toBeNull();
  });

  it('图片与视频各自保留文件槽：切换类型不再显示空区域', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: '图片' }));
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).toBeTruthy();
    fireEvent.change(input!, {
      target: { files: [new File(['x'], 'wall.png', { type: 'image/png' })] },
    });
    expect(document.querySelector('.adl-bg-settings__preview')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '视频' }));
    expect(document.querySelector('.adl-bg-settings__upload-zone')).not.toBeNull();
    expect(screen.getByText('点击选择文件或拖拽到此处')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '图片' }));
    expect(document.querySelector('.adl-bg-settings__preview')).not.toBeNull();
  });

  it('拖拽文件到上传区即生成预览（无需再点选）', () => {
    assets.draftFromLocalFile.mockReturnValue({
      fileName: 'drop.png',
      previewUrl: 'blob:drop',
      blob: new File(['x'], 'drop.png', { type: 'image/png' }),
    });
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: '图片' }));
    const zone = document.querySelector('.adl-bg-settings__upload-zone');
    expect(zone).toBeTruthy();
    fireEvent.drop(zone!, {
      dataTransfer: { files: [new File(['x'], 'drop.png', { type: 'image/png' })] },
    });
    expect(document.querySelector('.adl-bg-settings__preview')).not.toBeNull();
  });

  it('应用时按钮显示圆圈加载并在写入完成后关闭', async () => {
    let release: (value: string) => void = () => {};
    assets.putBackgroundBlob.mockReturnValue(
      new Promise<string>((resolve) => {
        release = resolve;
      }),
    );
    const setBgConfig = vi.fn();
    useAppStore.setState({ browserSetBgConfig: setBgConfig });
    const { onClose } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: '图片' }));
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['x'], 'wall.png', { type: 'image/png' })] },
    });

    fireEvent.click(screen.getByRole('button', { name: '应用' }));
    const applyButton = screen.getByRole('button', { name: '正在应用…' });
    expect(applyButton.querySelector('.adl-spinner')).not.toBeNull();
    expect(applyButton.textContent).toBe('');

    release('background-image');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(setBgConfig).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'image', fit: 'cover', assetId: 'background-image' }),
    );
  });

  it('视频模式在文件区下方提供音量控件，调到非零音量后解除静音', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: '视频' }));
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['x'], 'clip.mp4', { type: 'video/mp4' })] },
    });
    const slider = screen.getByRole('slider', { name: '音量' });
    expect(slider.getAttribute('aria-valuenow')).toBe('0');
    fireEvent.keyDown(slider, { key: 'ArrowUp' });
    expect(slider.getAttribute('aria-valuenow')).toBe('5');
    const video = document.querySelector<HTMLVideoElement>('.adl-bg-settings__preview-video');
    expect(video?.muted).toBe(false);
    expect(video?.volume).toBeCloseTo(0.05);
  });

  it('自由调整并入三种填充模式：无独立模式与滑块，滚轮缩放 + 复位图标 + 拖拽平移', async () => {
    const setBgConfig = vi.fn();
    useAppStore.setState({ browserSetBgConfig: setBgConfig });
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: '图片' }));
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['x'], 'wall.png', { type: 'image/png' })] },
    });

    // 没有「自由调整」第四档，也没有缩放滑块。
    expect(screen.queryByRole('button', { name: '自由调整' })).toBeNull();
    expect(screen.queryByRole('slider', { name: '缩放' })).toBeNull();
    expect(screen.getAllByRole('button', { name: /铺满|适应|平铺/ })).toHaveLength(3);

    const media = document.querySelector<HTMLElement>('.adl-bg-settings__preview-media');
    expect(media).not.toBeNull();
    fireEvent.wheel(media!, { deltaY: -200 });
    expect(media!.style.transform).toContain('scale(1.3');

    fireEvent.click(screen.getByRole('button', { name: '复位' }));
    expect(media!.style.transform).toBe('translate(0%, 0%) scale(1)');

    // 拖拽平移（jsdom 无布局，尺寸按 1 兜底，位移会被钳到 ±50%）。
    fireEvent.pointerDown(media!, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(media!, { pointerId: 1, clientX: 20, clientY: 10 });
    fireEvent.pointerUp(media!, { pointerId: 1 });
    expect(media!.style.transform).toContain('translate(50%');

    fireEvent.wheel(media!, { deltaY: -200 });
    fireEvent.click(screen.getByRole('button', { name: '应用' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(setBgConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'image',
        fit: 'cover',
        adjust: expect.objectContaining({ scale: expect.any(Number) }),
      }),
    );
  });

  it('切换铺满/适应/平铺时重置自由调整', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: '图片' }));
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['x'], 'wall.png', { type: 'image/png' })] },
    });
    const media = document.querySelector<HTMLElement>('.adl-bg-settings__preview-media');
    fireEvent.wheel(media!, { deltaY: -200 });
    expect(media!.style.transform).not.toBe('translate(0%, 0%) scale(1)');
    fireEvent.click(screen.getByRole('button', { name: '适应' }));
    expect(media!.style.transform).toBe('translate(0%, 0%) scale(1)');
  });

  it('镜像已应用视频时，调音量不会清空草稿或缩放', async () => {
    setConfig({
      mode: 'video',
      fit: 'cover',
      assetPath: 'C:/bg.mp4',
      adjust: { scale: 1.5, offsetX: 10, offsetY: 0 },
      volume: 0.4,
      muted: false,
    });
    assets.resolveBackgroundUrl.mockResolvedValue({ url: 'asset://bg' });
    useAppStore.setState({ browserSetBgConfig: realSetBgConfig });
    renderDialog();

    await waitFor(() => expect(screen.getByTestId('video-canvas-mirror')).toBeTruthy());
    // 滚轮监听是 preview 上的原生非 passive 事件，装在草稿就绪后的 effect 里。
    // 等待缩放实际变化再断言，避免重负载下 DOM 已渲染但 effect 尚未附加时拿到种子值 1.5。
    await waitFor(() => {
      fireEvent.wheel(document.querySelector('.adl-bg-settings__preview')!, { deltaY: -200 });
      expect(canvasProbe.adjust?.scale).toBeGreaterThan(1.5);
    });
    fireEvent.keyDown(screen.getByRole('slider', { name: '音量' }), { key: 'ArrowUp' });

    expect(document.querySelector('.adl-bg-settings__preview')).not.toBeNull();
    expect(screen.getByTestId('video-canvas-mirror')).toBeTruthy();
    expect(screen.getByRole('slider', { name: '音量' })).toBeTruthy();
    // 调音量不得把缩放重置回种子值。
    expect(canvasProbe.adjust?.scale).toBeGreaterThan(1.5);
    expect(canvasProbe.fit).toBe('cover');
    expect(useAppStore.getState().browserBgConfig.volume).toBeCloseTo(0.45);
  });

  it('关闭弹窗后的延迟清理只保留当前配置的素材', () => {
    vi.useFakeTimers();
    setConfig({ mode: 'image', fit: 'cover', assetId: 'background-image-keep' });
    render(<BackgroundSettingsDialog open={false} t={t} onClose={vi.fn()} />);

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(assets.pruneBackgroundBlobs).toHaveBeenCalledWith(['background-image-keep']);
  });

  it('点击已显示的背景不会触发更换文件', () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click');
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: '图片' }));
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['x'], 'wall.png', { type: 'image/png' })] },
    });
    clickSpy.mockClear();
    const preview = document.querySelector('.adl-bg-settings__preview');
    fireEvent.click(preview!);
    expect(clickSpy).not.toHaveBeenCalled();
    clickSpy.mockRestore();
  });
});
