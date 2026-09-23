import { useEffect, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { formatBytes } from '@root/design-system/html';
import { IconCircleHelp } from '../../icons';
import { HintCardTrigger } from '../../components/HintCard';
import type { StorageCategoryStatus } from '@shared/ipc/storage';
import { CATEGORY_COPY, type CategoryCopy } from './storageCategoryCopy';

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
      className="adl-settings-input adl-settings-input--path"
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
    <div
      className={`adl-settings-row${controlsEnabled ? ' adl-settings-row--path-center' : ''}`}
      data-testid="storage-category-row"
    >
      <div className="adl-settings-row__label">
        <div className="adl-settings-row__label-text">
          <HintCardTrigger
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
              className="adl-icon-button adl-icon-button--info"
              data-testid="storage-category-info"
              aria-label={desc || name}
              tabIndex={-1}
            >
              <IconCircleHelp size={14} />
            </button>
          </HintCardTrigger>
          <span>{name}</span>
        </div>
        {/* 可编辑时路径显示在右侧路径框里，避免与 label 冗余；只读时在此展示 */}
        {!controlsEnabled ? <small>{path}</small> : null}
        <small>{usage}</small>
        {category.foreignFiles.length > 0 ? (
          <small>
            {t.storageForeignFiles.replace('{count}', String(category.foreignFiles.length))}
          </small>
        ) : null}
      </div>
      {controlsEnabled ? (
        <div className="adl-settings-row__control adl-settings-row__control--inline">
          <ManualPathInput
            value={path}
            label={t.storageManualInput}
            placeholder={t.storageManualInputPlaceholder}
            disabled={picking}
            onCommit={onPathChange}
          />
          <button
            type="button"
            className="adl-btn adl-btn--path-pick"
            onClick={onPickDirectory}
            disabled={picking}
          >
            {t.storagePickDir}
          </button>
        </div>
      ) : null}
    </div>
  );
}
