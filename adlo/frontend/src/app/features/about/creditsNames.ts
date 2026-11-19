import { THIRD_PARTY_NOTICES } from './thirdPartyNotices';
import { THIRD_PARTY_NOTICE_NAMES } from './thirdPartyNoticeNames.generated';

/**
 * 非 npm / Cargo 包、但致谢名称索引需要覆盖的第三方名称。
 *
 * 字体未随包分发、外部工具由用户侧安装；它们不产生许可全文义务，
 * 但仍属于致谢范围，因此只进名称索引，不进「第三方声明」。
 */
export const CREDITS_EXTRA_NAMES = ['Inter', 'JetBrains Mono', 'DSH', 'OpenCode CLI'] as const;

/**
 * 致谢弹窗「第三方名称」的完整索引：全量依赖 + 随包素材/移植代码 + 外部名称。
 *
 * 只含名称、不含版本与许可正文，因此可以静态加载（约 26 KB），
 * 不会为了列名称而拉取数 MB 的 `thirdPartyNotices.generated.ts`。
 */
export const THIRD_PARTY_NAMES: readonly string[] = [
  ...new Set([
    ...THIRD_PARTY_NOTICE_NAMES,
    ...THIRD_PARTY_NOTICES.map((notice) => notice.name),
    ...CREDITS_EXTRA_NAMES,
  ]),
].sort();
