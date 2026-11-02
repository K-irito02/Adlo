import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { useAppStore } from '@stores/slicedStore';
import { useAppActions } from '@hooks/useAppActions';
import { openUrlByMethod } from '@features/preview/openByMethod';
import { ConfirmDialog } from '@components/ConfirmDialog';
import {
  EnvDepRow,
  OPERABLE_DEPS,
  isEnvDepReady,
  type EnvDepKey,
  type EnvDepRowActions,
} from './EnvDepRow';
import { ENV_READY_TOTAL, countEnvReadyDeps, copyTextToClipboard } from './EnvironmentSettings';
import { buildAgentDiagnostic } from './diagnostic';
import { envDepLabel } from './depLabels';

export type EnvWizardStep = 'welcome' | 'detecting' | 'items' | 'done';

/** 向导逐项卡片顺序（与设置组七行同序，单文件常量，不复刻行逻辑）。 */
const WIZARD_DEPS: EnvDepKey[] = ['node', 'git', 'bash', 'webview2', 'adlserver', 'net', 'model'];

export interface EnvWizardProps {
  /** 关闭覆盖层（App 侧独立 showEnvWizard state；flag 落盘由向导内部负责）。 */
  onClose: () => void;
}

/**
 * 首启环境向导（Task 8）：四步（欢迎→检测中→逐项卡片→完成），全屏 overlay。
 *
 * - 触发条件由 App 侧串行自检后判定（`!envWizardDone`）；全就绪时返回 null。
 * - 跳过/完成恒可点（可跳过哲学）：跳过记 `skippedAt`（设置组置顶 resume 横幅），
 *   完成只记 `done`；未就绪项仅提示，不阻塞进入。
 * - 断网降级由 `EnvDepRow` 行内承担（安装→复制），向导不重复实现。
 * - 浏览器模式同样展示（检测 + 引导）：行内 `browserGated` 置灰变更类控件。
 */
