import type { ThirdPartyNoticePackage } from './thirdPartyNoticesTypes';

/** 一次渲染上限：清单可达上千条，先截断再交给搜索缩小范围。 */
export const NOTICE_PAGE_LIMIT = 200;

export interface NoticeFilterResult {
  matched: ThirdPartyNoticePackage[];
  visible: ThirdPartyNoticePackage[];
  truncated: boolean;
}

/** 按名称 / 版本 / 许可证原文 / SPDX id 过滤；空查询返回全部（仍受上限约束）。 */
export function filterNoticePackages(
  packages: ThirdPartyNoticePackage[],
  query: string,
  limit = NOTICE_PAGE_LIMIT,
): NoticeFilterResult {
  const needle = query.trim().toLowerCase();
  const matched =
    needle === ''
      ? packages
      : packages.filter(
          (pkg) =>
            pkg.name.toLowerCase().includes(needle) ||
            pkg.version.toLowerCase().includes(needle) ||
            pkg.license.toLowerCase().includes(needle) ||
            pkg.licenseIds.some((id) => id.toLowerCase().includes(needle)),
        );
  return {
    matched,
    visible: matched.slice(0, limit),
    truncated: matched.length > limit,
  };
}
