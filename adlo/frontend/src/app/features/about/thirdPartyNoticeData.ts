import type { ThirdPartyNoticeData } from './thirdPartyNoticesTypes';

let pending: Promise<ThirdPartyNoticeData> | null = null;

/**
 * 按需加载全量依赖清单。
 *
 * 生成物含上千条依赖条目（许可正文按内容去重，同文只存一份），必须独立成 chunk：只在用户打开「第三方声明」时
 * 下载，不影响设置页与首屏。失败不缓存，下次打开可重试。
 */
export function loadThirdPartyNoticeData(): Promise<ThirdPartyNoticeData> {
  pending ??= import('./thirdPartyNotices.generated')
    .then((module) => module.THIRD_PARTY_NOTICES_DATA)
    .catch((error: unknown) => {
      pending = null;
      throw error;
    });
  return pending;
}
