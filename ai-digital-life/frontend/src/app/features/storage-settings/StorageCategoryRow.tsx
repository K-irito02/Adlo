import { useEffect, useState } from 'react';
import type { CopyKey } from '@i18n';
import { useTCopy } from '@i18n/useTCopy';
import { formatBytes } from '@root/design-system/html';
import { IconCircleHelp } from '../../icons';
import { TooltipSimple } from '../../components/Tooltip';
import type { STORAGE_CATEGORY_KEYS, StorageCategoryStatus } from '@shared/ipc/storage';

interface CategoryCopy {
  name: CopyKey;
  desc: CopyKey;
  related: CopyKey;
}

/**
 * 分类 key → i18n key 映射（10 类全覆盖，spec §6.4 要求每类都有「存了什么 + 与什么有关」）。
 * 显式列全而不是拼接字符串：`indexedDB` 之类的 key 规范化不可靠，且显式表能让 TS 校验 key 存在。
 */
const CATEGORY_COPY: Record<(typeof STORAGE_CATEGORY_KEYS)[number], CategoryCopy> = {
  database: {
    name: 'storageCategoryDatabase',
    desc: 'storageCategoryDatabaseDesc',
    related: 'storageCategoryDatabaseRelated',
  },
  downloads_db: {
    name: 'storageCategoryDownloadsDb',
    desc: 'storageCategoryDownloadsDbDesc',
    related: 'storageCategoryDownloadsDbRelated',
  },
  site_meta_db: {
    name: 'storageCategorySiteMetaDb',
    desc: 'storageCategorySiteMetaDbDesc',
    related: 'storageCategorySiteMetaDbRelated',
  },
  config: {
    name: 'storageCategoryConfig',
    desc: 'storageCategoryConfigDesc',
    related: 'storageCategoryConfigRelated',
  },
  clipboard: {
    name: 'storageCategoryClipboard',
    desc: 'storageCategoryClipboardDesc',
    related: 'storageCategoryClipboardRelated',
  },
  snapshot: {
    name: 'storageCategorySnapshot',
    desc: 'storageCategorySnapshotDesc',
    related: 'storageCategorySnapshotRelated',
  },
  dsh: {
    name: 'storageCategoryDsh',
    desc: 'storageCategoryDshDesc',
    related: 'storageCategoryDshRelated',
  },
  logs: {
    name: 'storageCategoryLogs',
    desc: 'storageCategoryLogsDesc',
    related: 'storageCategoryLogsRelated',
  },
  credentials_fallback: {
    name: 'storageCategoryCredentialsFallback',
    desc: 'storageCategoryCredentialsFallbackDesc',
    related: 'storageCategoryCredentialsFallbackRelated',
  },
  downloads_default: {
    name: 'storageCategoryDownloadsDefault',
    desc: 'storageCategoryDownloadsDefaultDesc',
    related: 'storageCategoryDownloadsDefaultRelated',
  },
};

/**
 * 手输路径草稿：偏好/上游状态是不可乐观的外部值，逐键写回会被并发 patch 丢弃，
 * 因此本地持有草稿，失焦或回车才提交（与 SettingsControls 的 InputControl 同构）。
 */
function ManualPathInput({
  value,
  label,
  placeholder,
  disabled,
  onCommit,
}: {
  value: string;
  label: string;
  placeholder: string;
  disabled: boolean;
  onCommit: (path: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    if (draft !== value) {
      onCommit(draft);
    }
  };

  return (
    <input
      type="text"
      className="adl-settings-input"
      aria-label={label}
      placeholder={placeholder}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit();
        }
      }}
    />
  );
}

interface StorageCategoryRowProps {
  category: StorageCategoryStatus;
  /** 当前草稿路径（统一根模式下即后端解析出的路径）。 */
  path: string;
  /** 仅「每类独立」模式可编辑；统一根模式下路径由根目录派生，只读展示。 */
  editable: boolean;
  picking: boolean;
  onPathChange: (path: string) => void;
  onPickDirectory: () => void;
}

/**
 * 单个存储分类行：名称 + ⓘ 说明 + 只读路径 + 占用 + （可编辑时）选择目录/手输。
 * 文案全部走 i18n；`data-testid` 供 §6.4「每类都必须有说明」的测试断言。
 */
export function StorageCategoryRow({
  category,
  path,
  editable,
  picking,
  onPathChange,
  onPickDirectory,
}: StorageCategoryRowProps) {
  const { t } = useTCopy();
  const copy = (CATEGORY_COPY as Record<string, CategoryCopy | undefined>)[category.key];
  const name = copy ? t[copy.name] : category.key;
  const desc = copy ? t[copy.desc] : '';
  const related = copy ? t[copy.related] : '';

  const usage = category.exists
    ? t.storageUsed
        .replace('{size}', formatBytes(category.bytes))
        .replace('{files}', String(category.files))
    : t.storageNotCreated;

  const controlsEnabled = editable && category.movable;

  return (
    <div className="adl-settings-row" data-testid="storage-category-row">
      <div className="adl-settings-row__label">
        <div className="adl-settings-row__label-text">
          <span>{name}</span>
          <TooltipSimple
            placement="top"
            maxWidth={320}
            content={
              <span>
                {desc}
                {related ? (
                  <>
                    <br />
                    {related}
                  </>
                ) : null}
              </span>
            }
          >
            <button
              type="button"
              className="adl-icon-btn adl-icon-btn--xs"
              data-testid="storage-category-info"
              aria-label={desc || name}
              title={desc || name}
            >
              <IconCircleHelp size={12} decorative />
            </button>
          </TooltipSimple>
        </div>
        <small>{path}</small>
        <small>{usage}</small>
        {category.foreignFiles.length > 0 ? (
          <small>
            {t.storageForeignFiles.replace('{count}', String(category.foreignFiles.length))}
          </small>
        ) : null}
      </div>
      {controlsEnabled ? (
        <div
          className="adl-settings-row__control"
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
        >
          <button
            type="button"
            className="adl-btn adl-btn--ghost"
            onClick={onPickDirectory}
            disabled={picking}
          >
            {t.storagePickDir}
          </button>
          <ManualPathInput
            value={path}
            label={t.storageManualInput}
            placeholder={t.storageManualInputPlaceholder}
            disabled={picking}
            onCommit={onPathChange}
          />
        </div>
      ) : null}
    </div>
  );
}
