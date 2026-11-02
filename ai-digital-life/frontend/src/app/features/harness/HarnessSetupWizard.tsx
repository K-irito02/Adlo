import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import type { DshVersionStatus, DshVersionTask } from '../../../shared/ipc';

export const HARNESS_WIZARD_DONE_KEY = 'adl.harnessWizardDone';

type Kind = 'dsh' | 'opencode';

interface HarnessState {
  dsh: DshVersionStatus | null;
  opencode: DshVersionStatus | null;
}

const EMPTY_TASKS: Record<Kind, DshVersionTask | null> = { dsh: null, opencode: null };

/**
 * harness 首启向导（独立 overlay）：在环境向导完成或跳过后弹一次。
 *
 * - 只提示「未安装」的 harness；两者都已装则自动关闭并落盘完成标记。
 * - 安装是显式点击（与 Node/Git 行一致），失败不阻塞应用使用；可跳过，跳过同样落盘。
 * - 下载源自动检测由后端安装链路承担（`source_mode=auto` 时才自动选源）。
 */
export function HarnessSetupWizard({ onClose }: { onClose: () => void }) {
  const { t } = useTCopy();
  const showToast = useAppStore((s) => s.showToast);
  const dshBridge = typeof window !== 'undefined' ? window.digitalLife?.dsh : undefined;
  const opencodeBridge = typeof window !== 'undefined' ? window.digitalLife?.opencode : undefined;

  const [state, setState] = useState<HarnessState>({ dsh: null, opencode: null });
  const [tasks, setTasks] = useState<Record<Kind, DshVersionTask | null>>(EMPTY_TASKS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Kind | null>(null);

  const markDone = useCallback(() => {
    try {
      localStorage.setItem(HARNESS_WIZARD_DONE_KEY, '1');
    } catch {
      // 隐私模式/配额失败不应阻塞关闭。
    }
    onClose();
  }, [onClose]);

  const refresh = useCallback(async () => {
    const [dsh, opencode] = await Promise.all([
      dshBridge ? dshBridge.getVersionStatus() : Promise.resolve(null),
      opencodeBridge ? opencodeBridge.getVersionStatus() : Promise.resolve(null),
    ]);
    const next: HarnessState = {
      dsh: dsh && dsh.ok ? dsh.data : null,
      opencode: opencode && opencode.ok ? opencode.data : null,
    };
    setState(next);
    setLoading(false);
    const dshReady = (next.dsh?.installed.length ?? 0) > 0;
    const opencodeReady = (next.opencode?.installed.length ?? 0) > 0;
    if (dshReady && opencodeReady) {
      markDone();
    }
  }, [dshBridge, opencodeBridge, markDone]);

  useEffect(() => {
    void refresh();
    // 仅首挂载拉一次；后续由安装动作刷新。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!busy) {
      return;
    }
    const bridge = busy === 'dsh' ? dshBridge : opencodeBridge;
    if (!bridge) {
      return;
    }
    const id = setInterval(() => {
      void bridge.getVersionTask().then((r) => {
        if (r.ok) {
          setTasks((prev) => ({ ...prev, [busy]: r.data.task }));
        }
      });
    }, 800);
    return () => clearInterval(id);
  }, [busy, dshBridge, opencodeBridge]);

  const install = useCallback(
    (kind: Kind) => {
      const bridge = kind === 'dsh' ? dshBridge : opencodeBridge;
      if (!bridge || busy) {
        return;
      }
      setBusy(kind);
      setTasks((prev) => ({ ...prev, [kind]: null }));
      void bridge.update().then((r) => {
        setBusy(null);
        setTasks((prev) => ({ ...prev, [kind]: null }));
        if (!r.ok) {
          showToast(r.error.message || t.harnessWizardFailed, 'error');
        }
        void refresh();
      });
    },
    [busy, dshBridge, opencodeBridge, refresh, showToast, t],
  );

  const dshInstalled = (state.dsh?.installed.length ?? 0) > 0;
  const opencodeInstalled = (state.opencode?.installed.length ?? 0) > 0;

  if (loading) {
    return createPortal(
      <div className="adl-confirm-overlay" role="dialog" aria-modal="true" aria-busy="true">
        <div className="adl-confirm-dialog adl-env-wizard">
          <div className="adl-confirm-dialog__body">
            <p className="adl-confirm-dialog__message">{t.harnessWizardDetecting}</p>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  const rows: { kind: Kind; label: string; installed: boolean }[] = [
    { kind: 'dsh', label: t.harnessWizardDsh, installed: dshInstalled },
    { kind: 'opencode', label: t.harnessWizardOpencode, installed: opencodeInstalled },
  ];

  return createPortal(
    <div
      className="adl-confirm-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t.harnessWizardTitle}
      data-testid="harness-wizard"
    >
      <div className="adl-confirm-dialog adl-env-wizard" onClick={(e) => e.stopPropagation()}>
        <div className="adl-confirm-dialog__header">
          <h3 className="adl-confirm-dialog__title">{t.harnessWizardTitle}</h3>
        </div>
        <div className="adl-confirm-dialog__body">
          <p className="adl-confirm-dialog__message">{t.harnessWizardDesc}</p>
          <div className="adl-env-wizard__list">
            {rows.map((row) => (
              <div className="adl-settings-card" key={row.kind}>
                <div className="adl-settings-row">
                  <div className="adl-settings-row__label">
                    <div className="adl-settings-row__label-text">
                      <span>{row.label}</span>
                    </div>
                  </div>
                  <div className="adl-settings-row__control">
                    <span>{row.installed ? t.harnessWizardInstalled : t.harnessWizardMissing}</span>
                    {row.installed ? null : (
                      <button
                        type="button"
                        className="adl-dsh-settings__action-btn"
                        disabled={busy !== null}
                        onClick={() => install(row.kind)}
                      >
                        {busy === row.kind ? t.harnessWizardInstalling : t.harnessWizardInstall}
                      </button>
                    )}
                  </div>
                </div>
                {busy === row.kind && tasks[row.kind] ? (
                  <div className="adl-settings-row">
                    <div className="adl-settings-row__control">
                      <span>
                        {tasks[row.kind]?.percent === null ? '—' : `${tasks[row.kind]?.percent}%`}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          {dshInstalled || !state.dsh ? null : (
            <p className="adl-confirm-dialog__message">{t.harnessWizardNodeHint}</p>
          )}
          <p className="adl-confirm-dialog__message">{t.harnessWizardNonBlocking}</p>
        </div>
        <div className="adl-confirm-dialog__actions">
          <button
            type="button"
            className="adl-dsh-settings__action-btn"
            data-testid="harness-wizard-skip"
            onClick={markDone}
          >
            {t.harnessWizardSkip}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
