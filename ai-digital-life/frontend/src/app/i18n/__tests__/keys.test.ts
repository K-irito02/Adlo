import { describe, it, expect } from 'vitest';
import { enUS } from '../en-US/index';
import { zhCN } from '../zh-CN/index';

describe('i18n en-US namespace keys', () => {
  it('has a non-empty merged enUS export', () => {
    const keys = Object.keys(enUS);
    expect(keys.length).toBeGreaterThan(0);
  });

  it('includes common domain keys', () => {
    expect(enUS).toHaveProperty('landingTitle');
    expect(enUS).toHaveProperty('loading');
  });

  it('includes workspace domain keys', () => {
    expect(enUS).toHaveProperty('projects');
  });

  it('includes terminal domain keys', () => {
    expect(enUS).toHaveProperty('commandBinary');
  });

  it('includes file domain keys', () => {
    expect(enUS).toHaveProperty('filePreview');
  });

  it('includes changes domain keys', () => {
    expect(enUS).toHaveProperty('patchPreview');
  });

  it('includes browser domain keys', () => {
    expect(enUS).toHaveProperty('browserAddress');
  });

  it('includes menu domain keys', () => {
    expect(enUS).toHaveProperty('menuFile');
  });

  it('includes models domain keys', () => {
    expect(enUS).toHaveProperty('modelLabel');
  });

  it('includes approval domain keys', () => {
    expect(enUS).toHaveProperty('approvals');
  });

  it('includes webSearch domain keys', () => {
    expect(enUS).toHaveProperty('webFetchPlaceholder');
  });

  it('includes lsp domain keys', () => {
    expect(enUS).toHaveProperty('lspTitle');
  });

  it('includes reference domain keys', () => {
    expect(enUS).toHaveProperty('referenceManagerTitle');
  });

  it('includes customAgent domain keys', () => {
    expect(enUS).toHaveProperty('customAgentManagerName');
  });

  it('includes durable domain keys', () => {
    expect(enUS).toHaveProperty('durableSessionRunning');
  });

  it('includes settings domain keys', () => {
    expect(enUS).toHaveProperty('settingsTitle');
  });

  it('includes the tree-cache settings keys in both locales', () => {
    const keys = [
      'treeCacheStatsLabel',
      'treeCacheEnabledHint',
      'treeCacheDisableTitle',
      'treeCacheDisableConfirm',
      'treeCacheDisableConfirmBtn',
      'treeCacheTtlCustom',
      'treeCacheTtlUnitLabel',
      'treeCacheUnitSecond',
      'treeCacheUnitMinute',
      'treeCacheUnitHour',
      'treeCacheUnitDay',
    ] as const;
    for (const key of keys) {
      expect((enUS as Record<string, unknown>)[key], `en:${key}`).toBeTruthy();
      expect((zhCN as Record<string, unknown>)[key], `zh:${key}`).toBeTruthy();
    }
    // 插值占位符两侧一致。
    expect(String(enUS.treeCacheTtlMinutes)).toContain('{minutes}');
    expect(String(zhCN.treeCacheTtlMinutes)).toContain('{minutes}');
  });

  it('includes reset-all confirm title (message key retired) in both locales', () => {
    expect(enUS.settingsResetConfirmTitle).toBe('Reset all to defaults?');
    expect(zhCN.settingsResetConfirmTitle).toBe('恢复全部默认？');
    // 通用确认框恒用组模板（Finding 4）：裸「恢复全部」消息键已删除，两语均不得再暴露。
    expect(enUS).not.toHaveProperty('settingsResetConfirmMessage');
    expect(zhCN).not.toHaveProperty('settingsResetConfirmMessage');
  });

  it('includes session-lock and offline badge copy in both locales (Phase 4)', () => {
    // "key→真实文案"链路钉死：面板单测的 t 替身只回显 key，本用例覆盖真实文案。
    expect(zhCN.settingsSessionOverrideTakesEffectOnRestart).toContain('下次启动生效');
    expect(enUS.settingsSessionOverrideTakesEffectOnRestart).toContain('next launch');
    expect(zhCN.settingsBackendOfflineBadge).toBe('未连接后端');
    expect(enUS.settingsBackendOfflineBadge).toBe('Backend unreachable');
  });

  it('retires reset-all group-list copy except the preferences label', () => {
    expect(enUS.settingsResetAllDoneAll).toBe('All default settings restored');
    expect(zhCN.settingsResetAllDoneAll).toBe('已恢复全部默认设置');
    // 分组清单已删（仅 ScopePreferences 作为 preferences 组展示名保留）：其余 7 键不再暴露。
    for (const key of [
      'settingsResetAllScopeIntro',
      'settingsResetAllScopeBrowser',
      'settingsResetAllScopeDsh',
      'settingsResetAllScopeStorage',
      'settingsResetAllStorageCompute',
      'settingsResetAllStorageSkipped',
      'settingsResetAllStorageUnavailable',
    ] as const) {
      expect(enUS, `en:${key}`).not.toHaveProperty(key);
      expect(zhCN, `zh:${key}`).not.toHaveProperty(key);
    }
  });

  it('includes reset-all confirm/progress keys in both locales', () => {
    const keys = [
      'settingsResetAllScopePreferences',
      'settingsResetAllConfirmMessage',
      'settingsResetAllProgress',
      'settingsResetAllFailedSummary',
      'settingsResetAllFailedSummaryNoDone',
      'settingsResetAllSkippedNote',
      'settingsResetAllDoneAll',
    ] as const;
    for (const key of keys) {
      expect((enUS as Record<string, unknown>)[key], `en:${key}`).toBeTruthy();
      expect((zhCN as Record<string, unknown>)[key], `zh:${key}`).toBeTruthy();
    }
    // 聚合确认框通用文案（分组清单已删，此句为 body 唯一说明）：双语值锁定。
    expect(String(enUS.settingsResetAllConfirmMessage)).toBe(
      'All settings will be restored to defaults. This cannot be undone.',
    );
    expect(String(zhCN.settingsResetAllConfirmMessage)).toBe(
      '所有设置将恢复为默认值，此操作不可撤销。',
    );
    // 唯一幸存的 scope 键（preferences 组展示名，进度文案与失败汇总共用）：双语值锁定，防静默漂移。
    expect(String(enUS.settingsResetAllScopePreferences)).toBe('General, workspace and shortcuts');
    expect(String(zhCN.settingsResetAllScopePreferences)).toBe('通用、工作区与快捷键');
    // 插值占位符两侧一致（失败摘要用人类可读的 {reason}，不得回落到内部步骤码）。
    expect(String(enUS.settingsResetAllFailedSummary)).toBe(
      'Reset: {done}; failed: {group} ({reason})',
    );
    expect(String(zhCN.settingsResetAllFailedSummary)).toBe(
      '已恢复：{done}；失败：{group}（{reason}）',
    );
    // 「无已完成组」变体：仅含 {group}/{reason}，首组失败时不渲染残缺的 {done}。
    expect(String(enUS.settingsResetAllFailedSummaryNoDone)).toBe('Failed: {group} ({reason})');
    expect(String(zhCN.settingsResetAllFailedSummaryNoDone)).toBe('失败：{group}（{reason}）');
    expect(String(enUS.settingsResetAllProgress)).toContain('{group}');
    expect(String(zhCN.settingsResetAllProgress)).toContain('{group}');
    expect(String(enUS.settingsResetAllSkippedNote)).toContain('{groups}');
    expect(String(zhCN.settingsResetAllSkippedNote)).toContain('{groups}');
  });

  it('does not add unused search-only reset keys (group label / no-results reuse)', () => {
    // R4: 分组标题复用 SETTINGS_GROUPS[].labelKey，无需 settingsSearchGroupLabel。
    expect(enUS).not.toHaveProperty('settingsSearchGroupLabel');
    expect(zhCN).not.toHaveProperty('settingsSearchGroupLabel');
    // R11: 无结果空态复用既有 settings 作用域键 settingsNoResults，不新增 settingsSearchNoResults。
    expect(enUS).not.toHaveProperty('settingsSearchNoResults');
    expect(zhCN).not.toHaveProperty('settingsSearchNoResults');
    expect(enUS.settingsNoResults).toBe('No matching settings');
    expect(zhCN.settingsNoResults).toBe('无匹配设置项');
  });

  it('no longer exposes the legacy settingsModels or settingsProviders keys', () => {
    expect(enUS).not.toHaveProperty('settingsModels');
    expect(enUS).not.toHaveProperty('settingsModelsDesc');
    expect(enUS).not.toHaveProperty('settingsProviders');
    expect(enUS).not.toHaveProperty('settingsProvidersDesc');
    expect(zhCN).not.toHaveProperty('settingsModels');
    expect(zhCN).not.toHaveProperty('settingsModelsDesc');
    expect(zhCN).not.toHaveProperty('settingsProviders');
    expect(zhCN).not.toHaveProperty('settingsProvidersDesc');
  });

  it('includes notification domain keys', () => {
    expect(enUS).toHaveProperty('notifTitle');
  });

  it('includes error toast domain keys', () => {
    expect(enUS).toHaveProperty('errorsGenericTitle');
    expect(enUS).toHaveProperty('errorsWorkspace');
    expect(enUS).toHaveProperty('errorsInfo');
    expect(enUS).toHaveProperty('errorsMore');
    expect(enUS).toHaveProperty('errorsClearAll');
    expect(enUS).toHaveProperty('errorsRegionLabel');
    expect(zhCN).toHaveProperty('errorsGenericTitle');
    expect(zhCN).toHaveProperty('errorsWorkspace');
    expect(zhCN).toHaveProperty('errorsInfo');
    expect(zhCN).toHaveProperty('errorsClearAll');
    expect(zhCN).toHaveProperty('errorsRegionLabel');
  });

  it('browserClearAllOpenTabs copy is close-all-open-tabs', () => {
    expect(enUS.browserClearAllOpenTabs).toBe('Close all open tabs');
    expect(zhCN.browserClearAllOpenTabs).toBe('关闭所有已打开标签页');
  });

  it('includes browser settings group/block reset keys in both locales', () => {
    const keys = [
      // 挂起块：自定义时长 + 单位
      'browserSettingsSuspendCustom',
      'browserSettingsSuspendUnitLabel',
      'browserSettingsSuspendUnitSecond',
      'browserSettingsSuspendUnitMinute',
      'browserSettingsSuspendUnitHour',
      'browserSettingsSuspendUnitDay',
      // 下载模式块：合并后的单句描述
      'browserDownloadSettingsModeHint',
      // 组级恢复自有确认对话框
      'browserGroupResetTitle',
      'browserGroupResetMessage',
      'browserGroupResetMigrateOnNote',
    ] as const;
    for (const key of keys) {
      expect((enUS as Record<string, unknown>)[key], `en:${key}`).toBeTruthy();
      expect((zhCN as Record<string, unknown>)[key], `zh:${key}`).toBeTruthy();
    }
    // 迁移附注仅在开框时开关为开追加展示（内容含搬运语义）。
    expect(String(zhCN.browserGroupResetMigrateOnNote)).toContain('自动迁移');
    expect(String(enUS.browserGroupResetMigrateOnNote)).toMatch(/migrat/i);
  });

  it('no longer exposes the merged-away download description keys', () => {
    for (const key of ['browserDownloadSettingsDesc', 'browserDownloadSettingsModeDesc']) {
      expect(enUS, `en:${key}`).not.toHaveProperty(key);
      expect(zhCN, `zh:${key}`).not.toHaveProperty(key);
    }
  });

  it('includes dsh settings group/block copy in both locales', () => {
    const keys = [
      // 下载源块：自动检测选项 + 副标题/提示
      'dshSettingsSourceAuto',
      'dshSettingsSourceDesc',
      'dshSettingsSourceHint',
      'dshSettingsCustomUrl',
      'dshSettingsCustomUrlDesc',
      // 代理块：副标题/提示（模式改名「代理模式」，手动改名「自定义」）
      'dshSettingsProxyDesc',
      'dshSettingsProxyHint',
      // 测试连接块：按钮文案 + 副标题/提示 + 自动检测反馈
      'dshSettingsTestLabel',
      'dshSettingsTestDesc',
      'dshSettingsTestHint',
      'dshSettingsTestButton',
      'dshSettingsTestErrorUnknown',
      'dshSettingsTestErrorRequestFailed',
      'dshSettingsTestErrorNetwork',
      'dshSettingsAutoDetected',
      'dshSettingsAutoDetectFailed',
      'dshSettingsSaveFailed',
    ] as const;
    for (const key of keys) {
      expect((enUS as Record<string, unknown>)[key], `en:${key}`).toBeTruthy();
      expect((zhCN as Record<string, unknown>)[key], `zh:${key}`).toBeTruthy();
    }
    // 改名与删除锁定：模式→代理模式、手动→自定义；保存按钮键随自动保存移除。
    expect(zhCN.dshSettingsProxyMode).toBe('代理模式');
    expect(zhCN.dshSettingsProxyModeManual).toBe('自定义');
    expect(enUS.dshSettingsProxyMode).toBe('Proxy Mode');
    expect(enUS.dshSettingsProxyModeManual).toBe('Custom');
    for (const key of ['dshSettingsSave', 'dshSettingsSaveSuccess']) {
      expect(enUS, `en:${key}`).not.toHaveProperty(key);
      expect(zhCN, `zh:${key}`).not.toHaveProperty(key);
    }
    // 插值占位符两侧一致。
    expect(String(enUS.dshSettingsAutoDetected)).toContain('{source}');
    expect(String(zhCN.dshSettingsAutoDetected)).toContain('{source}');
    expect(String(enUS.dshSettingsTestSuccess)).toContain('{latency}');
    expect(String(zhCN.dshSettingsTestSuccess)).toContain('{latency}');
    expect(String(enUS.dshSettingsTestFailed)).toContain('{error}');
    expect(String(zhCN.dshSettingsTestFailed)).toContain('{error}');
  });

  it('uses the shorter suspend/path block titles in both locales', () => {
    expect(zhCN.browserSettingsSuspendTitle).toBe('标签挂起时长');
    expect(enUS.browserSettingsSuspendTitle).toBe('Suspend tabs after');
    expect(zhCN.storageBrowserDownloadTitle).toBe('浏览器下载路径');
    expect(enUS.storageBrowserDownloadTitle).toBe('Browser download folder');
  });

  it('includes the dsh version block + generic card copy in both locales', () => {
    const keys = [
      // 组块头 + 通用卡片行（DSH 适配器注入的文案）。
      'dshVersionManagement',
      'dshCurrentVersionNone',
      'dshCurrentVersionHint',
      'dshInstallSuccess',
      'dshInstallFailed',
      'dshVersionUnknown',
      'dshVersionStateReading',
      'dshVersionStateFailed',
      'dshOfficialStableHint',
      'dshPrereleaseHint',
      'dshOfficialLinksLabel',
      'dshOfficialLinksDesc',
      'dshNpmPage',
      'dshGithubReleases',
      'dshVersionSourceDesc',
      'dshVersionSourceHint',
      'dshVersionSourceAuto',
      'dshVersionSourceSystem',
      'dshVersionSourceHost',
      'dshVersionSourceSystemDialogTitle',
      'dshVersionSourceSystemDialogMessage',
      'dshVersionSourceSwitchDialogTitle',
      'dshVersionSourceSwitchDialogMessage',
      'dshVersionSourceApplyNextLaunch',
      'dshVersionSourceApplyNow',
      'dshVersionSourceNextLaunchSaved',
      'dshVersionSourceSwitched',
      'dshVersionSourceDeferredNote',
      'dshSystemMissing',
      'dshSystemManagedNote',
      'dshNoSourceHostNote',
      'dshNoSourceAutoNote',
      'dshVersionSourceSwitchDialogEmpty',
      'dshVersionSourceSwitchDialogFromEmpty',
      // DSH 组版本管理块底部摘要行：当前下载源 + 模式提示（直角引号）+ 跳转按钮。
      'dshSourceSummaryTitle',
      'dshSourceSummary',
      'dshSourceSummaryMode',
      'dshSourceSummaryManual',
      'dshSourceSummaryUnknown',
      'dshSourceSummaryGoModify',
      'dshVersionCancelFailed',
      'dshSwitchedOnly',
      'dshReinstalledOnly',
      'dshOpenNoVersion',
      'dshVersionBusyRetry',
      'dshInstalledRestarted',
      'dshSwitchedRestarted',
      'dshReinstalledRestarted',
      'dshUninstalledSwitched',
      'dshUninstalledNoVersion',
      'dshRestartFailed',
      // 通用卡片由 DSH 适配器注入的工具术语与检查更新/任务文案（不得再次退役）。
      'dshOfficialStable',
      'dshPrereleaseTitle',
      'dshCheckUpdateFound',
      'dshCheckUpdateNoStable',
      'dshCheckUpdatePrerelease',
      'dshCheckUpdateFailed',
      'dshUninstallCurrentHint',
      'dshCancelInstall',
      'dshCancelUninstall',
      'dshCancelReinstall',
      'dshTaskStagePreparing',
      'dshTaskStageDownloading',
      'dshTaskStageInstalling',
      'dshTaskStageRemoving',
      'dshTaskStageFinalizing',
    ] as const;
    for (const key of keys) {
      expect((enUS as Record<string, unknown>)[key], `en:${key}`).toBeTruthy();
      expect((zhCN as Record<string, unknown>)[key], `zh:${key}`).toBeTruthy();
    }
    // 摘要行延迟字段退役（DshSourceStatus 无 latency，常驻“—”是劣质 UX）；
    // 标题 / 源链接 / 模式提示三段的占位符中英一致。
    expect(enUS, 'en:dshSourceSummaryLatencyMs').not.toHaveProperty('dshSourceSummaryLatencyMs');
    expect(zhCN, 'zh:dshSourceSummaryLatencyMs').not.toHaveProperty('dshSourceSummaryLatencyMs');
    expect(String(enUS.dshSourceSummary)).toContain('{registry}');
    expect(String(enUS.dshSourceSummary)).toContain('{title}');
    expect(String(zhCN.dshSourceSummary)).toContain('{registry}');
    expect(String(zhCN.dshSourceSummary)).toContain('{title}');
    expect(String(enUS.dshSourceSummaryMode)).toContain('{mode}');
    expect(String(zhCN.dshSourceSummaryMode)).toContain('{mode}');
  });

  it('keeps dsh placeholder counts identical across locales (no {taget}-style drift)', () => {
    const countOf = (text: unknown, placeholder: string) =>
      typeof text === 'string' ? text.split(placeholder).length - 1 : -1;
    // [key, placeholder, 期望出现次数]：中英必须同数，否则渲染残留占位符。
    const cases: [string, string, number][] = [
      ['dshVersionSourceSwitchDialogMessage', '{target}', 1],
      ['dshVersionSourceSystemDialogMessage', '{path}', 1],
      ['dshVersionSourceSwitchDialogEmpty', '{target}', 2],
      ['dshVersionSourceSwitchDialogFromEmpty', '{target}', 1],
      ['dshSourceSummary', '{registry}', 1],
      ['dshSourceSummary', '{title}', 1],
      ['dshSourceSummaryMode', '{mode}', 1],
    ];
    for (const [key, placeholder, expected] of cases) {
      const en = (enUS as Record<string, unknown>)[key];
      const zh = (zhCN as Record<string, unknown>)[key];
      expect(countOf(en, placeholder), `en:${key} ${placeholder}`).toBe(expected);
      expect(countOf(zh, placeholder), `zh:${key} ${placeholder}`).toBe(expected);
    }
  });

  it('retires the dsh close-dialog / legacy open-button copy (no consumers)', () => {
    // 关闭对话框已随 dsh 统一为普通浏览器标签而退役；旧打开按钮/欢迎空态亦无调用方。
    for (const key of [
      'dshOpenButton',
      'dshOpenButtonHint',
      'dshCloseDialogTitle',
      'dshCloseDialogDesc',
      'dshCloseKeep',
      'dshCloseKeepHint',
      'dshCloseTerminate',
      'dshCloseTerminateHint',
      'dshCloseCancel',
      'dshWelcomeEmpty',
      // 版本管理改版后退役的旧文案（含被 dshCurrentVersionNone 取代的系统版本状态）。
      'dshTitle',
      'dshVersion',
      'dshReinstallHint',
      'dshRestart',
      'dshOpenExternal',
      'dshLatestVersionLabel',
      'dshLatestVersionDesc',
      'dshStatusBundled',
      'dshStatusBundledNone',
      'dshStatusSystem',
      'dshStatusSystemNone',
      'dshStatusMirror',
      'dshStatusMirrorNone',
      'dshStatusRunning',
      // 2026-10-22：内置版本改为「版本号 + 内置徽章」，整句读数文案退役（不得复活）。
      'dshEffectiveBundled',
      // 2026-10-22：内置版本按普通版本卸载（确认只针对当前版本），专属提示文案退役。
      'dshUninstallBundledHint',
      // 2026-10-22：无可用来源提示按来源拆分为 host/auto 两条，旧通用文案退役（不得复活）。
      'dshNoSourceNote',
      // 2026-10-31：当前版本行收敛为「只显示版本号」——读数里的运行地址/来源副行
      // 与「最新版本：x.y.z」一并退役（更新信息只属于检查更新行，来源属于版本来源行）。
      'dshLatest',
      'dshEffectiveRunning',
      'dshEffectiveRunningSystem',
      'dshRunningExternalNote',
      'dshEffectiveSystem',
    ] as const) {
      expect(enUS, `en:${key}`).not.toHaveProperty(key);
      expect(zhCN, `zh:${key}`).not.toHaveProperty(key);
    }
  });

  it('retires the harness/opencode rows removed by the settings cleanup', () => {
    // 2026-10-31：删除系统安装位置行 / 指定版本行 / 未安装提示行 / 已安装版本独立卡，
    // 以及收敛为单值读数后不再使用的来源标签；这些键不得在此后复活。
    for (const key of [
      'harnessVersionSystemPath',
      'harnessVersionSystemNotDetected',
      'harnessVersionSystemVersionUnknown',
      'harnessVersionManual',
      'harnessVersionManualPlaceholder',
      'harnessVersionMissingBanner',
      'harnessVersionUpdateFoundStable',
      'harnessVersionUpdateFoundPrerelease',
      'harnessVersionEffectiveSource',
      'harnessVersionSwitch',
      'harnessVersionReinstall',
      'harnessVersionSourceNone',
      'opencodeManualVersion',
      'opencodeManualVersionDesc',
      'opencodeManualVersionHint',
      'opencodeSystemPathDesc',
      'opencodeSystemPathHint',
    ] as const) {
      expect(enUS, `en:${key}`).not.toHaveProperty(key);
      expect(zhCN, `zh:${key}`).not.toHaveProperty(key);
    }
  });

  it('retires the legacy dsh version-card keys (single generic card, ticket #5)', () => {
    // 旧 DSH 版本组件删除后，仅它使用的键必须同时从双语字典消失（不得复活）；
    // 通用卡片文案改由 `harnessVersion*` 域承载。
    // 例外（2026-10-29 用户明确要求恢复旧行文案）：`dshCheckUpdateDesc` /
    // `dshCheckUpdateHint` / `dshCurrentVersionDesc` / `dshOfficialStableDesc` /
    // `dshPrereleaseDesc` 已恢复，见下方单测。
    for (const key of [
      'dshHasUpdate',
      'dshNoUpdate',
      'dshCheckUpdate',
      'dshUpdate',
      'dshRevertedTo',
      'dshUninstall',
      'dshReinstall',
      'dshInstalledVersions',
      'dshCurrentVersionLabel',
      'dshCurrentVersionBadge',
      'dshVersionSource',
      'dshVersionCancelled',
      'dshVersionListUnknown',
      'dshOfficialStableEmpty',
      'dshPrereleaseUpdateAvailable',
      'dshOfficialPrereleaseEmpty',
      'dshReinstallVersion',
      'dshInstallAction',
      'dshSwitchToVersion',
    ] as const) {
      expect(enUS, `en:${key}`).not.toHaveProperty(key);
      expect(zhCN, `zh:${key}`).not.toHaveProperty(key);
    }
  });

  it('restores the old DSH row copy keys (user-approved 2026-10-29)', () => {
    // 旧四行（当前版本/检查更新/正式版本/预发布版本）的描述小字 + 检查更新 ? 提示：
    // 通用卡片按旧行结构渲染，双语必须同时存在。
    for (const key of [
      'dshCurrentVersionDesc',
      'dshCheckUpdateDesc',
      'dshCheckUpdateHint',
      'dshOfficialStableDesc',
      'dshPrereleaseDesc',
    ] as const) {
      expect(enUS, `en:${key}`).toHaveProperty(key);
      expect(zhCN, `zh:${key}`).toHaveProperty(key);
    }
  });

  it('includes the environment + network domains in both locales (Phase 2 Task 3)', () => {
    const keys = [
      // 环境域：组 labelKey（供 Task 4 注册）+ 组标题/副标题
      'settingsEnvironment',
      'environmentTitle',
      'environmentDesc',
      // 分组块头（环境组与其它组对齐：块头 + 卡；网络块已删除）
      'environmentBlockRuntime',
      'environmentBlockSystem',
      // 状态灯五态
      'environmentStatusReady',
      'environmentStatusNeedInstall',
      'environmentStatusNeedManual',
      'environmentStatusMissing',
      'environmentStatusTooOld',
      'environmentStatusDetected',
      // 来源四态（含指定路径）
      'environmentSourceAuto',
      'environmentSourceSystem',
      'environmentSourceHost',
      'environmentSourceCustom',
      // Bash 来源（系统 Git / WSL / MSYS2）
      'environmentBashGitBundled',
      'environmentBashWsl',
      'environmentBashMsys2',
      // 按钮行
      'environmentInstall',
      'environmentSwitch',
      'environmentUninstall',
      'environmentReinstall',
      'environmentRecheck',
      'environmentCopyForAgent',
      'environmentGoToSettings',
      // 引导
      'environmentWebview2DownloadPage',
      'environmentDshCredentialNote',
      // wizard 四键
      'environmentWizardWelcome',
      'environmentWizardDetecting',
      'environmentWizardSkip',
      'environmentWizardEnter',
      // wizard resume 横幅（Task 8：跳过记账后仍有未就绪项时置顶）
      'environmentWizardResumeBanner',
      'environmentWizardResume',
      // 安装 toast（Task 2 review 遗留：envActions 不再复用 dsh key）
      'environmentInstallStarted',
      'environmentInstallSuccess',
      'environmentInstallFailed',
      // 卸载失败（Task 3：轮询消费 task.error 后的专用文案）
      'environmentUninstallFailed',
      // 环境行组 UI（Task 7：五依赖行 + 聚合条 + 复制；重置已删，网络块已删）
      'environmentAggregateReady',
      'environmentCopyAllForAgent',
      'environmentCopyForAgentNote',
      'environmentDepNode',
      'environmentDepGit',
      'environmentDepBash',
      'environmentDepWebview2',
      'environmentDepAdlserver',
      'environmentDepNet',
      'environmentDepModel',
      'environmentDepNodeDesc',
      'environmentDepGitDesc',
      'environmentDepBashDesc',
      'environmentDepWebview2Desc',
      'environmentDepAdlserverDesc',
      'environmentDepNetDesc',
      'environmentDepModelDesc',
      'environmentFieldVersion',
      'environmentFieldPath',
      'environmentFieldSource',
      'environmentCustomPathLabel',
      'environmentCustomPathPlaceholder',
      'environmentNetRegistry',
      'environmentNetLatency',
      'environmentNetRegistryDown',
      'environmentNetModelApi',
      'environmentNetFollowDsh',
      'environmentCredentialAvailable',
      'environmentOfficialSite',
      'environmentInstallConfirmTitle',
      'environmentInstallConfirmMessage',
      'environmentLoading',
      'environmentTaskPhasePreparing',
      'environmentTaskPhaseInstalling',
      'environmentTaskPhaseRemoving',
      'environmentTaskPhaseFinalizing',
      // 网络域：仅组 labelKey（块内文案复用 dsh.* 旧 key）。
      'settingsNetwork',
    ] as const;
    for (const key of keys) {
      expect((enUS as Record<string, unknown>)[key], `en:${key}`).toBeTruthy();
      expect((zhCN as Record<string, unknown>)[key], `zh:${key}`).toBeTruthy();
    }
    // 插值占位符两侧一致（install 文案带 {dep}，成功另带 {version}）。
    for (const key of [
      'environmentInstallStarted',
      'environmentInstallFailed',
      'environmentInstallConfirmTitle',
      'environmentInstallConfirmMessage',
      'environmentUninstallFailed',
    ] as const) {
      expect(String(enUS[key]), `en:${key}`).toContain('{dep}');
      expect(String(zhCN[key]), `zh:${key}`).toContain('{dep}');
    }
    expect(String(enUS.environmentAggregateReady)).toContain('{ready}');
    expect(String(zhCN.environmentAggregateReady)).toContain('{ready}');
    expect(String(enUS.environmentAggregateReady)).toContain('{total}');
    expect(String(zhCN.environmentAggregateReady)).toContain('{total}');
    expect(String(enUS.environmentNetLatency)).toContain('{ms}');
    expect(String(zhCN.environmentNetLatency)).toContain('{ms}');
    expect(String(enUS.environmentInstallSuccess)).toContain('{dep}');
    expect(String(zhCN.environmentInstallSuccess)).toContain('{dep}');
    expect(String(enUS.environmentInstallSuccess)).toContain('{version}');
    expect(String(zhCN.environmentInstallSuccess)).toContain('{version}');
    expect(String(enUS.environmentWizardResumeBanner)).toContain('{count}');
    expect(String(zhCN.environmentWizardResumeBanner)).toContain('{count}');
  });
});

