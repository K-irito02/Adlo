import { useMemo } from 'react';
import type { IpcResult } from '@shared/ipc/dsh';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { useAppActions } from '@hooks/useAppActions';
import { HarnessVersionCard, type HarnessVersionSlotContext } from '../harness/HarnessVersionCard';
import type { HarnessVersionResult } from '../harness/harnessVersionBridge';
import type { OpencodeBridge, OpencodeSourceStatus } from '../../../shared/ipc/opencode';
import { createOpencodeVersionBridge } from './opencodeVersionBridge';

function toResult(result: IpcResult<unknown>): HarnessVersionResult {
  return result.ok ? { ok: true } : { ok: false, error: result.error.message };
}

/**
 * OpenCode 组专属内容：终端可用性开关与说明。
 *
 * 版本状态与操作由通用版本卡片经适配器注入；这里只保留 OpenCode 独有的
 * 「新终端会话可用」语义（PATH 注入由服务端在新会话创建时完成）。
 */
function TerminalInjectionRows({
  bridge,
  source,
  disabled,
  run,
}: {
  bridge: OpencodeBridge | undefined;
  source: OpencodeSourceStatus | null;
  disabled: boolean;
  run: HarnessVersionSlotContext<OpencodeSourceStatus>['run'];
}) {
  const { t } = useTCopy();
  return (
    <>
      <div className="adl-settings-row">
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <span>{t.opencodeTerminalInjection}</span>
          </div>
        </div>
        <div className="adl-settings-row__control">
          <input
            type="checkbox"
            checked={source?.terminalInjection ?? true}
            disabled={disabled || !bridge}
            onChange={(event) => {
              const enabled = event.target.checked;
              void run(
                async () =>
                  bridge ? toResult(await bridge.setTerminalInjection(enabled)) : { ok: false },
                t.opencodeTerminalInjectionSaved,
              );
            }}
          />
        </div>
      </div>
      <div className="adl-settings-row">
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <span>{t.opencodeTerminalNote}</span>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * 「OpenCode CLI」设置组：通用版本卡片 + OpenCode 专属插槽。
 *
 * 与 DSH 组共享同一套后端版本内核（`adl_harness_version`），但没有运行态
 * （无端口/标签/auth）；安装产物是自包含 exe，终端 PATH 注入由服务端在
 * 新会话创建时完成。
 */
export function OpencodeSettings() {
  const { t } = useTCopy();
  const showToast = useAppStore((s) => s.showToast);
  const actions = useAppActions();
  const rawBridge = typeof window !== 'undefined' ? window.digitalLife?.opencode : undefined;

  const bridge = useMemo(
    () =>
      createOpencodeVersionBridge({
        bridge: rawBridge,
        toolName: t.settingsOpencode,
        testSource: actions.testSource,
        saveSourceConfig: actions.saveSourceConfig,
        notify: (message, tone) => {
          showToast(message, tone);
        },
      }),
    [rawBridge, t.settingsOpencode, actions.testSource, actions.saveSourceConfig, showToast],
  );

  return (
    <div
      className="adl-settings-section adl-opencode-settings"
      data-settings-anchor="settings-opencode-version"
    >
      <HarnessVersionCard
        bridge={bridge}
        slots={{
          headerHint: t.opencodeVersionHint,
          sourceHint: t.opencodeSourceHint,
          sourceFooter: ({ sourceExtra, disabled, run }) => (
            <TerminalInjectionRows
              bridge={rawBridge}
              source={sourceExtra}
              disabled={disabled}
              run={run}
            />
          ),
        }}
      />
    </div>
  );
}
