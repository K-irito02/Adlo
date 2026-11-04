import { formatT } from '@i18n/formatT';
import type { CopyDict } from '@i18n';
import type { EnvDepKey } from './EnvDepRow';
import { envDepStatusLabel, isEnvDepReady, sourceLabelFor } from './EnvDepRow';
import { envDepLabel } from './depLabels';
import { RUNBOOKS, type RunbookKey } from './runbooks';
import type { EnvDependencyState, EnvStatus } from '../../../shared/ipc/env';

type DiagnosticDep = EnvDepKey | 'all';

/**
 * 复制给智能体的诊断载荷（报告的数据载体）。
 *
 * 与旧载荷的区别：`status` 是真实对象而不是二次 stringify 的字符串；报告正文
 * （[`formatAgentDiagnostic`]）才是用户复制到剪贴板的内容，JSON 只作为其中一个
 * 代码块供外部智能体解析。
 */
interface EnvDepPayload {
  dep: DiagnosticDep;
  label: string;
  baseline: string | null;
  status: unknown;
  runbook: string | null;
  dataDir: string;
}

interface DiagnosticMeta {
  t: CopyDict;
  appVersion: string;
  bridge: 'tauri' | 'browser';
  locale: string;
  copiedAt: string;
  userAgent: string;
}

/** 依赖 → runbook 映射（git/bash 共用同一份）。 */
const DEP_RUNBOOK: Record<EnvDepKey, RunbookKey> = {
  node: 'env-node',
  git: 'env-git-bash',
  bash: 'env-git-bash',
  webview2: 'env-webview2',
  adlserver: 'env-adlserver',
  net: 'env-net-download',
  model: 'env-model-credential',
};

/** 诊断报告列出的可检测依赖（含网络），顺序即设置组/向导顺序；模型行固定最后。 */
const DETECTABLE_DEPS = ['node', 'git', 'bash', 'webview2', 'adlserver', 'net'] as const;

function isDetectableReady(status: EnvStatus, dep: (typeof DETECTABLE_DEPS)[number]): boolean {
  if (dep === 'net') {
    return status.netprobe.registryOk;
  }
  return isEnvDepReady(status[dep]);
}

/** `all` 载荷只带未就绪项 runbook；全部可检测项就绪返回 null。 */
function allRunbooks(status: EnvStatus): string | null {
  const keys: RunbookKey[] = [];
  for (const dep of DETECTABLE_DEPS) {
    if (isDetectableReady(status, dep)) {
      continue;
    }
    const key = DEP_RUNBOOK[dep];
    if (!keys.includes(key)) {
      keys.push(key);
    }
  }
  return keys.length === 0 ? null : keys.map((key) => RUNBOOKS[key]).join('\n\n---\n\n');
}

function depPayload(dep: DiagnosticDep, status: EnvStatus, t: CopyDict): EnvDepPayload {
  const runbook = dep === 'all' ? allRunbooks(status) : RUNBOOKS[DEP_RUNBOOK[dep]];
  if (dep === 'all') {
    return {
      dep,
      label: t.environmentDiagnosticAllItems,
      status,
      baseline: null,
      runbook,
      dataDir: status.dataDir,
    };
  }
  if (dep === 'net') {
    return {
      dep,
      label: envDepLabel(t, dep),
      status: status.netprobe,
      baseline: null,
      runbook,
      dataDir: status.dataDir,
    };
  }
  if (dep === 'model') {
    return {
      dep,
      label: envDepLabel(t, dep),
      status: {
        ciTokenConfigured: status.netprobe.ciTokenConfigured,
        dshReady: status.dshReady,
      },
      baseline: null,
      runbook,
      dataDir: status.dataDir,
    };
  }
  const section = status[dep];
  return {
    dep,
    label: envDepLabel(t, dep),
    status: section,
    // bash/adlserver 无版本基线（wire 为空串）：载荷按“无基线”输出 null。
    baseline: section.baselineVersion === '' ? null : section.baselineVersion,
    runbook,
    dataDir: status.dataDir,
  };
}