describe('i18n zh-CN mirror', () => {
  it('zh-CN has same top-level keys as en-US (parity check)', () => {
    const enKeys = new Set(Object.keys(enUS));
    const zhKeys = new Set(Object.keys(zhCN));
    const missingInZh = [...enKeys].filter((k) => !zhKeys.has(k));
    const extraInZh = [...zhKeys].filter((k) => !enKeys.has(k));
    const msg: string[] = [];
    if (missingInZh.length) {
      msg.push(`missing in zh-CN: ${missingInZh.slice(0, 10).join(', ')}`);
    }
    if (extraInZh.length) {
      msg.push(`extra in zh-CN: ${extraInZh.slice(0, 10).join(', ')}`);
    }
    expect(msg.join('; '), msg.join('; ')).toBe('');
  });
});

describe('workspace settings loading copy (rename + plain language)', () => {
  const HINT_FIELDS = [
    'maxConcurrentWorkspacesDesc',
    'priorityListDesc',
    'priorityListTooltip',
    'deferredListDesc',
    'deferredListTooltip',
    'workspaceTagListDesc',
    'workspaceTagListTooltip',
  ] as const;

  it('renames 工作区标签列表 to 常规加载 / Regular', () => {
    expect(zhCN.workspaceTagList).toBe('常规加载');
    expect(enUS.workspaceTagList).toBe('Regular');
  });

  it('zh hint copy no longer mentions the old list name', () => {
    for (const key of HINT_FIELDS) {
      expect(String(zhCN[key]), key).not.toContain('工作区标签列表');
    }
    expect(String(zhCN.workspaceTagListEmpty)).not.toContain('工作区标签列表');
  });

  it('en hint copy no longer mentions the old list name', () => {
    for (const key of HINT_FIELDS) {
      expect(String(enUS[key]), key).not.toMatch(/workspace tag list/i);
    }
    expect(String(enUS.workspaceTagListEmpty)).not.toMatch(/workspace tag list/i);
  });

  it('zh hint copy avoids English jargon mixing', () => {
    const banned = /priority|deferred|appReady|maxConcurrent|min\(|CPU|Git/i;
    for (const key of HINT_FIELDS) {
      expect(String(zhCN[key]), key).not.toMatch(banned);
    }
  });

  it('zh list tooltips use · bullet lines for readability', () => {
    expect(String(zhCN.priorityListTooltip)).toContain('· ');
    expect(String(zhCN.deferredListTooltip)).toContain('· ');
    expect(String(zhCN.workspaceTagListTooltip)).toContain('· ');
    // 常规加载 tooltip 以新名称开篇
    expect(String(zhCN.workspaceTagListTooltip)).toContain('常规加载');
    expect(String(enUS.workspaceTagListTooltip)).toContain('Regular');
  });

  it('list hint copy uses titled sections without bracket decorations', () => {
    expect(zhCN.listHintIntroTitle).toBe('简介');
    expect(enUS.listHintIntroTitle).toBe('Overview');
    for (const key of [
      'priorityListTooltip',
      'deferredListTooltip',
      'workspaceTagListTooltip',
    ] as const) {
      const zh = String(zhCN[key]);
      const en = String(enUS[key]);
      expect(zh.startsWith('# '), key).toBe(true);
      expect(en.startsWith('# '), key).toBe(true);
      expect(zh, key).not.toMatch(/[【】\[\]]/);
      expect(en, key).not.toMatch(/[【】\[\]]/);
      expect(zh, key).not.toContain('\n\n');
      expect(en, key).not.toContain('\n\n');
    }
    // 特殊情况分点用全称，与列表标题一致
    expect(String(zhCN.workspaceTagListTooltip)).toContain('优先加载列表');
    expect(String(zhCN.workspaceTagListTooltip)).toContain('延迟加载列表');
    // 特殊情况 header 不是分点（不以 · 开头），仅子项为分点
    expect(String(zhCN.workspaceTagListTooltip)).toContain('特殊情况：\n· ');
    expect(String(zhCN.workspaceTagListTooltip)).not.toContain('· 特殊情况：');
  });
});

describe('git-visualization copy', () => {
  it('zh-CN branch graph desc separates legend symbols from text and avoids English "tagged"', () => {
    const desc = String(zhCN.gitVisBranchGraphDesc);
    // A space must sit between the legend glyph (●/■) and the following
    // Chinese character, and "tagged" must not leak through as English.
    expect(desc).toContain('● 圆点');
    expect(desc).toContain('■ 方块');
    expect(desc).toContain('带标签的版本以徽章标记');
    expect(desc).not.toMatch(/tagged/i);
  });
});
