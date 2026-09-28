import type { CopyDict } from '../../i18n';
import { formatT } from '../../i18n/formatT';
import type { StoragePreflightIssue } from '@shared/ipc/storage';
import { CATEGORY_COPY } from './storageCategoryCopy';

/**
 * 预检错误/警告英文原文（Rust `crates/kernel/src/storage/migration.rs`）→ i18n key 映射。
 *
 * 背景（产品决策 2026-09-27）：预检错误由后端产出英文原文，直接展示会出现
 * 「无法迁移：source and target are identical」这类中英混排、术语化文案。已知产品级
 * 错误在前端本地化为大众化文案；未知消息（OS 错误原文、未来新增类别）返回 null，
 * 调用方回退原文，保证信息不丢失。
 */
export function preflightMessageKey(message: string): keyof CopyDict | null {
  const m = message.toLowerCase();
  if (m.includes('source and target are identical')) {
    return 'storagePreflightIdentical';
  }
  if (m.includes('is inside source')) {
    return 'storagePreflightInside';
  }
  if (m.includes('cannot create target parent')) {
    return 'storagePreflightCreateDir';
  }
  if (m.includes('is not writable')) {
    return 'storagePreflightNotWritable';
  }
  return null;
}

/** 本地化单条预检消息：命中映射用本地文案，否则原文回退。 */
export function localizePreflightMessage(message: string, t: CopyDict): string {
  const key = preflightMessageKey(message);
  return key !== null ? t[key] : message;
}

/**
 * 单条结构化 issue → 展示文本：本地化消息 + 已知分类加「［分类名］」前缀（事项 9）。
 * 分类名走 `CATEGORY_COPY[key].name` i18n；未知分类 key 回退 key 本身；
 * 根级问题（category 为 null）不加前缀。
 */
export function localizePreflightIssue(issue: StoragePreflightIssue, t: CopyDict): string {
  const message = localizePreflightMessage(issue.message, t);
  if (issue.category === null) {
    return message;
  }
  const copy = CATEGORY_COPY[issue.category as keyof typeof CATEGORY_COPY];
  const name = copy ? String(t[copy.name]) : issue.category;
  return formatT(t, 'storagePreflightIssueWithCategory', { category: name, message });
}

/**
 * issue 列表 → 展示文本列表：本地化 + 分类名前缀 + **按最终文本去重**（事项 9）。
 * 同一分类的同类错误（如多条 not-writable）本地化后文本相同，只保留一条；
 * 不同分类因前缀不同自然区分，不去重。
 */
export function localizePreflightIssues(
  issues: readonly StoragePreflightIssue[],
  t: CopyDict,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const issue of issues) {
    const text = localizePreflightIssue(issue, t);
    if (!seen.has(text)) {
      seen.add(text);
      out.push(text);
    }
  }
  return out;
}