/** 单项诊断报告（设置组行内链接 / 向导行共用同一生成器）。 */
export function buildAgentDiagnostic(
  dep: DiagnosticDep,
  status: EnvStatus,
  meta: DiagnosticMeta,
): string {
  return formatAgentDiagnostic(depPayload(dep, status, meta.t), status, meta);
}

/**
 * 面向外部智能体的 Markdown 诊断单：
 * 给你的任务 → 上下文 → 问题项摘要 → 原始 JSON → runbook → 明确的回复格式。
 * 人类可读与机器可解析同时保留，避免旧载荷「JSON 套 JSON」的转义噪声。
 */
function formatAgentDiagnostic(
  payload: EnvDepPayload,
  status: EnvStatus,
  meta: DiagnosticMeta,
): string {
  const { t } = meta;
  const lines: string[] = [];
  lines.push(`# ${t.environmentDiagnosticTitle}`, '');
  lines.push(`## ${t.environmentDiagnosticTaskTitle}`, '');
  lines.push(t.environmentDiagnosticTask, '');

  lines.push(`## ${t.environmentDiagnosticContext}`, '');
  lines.push(`- ${t.environmentDiagnosticAppVersion}: ${meta.appVersion || '—'}`);
  lines.push(
    `- ${t.environmentDiagnosticBridge}: ${
      meta.bridge === 'tauri'
        ? t.environmentDiagnosticBridgeTauri
        : t.environmentDiagnosticBridgeBrowser
    }`,
  );
  lines.push(`- ${t.environmentDiagnosticLocale}: ${meta.locale}`);
  lines.push(`- ${t.environmentDiagnosticCopiedAt}: ${meta.copiedAt}`);
  lines.push(`- ${t.environmentDiagnosticSystem}: ${meta.userAgent || '—'}`);
  lines.push(`- ${t.environmentDiagnosticDataDir}: ${payload.dataDir || '—'}`, '');

  lines.push(`## ${t.environmentDiagnosticItem}`, '');
  if (payload.dep === 'all') {
    lines.push(
      `### ${t.environmentDiagnosticAllItems} — ${formatT(t, 'environmentDiagnosticReadyCount', {
        ready: countReady(status),
        total: DETECTABLE_DEPS.length,
      })}`,
      '',
    );
    for (const dep of orderedDeps(status)) {
      lines.push(`#### ${envDepLabel(t, dep)} — ${statusOf(t, dep, status)}`, '');
      lines.push(...describeDep(t, dep, status), '');
    }
  } else {
    lines.push(`### ${payload.label} — ${statusOf(t, payload.dep, status)}`, '');
    lines.push(...describeDep(t, payload.dep, status), '');
  }

  lines.push(`## ${t.environmentDiagnosticRaw}`, '');
  lines.push('```json');
  lines.push(
    JSON.stringify(
      {
        dep: payload.dep,
        label: payload.label,
        baseline: payload.baseline,
        dataDir: payload.dataDir,
        status: payload.status,
        context: {
          appVersion: meta.appVersion,
          bridge: meta.bridge,
          locale: meta.locale,
          copiedAt: meta.copiedAt,
          userAgent: meta.userAgent,
        },
      },
      null,
      2,
    ),
  );
  lines.push('```', '');

  lines.push(`## ${t.environmentDiagnosticRunbook}`, '');
  lines.push(
    payload.runbook === null
      ? t.environmentDiagnosticAllReady
      : formatRunbookBundle(payload.runbook),
    '',
  );
  lines.push('---', '');
  lines.push(`> ${t.environmentDiagnosticReply}`, '');
  return lines.join('\n');
}

/**
 * runbook 内联排版：剥掉 YAML frontmatter（`---` 元数据块），并把标题整体降两级，
 * 避免 runbook 的 H1/H2 与报告章节抢层级；多份 runbook 用 `---` 分隔时逐份处理。
 */
function formatRunbookBundle(markdown: string): string {
  return markdown.split('\n\n---\n\n').map(formatRunbook).join('\n\n---\n\n');
}

