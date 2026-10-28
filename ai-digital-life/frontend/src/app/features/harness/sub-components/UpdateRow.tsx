import { useTCopy } from '@i18n/useTCopy';

interface UpdateRowProps {
  mode: 'install' | 'check';
  /** 后端已给出可解析的最新版本；false 时不得显示「已是最新」。 */
  hasLatest: boolean;
  /** 目录拉取失败时同样不显示更新结论（避免误报「已是最新」）。 */
  catalogFailed: boolean;
  hasUpdate: boolean;
  disabled: boolean;
  onInstall: () => void;
  onCheck: () => void;
}

/**
 * 「检查更新」行：`install` 模式直接装最新（OpenCode），`check` 模式只查询并
 * 由适配器提示结果（DSH）。`check` 模式不显示更新状态提示。
 */
export function UpdateRow({
  mode,
  hasLatest,
  catalogFailed,
  hasUpdate,
  disabled,
  onInstall,
  onCheck,
}: UpdateRowProps) {
  const { t } = useTCopy();
  return (
    <div className="adl-settings-row" data-settings-row={t.harnessVersionUpdate}>
      <div className="adl-settings-row__label">
        <div className="adl-settings-row__label-text">
          <span>{t.harnessVersionUpdate}</span>
        </div>
      </div>
      <div className="adl-settings-row__control">
        {mode === 'install' && hasLatest && !catalogFailed ? (
          <span className="adl-harness-version__hint">
            {hasUpdate ? t.harnessVersionHasUpdate : t.harnessVersionNoUpdate}
          </span>
        ) : null}
        <button
          type="button"
          className="adl-harness-version__action-btn"
          disabled={disabled}
          onClick={mode === 'check' ? onCheck : onInstall}
        >
          {mode === 'check' ? t.harnessVersionUpdate : t.harnessVersionUpdateAction}
        </button>
      </div>
    </div>
  );
}
