import { useAppStore } from '../stores/slicedStore';
import { useTCopy } from '../i18n';

/** 模拟报错样本：多样 code + 长 message，便于观察换行/截断/折叠态 */
const SAMPLE_ERRORS: { code: string; detail: string }[] = [
  {
    code: 'WORKSPACE_ERROR',
    detail: 'Workspace error: fatal: not a git repository (or any of the parent directories): .git',
  },
  {
    code: 'STORAGE_ERROR',
    detail: 'Storage error: failed to write session state to sqlite database: database is locked',
  },
  {
    code: 'NOT_FOUND',
    detail: 'Not found: src/app/features/unknown/path/very/long/component-name-that-wraps.tsx',
  },
  {
    code: 'NETWORK_ERROR',
    detail: 'Network error: request timed out after 30000ms while waiting for provider response',
  },
  {
    code: 'MODEL_ERROR',
    detail: 'Model error: provider returned HTTP 429 rate limit exceeded, retry after 60s',
  },
  {
    code: 'CONFIG_ERROR',
    detail: 'Config error: malformed JSON at line 12 column 5 in agent config file',
  },
  {
    code: 'TERMINAL_ERROR',
    detail: 'Terminal error: failed to spawn shell process with exit code 1: command not found',
  },
];

/** 开发模式测试按钮（import.meta.env.DEV 时挂载，生产构建剔除） */
export function DevErrorTestButtons() {
  const { t } = useTCopy();
  const reportError = useAppStore((s) => s.reportError);

  const pushOne = () => {
    const index = useAppStore.getState().errorToasts.length % SAMPLE_ERRORS.length;
    const sample = SAMPLE_ERRORS[index];
    reportError(sample.code, sample.detail);
  };

  const pushBatch = () => {
    for (const sample of SAMPLE_ERRORS) {
      reportError(sample.code, sample.detail);
    }
  };

  return (
    <div className="dev-error-buttons">
      <button type="button" onClick={pushOne}>
        {t.errorsInjectOne}
      </button>
      <button type="button" onClick={pushBatch}>
        {t.errorsInjectBatch}
      </button>
    </div>
  );
}