export function EnvWizard({ onClose }: EnvWizardProps) {
  const { t, locale } = useTCopy();
  const actions = useAppActions();
  const envWizardDone = useAppStore((s) => s.envWizardDone);
  const status = useAppStore((s) => s.envStatus);
  const envBusy = useAppStore((s) => s.envBusy);
  const isTauri = useAppStore((s) => s.isTauri);
  const appInfo = useAppStore((s) => s.appInfo);
  const setActiveSettingsGroup = useAppStore((s) => s.setActiveSettingsGroup);
  const setEnvWizardDone = useAppStore((s) => s.setEnvWizardDone);
  const setEnvWizardSkippedAt = useAppStore((s) => s.setEnvWizardSkippedAt);
  const showToast = useAppStore((s) => s.showToast);

  const [step, setStep] = useState<EnvWizardStep>('welcome');
  const [installConfirmDep, setInstallConfirmDep] = useState<string | null>(null);

  // detecting 步：单次拉取全量状态，落盘后进逐项卡片（失败也进，items 空态兜底重测）。
  // 仅订阅所用的稳定函数（useShallow 下 actions 对象已稳定，解构后依赖更窄，
  // actions 引用若未来变不稳定也不会触发重复拉取）。
  const { fetchEnvStatus } = actions;
  useEffect(() => {
    if (step !== 'detecting') {
      return;
    }
    let cancelled = false;
    void fetchEnvStatus().finally(() => {
      if (!cancelled) {
        setStep('items');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [step, fetchEnvStatus]);

  const handleSkip = useCallback(() => {
    setEnvWizardDone(true);
    setEnvWizardSkippedAt(Date.now());
    onClose();
  }, [setEnvWizardDone, setEnvWizardSkippedAt, onClose]);

  const handleFinish = useCallback(() => {
    setEnvWizardDone(true);
    // 跳过→继续→完成：清掉 skippedAt，设置组 resume 横幅不再认领。
    setEnvWizardSkippedAt(null);
    onClose();
  }, [setEnvWizardDone, setEnvWizardSkippedAt, onClose]);

  const handleInstallConfirm = useCallback(() => {
    const dep = installConfirmDep;
    setInstallConfirmDep(null);
    if (dep === null) {
      return;
    }
    showToast(formatT(t, 'environmentInstallStarted', { dep: envDepLabel(t, dep) }), 'success');
    void actions.installEnvDep(dep);
  }, [installConfirmDep, showToast, t, actions]);

  const copyForAgent = useCallback(
    async (dep: EnvDepKey | 'all'): Promise<boolean> => {
      if (status === null) {
        return false;
      }
      const text = buildAgentDiagnostic(dep, status, {
        t,
        appVersion: appInfo?.version ?? '',
        bridge: isTauri ? 'tauri' : 'browser',
        locale,
        copiedAt: new Date().toISOString(),
        userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
      });
      const ok = await copyTextToClipboard(text);
      showToast(ok ? t.copySuccessClipboard : t.operationFailed, ok ? 'success' : 'error');
      return ok;
    },
    [status, appInfo, isTauri, locale, showToast, t],
  );

  const rowActions: EnvDepRowActions = {
    selectSource: (dep, mode) => actions.selectEnvSource(dep, mode),
    requestInstall: (dep) => setInstallConfirmDep(dep),
    uninstall: (dep, version) => actions.uninstallEnvDep(dep, version),
    reinstall: (dep, version) => actions.installEnvDep(dep, version),
    setCustomPath: (dep, path) => actions.setEnvCustomPath(dep, path),
    copyForAgent,
    goGroup: (group) => setActiveSettingsGroup(group),
    openExternal: (url) => openUrlByMethod(url),
  };

  // 完成/跳过后由 App 侧隐藏；全就绪无需打扰，直接不渲染。
  if (envWizardDone) {
    return null;
  }
  if (status !== null && countEnvReadyDeps(status) >= ENV_READY_TOTAL) {
    return null;
  }

  const readyCount = status === null ? 0 : countEnvReadyDeps(status);
  const nodeReady = status !== null && isEnvDepReady(status.node);
  // 指定路径入口：仅对未就绪的可操作依赖保留跳设置组链接。
  const unmetOperable = OPERABLE_DEPS.filter(
    (dep) => status !== undefined && status !== null && !isEnvDepReady(status[dep]),
  );

  const title =
    step === 'welcome'
      ? t.environmentWizardWelcome
      : step === 'detecting'
        ? t.environmentWizardDetecting
        : step === 'items'
          ? t.environmentTitle
          : formatT(t, 'environmentAggregateReady', {
              ready: readyCount,
              total: ENV_READY_TOTAL,
            });

  const goManualPath = () => {
    // 关闭即视为本向导会话结束（落盘 done）；resume 复用 nonce 重新打开，
    // 不依赖 done 的 false→false 变化。浏览器模式下指定路径输入可用，链接保留。
    setEnvWizardDone(true);
    setActiveSettingsGroup('environment');
    onClose();
  };

  const goDshGroup = () => {
    setActiveSettingsGroup('dsh');
    handleFinish();
  };

  return createPortal(
    <div
      className="adl-confirm-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="env-wizard"
    >
      <div className="adl-confirm-dialog adl-env-wizard" onClick={(e) => e.stopPropagation()}>
        <div className="adl-confirm-dialog__header">
          <h3 className="adl-confirm-dialog__title">{title}</h3>
        </div>
        <div className="adl-confirm-dialog__body">
          {step === 'welcome' ? (
            <p className="adl-confirm-dialog__message">{t.environmentDesc}</p>
          ) : null}
          {step === 'detecting' ? (
            <p className="adl-confirm-dialog__message" aria-live="polite" aria-busy="true">
              {t.environmentWizardDetecting}
            </p>
          ) : null}
          {step === 'items' ? (
            status === null ? (
              <p className="adl-confirm-dialog__message">{t.environmentLoading}</p>
            ) : (
              <div className="adl-env-wizard__list">
                {WIZARD_DEPS.map((dep) => (
                  <div key={dep}>
                    <EnvDepRow
                      dep={dep}
                      status={status}
                      busy={envBusy}
                      isTauri={isTauri}
                      actions={rowActions}
                      compact
                    />
                    {unmetOperable.includes(dep as (typeof OPERABLE_DEPS)[number]) ? (
                      <div className="adl-env-wizard__manual">
                        <button
                          type="button"
                          className="adl-dsh-settings__action-btn"
                          onClick={goManualPath}
                        >
                          {t.environmentGoToSettings}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )
          ) : null}
          {step === 'done' ? (
            <>
              <p className="adl-confirm-dialog__message">
                {formatT(t, 'environmentAggregateReady', {
                  ready: readyCount,
                  total: ENV_READY_TOTAL,
                })}
              </p>
              {nodeReady ? (
                <p className="adl-confirm-dialog__message">
                  {t.environmentDshCredentialNote}{' '}
                  <button
                    type="button"
                    className="adl-dsh-settings__action-btn"
                    onClick={goDshGroup}
                  >
                    {t.environmentGoToSettings}
                  </button>
                </p>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="adl-confirm-dialog__footer">
          {step === 'welcome' ? (
            <>
              <button
                type="button"
                className="adl-btn adl-btn--secondary"
                data-testid="env-wizard-skip"
                onClick={handleSkip}
              >
                {t.environmentWizardSkip}
              </button>
              <button type="button" className="adl-btn" onClick={() => setStep('detecting')}>
                {t.confirm}
              </button>
            </>
          ) : null}
          {step === 'detecting' ? (
            <button
              type="button"
              className="adl-btn adl-btn--secondary"
              data-testid="env-wizard-skip"
              onClick={handleSkip}
            >
              {t.environmentWizardSkip}
            </button>
          ) : null}
          {step === 'items' ? (
            <>
              <button
                type="button"
                className="adl-btn adl-btn--secondary"
                data-testid="env-wizard-skip"
                onClick={handleSkip}
              >
                {t.environmentWizardSkip}
              </button>
              <button
                type="button"
                className="adl-btn adl-btn--secondary"
                disabled={envBusy}
                onClick={() => {
                  void actions.recheckEnv();
                }}
              >
                {t.environmentRecheck}
              </button>
              <button type="button" className="adl-btn" onClick={() => setStep('done')}>
                {t.confirm}
              </button>
            </>
          ) : null}
          {step === 'done' ? (
            <button type="button" className="adl-btn" onClick={handleFinish}>
              {t.environmentWizardEnter}
            </button>
          ) : null}
        </div>
      </div>
      <ConfirmDialog
        open={installConfirmDep !== null}
        title={formatT(t, 'environmentInstallConfirmTitle', {
          dep: installConfirmDep === null ? '' : envDepLabel(t, installConfirmDep),
        })}
        message={formatT(t, 'environmentInstallConfirmMessage', {
          dep: installConfirmDep === null ? '' : envDepLabel(t, installConfirmDep),
        })}
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        onConfirm={handleInstallConfirm}
        onCancel={() => setInstallConfirmDep(null)}
      />
    </div>,
    document.body,
  );
}