function formatRunbook(markdown: string): string {
  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  return body.replace(/^(#{1,3}) /gm, (_, hashes: string) => `${'#'.repeat(hashes.length + 2)} `);
}

/** 依赖明细行（人类可读）；状态文案由 `statusOf` → `envDepStatusLabel` 统一，net/model 无胶囊。 */
function describeDep(t: CopyDict, dep: EnvDepKey, status: EnvStatus): string[] {
  if (dep === 'net') {
    const { netprobe } = status;
    return [
      `- ${t.environmentDiagnosticRegistry}: ${
        netprobe.registryOk
          ? formatT(t, 'environmentDiagnosticRegistryReachable', {
              ms: netprobe.registryLatencyMs,
            })
          : t.environmentNetRegistryDown
      }`,
      `- ${t.environmentDiagnosticCiToken}: ${
        netprobe.ciTokenConfigured
          ? t.environmentDiagnosticConfigured
          : t.environmentDiagnosticNotConfigured
      }`,
    ];
  }
  if (dep === 'model') {
    return [
      `- ${t.environmentDiagnosticCiToken}: ${
        status.netprobe.ciTokenConfigured
          ? t.environmentDiagnosticConfigured
          : t.environmentDiagnosticNotConfigured
      }`,
      `- ${t.environmentDiagnosticDshReady}: ${
        status.dshReady ? t.environmentStatusReady : t.environmentStatusMissing
      }`,
    ];
  }
  const section = status[dep];
  return [
    `- ${t.environmentDiagnosticReason}: ${reasonFor(t, section)}`,
    `- ${t.environmentFieldVersion}: ${versionFor(t, dep, section)}${
      section.baselineVersion === ''
        ? ''
        : ` (${t.environmentDiagnosticBaseline} ${section.baselineVersion})`
    }`,
    ...(section.path === null ? [] : [`- ${t.environmentFieldPath}: \`${section.path}\``]),
    `- ${t.environmentFieldSource}: ${sourceLabelFor(t, section.mode)} → ${t.environmentDiagnosticEffective}: ${effectiveFor(t, section)}`,
  ];
}

function reasonFor(t: CopyDict, section: EnvDependencyState): string {
  if (section.effective === 'none') {
    return t.environmentDiagnosticReasonMissing;
  }
  if (!section.meetsBaseline) {
    return formatT(t, 'environmentDiagnosticReasonTooOld', { baseline: section.baselineVersion });
  }
  return t.environmentDiagnosticReasonReady;
}

function versionFor(t: CopyDict, dep: EnvDepKey, section: EnvDependencyState): string {
  if (section.installedVersion !== null) {
    return section.installedVersion;
  }
  if (dep === 'bash' || dep === 'adlserver') {
    // 后端只报存在性：缺失时与设置组一致显示破折号，存在时显示「已检测」。
    return section.effective === 'none' ? '—' : t.environmentStatusDetected;
  }
  return t.environmentStatusMissing;
}

function effectiveFor(t: CopyDict, section: EnvDependencyState): string {
  switch (section.effective) {
    case 'host':
      return t.environmentSourceHost;
    case 'system':
      return t.environmentSourceSystem;
    case 'none':
      return t.environmentStatusMissing;
  }
}

function statusOf(t: CopyDict, dep: EnvDepKey, status: EnvStatus): string {
  if (dep === 'net') {
    return status.netprobe.registryOk ? t.environmentStatusReady : t.environmentNetRegistryDown;
  }
  if (dep === 'model') {
    return t.environmentDiagnosticGuidance;
  }
  return envDepStatusLabel(t, dep, status[dep]);
}

function countReady(status: EnvStatus): number {
  return DETECTABLE_DEPS.filter((dep) => isDetectableReady(status, dep)).length;
}

/** 可检测项按未就绪优先；模型引导行固定最后，不参与排序/计数。 */
function orderedDeps(status: EnvStatus): EnvDepKey[] {
  return [
    ...DETECTABLE_DEPS.filter((dep) => !isDetectableReady(status, dep)),
    ...DETECTABLE_DEPS.filter((dep) => isDetectableReady(status, dep)),
    'model',
  ];
}
