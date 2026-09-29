import { useEffect, useRef, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { formatBytes } from '@root/design-system/html';
import { IconCircleHelp } from '../../icons';
import { HintCardTrigger } from '../../components/HintCard';
import type { StorageCategoryStatus } from '@shared/ipc/storage';
import { CATEGORY_COPY, type CategoryCopy } from './storageCategoryCopy';

/**
 * 手输路径草稿：本地持有草稿，失焦或回车才提交（与 SettingsControls 的 InputControl 同构），
 * 避免逐键写回外部状态被并发 patch 丢弃。
 *
 * `commitOnChange`（逐键提交，事项 8）：提交目标是**本地草稿 state**（如存储分类行的
 * `categoryDrafts`）时开启——逐键更新才能让 isDirty 派生的脏条/底部 CTA 即时出现。
 * 提交目标是 store/后端（如下载路径 `changeDownloadPath`，可能触发真实文件搬运）时
 * 保持失焦提交，勿开启。
 *
 * 草稿同步用**脏标记**：用户改过（dirty）后，外部 value 变化不再覆盖在途输入
 * （如系统默认路径异步到达、上游状态刷新）；prop 追上已提交值（value === draft）时
 * 清除脏标记恢复同步——避免「焦点期间外部更新」在失焦时把旧值写回去。
 */
export function ManualPathInput({
  value,
  label,
  placeholder,
  disabled,
  onCommit,
  commitOnChange = false,
}: {
  value: string;
  label: string;
  placeholder: string;
  disabled: boolean;
  onCommit: (path: string) => void;
  commitOnChange?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const dirtyRef = useRef(false);
  const draftRef = useRef(value);
  draftRef.current = draft;

  useEffect(() => {
    if (!dirtyRef.current) {
      setDraft(value);
      return;
    }
    // 外部值已追上我们的提交：清除脏标记，恢复对外部更新的同步。
    if (value === draftRef.current) {
      dirtyRef.current = false;
    }
  }, [value]);

  const commit = () => {
    // 提交即交接点：清脏标记——即使本次草稿与外部值相等（无需回写），后续外部更新
    // 也应重新同步；否则后端归一（trim/空→默认）导致回显永远对不上草稿，脏标记永久滞留（M2）。
    dirtyRef.current = false;
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
      onChange={(e) => {
        dirtyRef.current = true;
        setDraft(e.target.value);
        // 逐键提交在 IME 组词中暂停（Phase 4 R2-R8-L1）：组词中间态直接进草稿
        // 会闪脏条；组词结束经 onCompositionEnd 补提交一次。
        if (commitOnChange && !(e.nativeEvent as InputEvent).isComposing) {
          onCommit(e.target.value);
        }
      }}
      onCompositionEnd={(e) => {
        if (commitOnChange) {
          onCommit((e.target as HTMLInputElement).value);
        }
      }}
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
      // 设置搜索的行级落点标记：值 = 该分类名（与索引 `CATEGORY_COPY[key].name` 同源）。
      // 未知分类 key（copy 缺席、name 回落原始 key）时与索引对不上 —— 落点自然回退到块锚点。
      data-settings-row={name}
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
            commitOnChange
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
