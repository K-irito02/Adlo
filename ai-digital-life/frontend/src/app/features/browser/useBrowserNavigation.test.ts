import { describe, expect, it } from 'vitest';
import { shouldContinueSmartBack } from './useBrowserNavigation';

describe('shouldContinueSmartBack', () => {
  const videoA = 'https://www.bilibili.com/video/BV1uhAazAEyv';
  const videoAWithSlash = 'https://www.bilibili.com/video/BV1uhAazAEyv/';
  const videoAWithTracking = 'https://www.bilibili.com/video/BV1uhAazAEyv/?spm_id_from=333.788.recommend_more_video.0';
  const videoB = 'https://www.bilibili.com/video/BV1v1um6JETE';

  it('continues when the landed URL is the same video (trailing-slash variant)', () => {
    expect(shouldContinueSmartBack(videoAWithSlash, videoA, 0)).toBe(true);
    expect(shouldContinueSmartBack(videoA, videoAWithSlash, 0)).toBe(true);
  });

  it('continues when the landed URL is the same video (tracking-param variant)', () => {
    expect(shouldContinueSmartBack(videoA, videoAWithTracking, 0)).toBe(true);
    expect(shouldContinueSmartBack(videoAWithTracking, videoA, 0)).toBe(true);
  });

  it('stops when the landed URL is a genuinely different page', () => {
    expect(shouldContinueSmartBack(videoA, videoB, 0)).toBe(false);
    expect(shouldContinueSmartBack(videoB, videoA, 0)).toBe(false);
  });

  it('stops when the step budget is exhausted', () => {
    expect(shouldContinueSmartBack(videoA, videoAWithSlash, 6)).toBe(false);
    expect(shouldContinueSmartBack(videoA, videoAWithSlash, 7)).toBe(false);
  });

  it('stops on empty URLs', () => {
    expect(shouldContinueSmartBack('', videoA, 0)).toBe(false);
    expect(shouldContinueSmartBack(videoA, '', 0)).toBe(false);
  });

  it('keeps different videos distinct even with the same path shape', () => {
    expect(shouldContinueSmartBack(`${videoA}?p=2`, `${videoA}?p=3`, 0)).toBe(false);
  });

  it('stops when the hash changes (real in-page anchor navigation)', () => {
    expect(shouldContinueSmartBack(`${videoA}#comment`, `${videoA}#reply`, 0)).toBe(false);
    expect(shouldContinueSmartBack(`${videoA}`, `${videoA}#comment`, 0)).toBe(false);
  });

  it('continues when the hash is unchanged across a tracking variant', () => {
    expect(shouldContinueSmartBack(`${videoA}#comment`, `${videoA}/?spm_id_from=1#comment`, 0)).toBe(
      true,
    );
  });
});
