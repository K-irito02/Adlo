import { describe, expect, it } from 'vitest';
import { computeDrawRect } from './backgroundVideoStage';

describe('backgroundVideoStage.computeDrawRect', () => {
  it('cover：按目标比例居中裁切源画面', () => {
    // 1920x1080（16:9）画到 800x400（2:1）：需要裁掉上下。
    const rect = computeDrawRect(1920, 1080, 800, 400, 'cover');
    expect(rect.sw).toBe(1920);
    expect(rect.sh).toBeCloseTo(960);
    expect(rect.sy).toBeCloseTo(60);
    expect(rect.dx).toBe(0);
    expect(rect.dy).toBe(0);
    expect(rect.dw).toBe(800);
    expect(rect.dh).toBe(400);
  });

  it('cover：宽屏视频画到窄区域时裁切左右', () => {
    // 1920x1080 画到 400x400：裁掉左右。
    const rect = computeDrawRect(1920, 1080, 400, 400, 'cover');
    expect(rect.sw).toBeCloseTo(1080);
    expect(rect.sx).toBeCloseTo(420);
    expect(rect.dw).toBe(400);
    expect(rect.dh).toBe(400);
  });

  it('contain：完整画面居中留边', () => {
    const rect = computeDrawRect(1920, 1080, 800, 400, 'contain');
    expect(rect.sx).toBe(0);
    expect(rect.sy).toBe(0);
    expect(rect.sw).toBe(1920);
    expect(rect.sh).toBe(1080);
    expect(rect.dw).toBeCloseTo(711.111, 2);
    expect(rect.dh).toBe(400);
    expect(rect.dx).toBeCloseTo(44.444, 2);
    expect(rect.dy).toBe(0);
  });

  it('尺寸未就绪时返回全零（drawSurface 在 readyState/canvas 未就绪时自行跳过绘制）', () => {
    expect(computeDrawRect(0, 0, 800, 400, 'cover')).toEqual({
      sx: 0,
      sy: 0,
      sw: 0,
      sh: 0,
      dx: 0,
      dy: 0,
      dw: 0,
      dh: 0,
    });
  });
});
