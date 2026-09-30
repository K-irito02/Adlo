import { clamp } from '../storageHelpers';
import { normalizeIgnoredEntry } from '../../../shared/ipc/searchIgnore';
import { readBooleanRecord } from './entry';
import { BROWSER_ZOOM_MIN, BROWSER_ZOOM_MAX } from '../slices/browserSliceShared';
import type { TreeExpansion } from '../slices/uiSliceTypes';
import type { SearchFlags } from '../slices/searchSlice';
import type { FileTreeClickedNode, SessionLastFile } from '../slices/editorSlice';
import type { GitWorkspaceCiConfig, GitHubCiFolderState } from '../slices/githubRepoSliceTypes';
import type { CiRepoConfig, CiStatusSnapshot } from '../../../shared/ipc/github';

/** 布尔：仅接受真正的 boolean */
export function readFlag(raw: unknown): boolean | undefined {
  return typeof raw === 'boolean' ? raw : undefined;
}

/** 数值 + 区间钳制：越界钳制（宽度类状态越界应纠正而非丢弃），非有限数值判为不合法 */
export function readNumberInRange(min: number, max: number): (raw: unknown) => number | undefined {
  return (raw: unknown) => {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return undefined;
    }
    return clamp(raw, min, max);
  };
}

/**
 * 数值 + 区间钳制 + 取整：承接旧读路径 `Math.floor(readNumber(...))` 的语义
 * （见 Task 11：旧写路径存 `String(value)`，读路径先 clamp 再 floor）。
 * 仅做钳制会丢失 floor（持久化的 `200.7` 由 200 变为 200.7），故此处钳制后再取整。
 * 非有限数值判为不合法。
 */
export function readFlooredNumberInRange(
  min: number,
  max: number,
): (raw: unknown) => number | undefined {
  return (raw: unknown) => {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return undefined;
    }
    return Math.floor(clamp(raw, min, max));
  };
}

/** 字符串枚举：不在白名单内判为不合法（避免恢复出无法识别的模式） */
export function readStringEnum<T extends string>(
  allowed: readonly T[],
): (raw: unknown) => T | undefined {
  return (raw: unknown) => {
    if (typeof raw !== 'string') {
      return undefined;
    }
    return (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined;
  };
}

/**
 * 字符串集合（Task 23，变更状态过滤器）：落盘形态为数组，读回为 Set。
 * 非数组外层判为不合法；数组内非法成员（非字符串 / 不在白名单）逐个过滤、
 * 不整字段回退 —— 过滤器语义是"选中集合"，单个脏成员不应丢掉其余选中。
 */
export function readStringSet<T extends string>(
  allowed: readonly T[],
): (raw: unknown) => Set<T> | undefined {
  return (raw: unknown) => {
    if (!Array.isArray(raw)) {
      return undefined;
    }
    const result = new Set<T>();
    for (const item of raw) {
      if (typeof item === 'string' && (allowed as readonly string[]).includes(item)) {
        result.add(item as T);
      }
    }
    return result;
  };
}

/** 字符串：仅接受真正的 string（空串是合法值） */
export function readString(raw: unknown): string | undefined {
  return typeof raw === 'string' ? raw : undefined;
}

/** Record<string, string> 扁平字符串映射；任一值非字符串即整字段判为不合法 */
export function readStringRecord(raw: unknown): Record<string, string> | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'string') {
      return undefined;
    }
    result[key] = value;
  }
  return result;
}

/** 数字数组；任一元素非有限数值即整字段判为不合法 */
export function readNumberArray(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const result: number[] = [];
  for (const item of raw) {
    if (typeof item !== 'number' || !Number.isFinite(item)) {
      return undefined;
    }
    result.push(item);
  }
  return result;
}

/** 字符串数组；任一元素非字符串即整字段判为不合法 */
export function readStringArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const result: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') {
      return undefined;
    }
    result.push(item);
  }
  return result;
}

/**
 * 对象数组 + 逐项校验：任一项不是普通对象、或不通过 `isItem` 即整字段判为不合法。
 *
 * 逐项校验是必要的 —— 数组元素随后会作为完整领域对象写入 store，
 * 单个畸形元素（字符串/null/缺字段）会在渲染期才暴露，故在读盘处整体拒绝。
 */
export function readObjectArray<T>(
  isItem: (item: Record<string, unknown>) => boolean,
): (raw: unknown) => T[] | undefined {
  return (raw: unknown) => {
    if (!Array.isArray(raw)) {
      return undefined;
    }
    const result: T[] = [];
    for (const item of raw) {
      if (!isPlainRecord(item) || !isItem(item)) {
        return undefined;
      }
      result.push(item as T);
    }
    return result;
  };
}

/** Record<string, T[]> 两层映射：外层值为数组、且每项通过 `isItem` */
export function readObjectArrayRecord<T>(
  isItem: (item: Record<string, unknown>) => boolean,
): (raw: unknown) => Record<string, T[]> | undefined {
  const readArray = readObjectArray<T>(isItem);
  return (raw: unknown) => {
    if (!isPlainRecord(raw)) {
      return undefined;
    }
    const result: Record<string, T[]> = {};
    for (const [key, value] of Object.entries(raw)) {
      const items = readArray(value);
      if (items === undefined) {
        return undefined;
      }
      result[key] = items;
    }
    return result;
  };
}

/** 普通对象判定（排除 null 与数组）—— 供各形状校验器复用 */
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Record<workspaceId, string[]>：大纲展开项（文件/变更共用）；任一层不合法即整字段判为不合法 */
export function readStringArrayRecord(raw: unknown): Record<string, string[]> | undefined {
  if (!isPlainRecord(raw)) {
    return undefined;
  }
  const result: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(raw)) {
    // 复用 readStringArray 的逐项校验：同一条「字符串数组」口径只留一份实现。
    const entries = readStringArray(value);
    if (!entries) {
      return undefined;
    }
    result[key] = entries;
  }
  return result;
}

/** Record<workspaceId, Record<path, boolean>> 两层布尔映射 */
export function readBooleanPropRecord(
  raw: unknown,
): Record<string, Record<string, boolean>> | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const result: Record<string, Record<string, boolean>> = {};
  for (const [outerKey, outerValue] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof outerValue !== 'object' || outerValue === null || Array.isArray(outerValue)) {
      return undefined;
    }
    const inner: Record<string, boolean> = {};
    for (const [innerKey, innerValue] of Object.entries(outerValue as Record<string, unknown>)) {
      if (typeof innerValue !== 'boolean') {
        return undefined;
      }
      inner[innerKey] = innerValue;
    }
    result[outerKey] = inner;
  }
  return result;
}

/**
 * 检索手动忽略名单的读侧归一化（Task 11）。
 *
 * 入口收敛脏输入（前导斜杠 / `\` / 尾斜杠）并去重：复用 searchIgnore 的
 * `normalizeIgnoredEntry`，全应用只有这一份清洗（写侧 `toggleIgnoredPath` 本就产出
 * 归一化值，此处是读侧兜底）。
 *
 * 与迁移前 searchSlice 旧 `readSearchIgnoredPaths` 的关系：**入口级语义一致**（同一
 * `normalizeIgnoredEntry` + 去重），但**外层容错被有意收紧**——旧读取器遇到某个 workspace
 * 的值不是数组时**跳过该 workspace、保留其余**；本解析器改为任一层不合法即整字段判为不合法，
 * 于是整个键回退 fallback 并在下次写盘时被覆盖，而不是只丢那一个成员。此收紧与登记表既有约定
 * （任一成员畸形即整记录不合法，同 Task 7 的裁定）一致，且只有手工编辑/损坏的存储才会触发。
 */
export function readSearchIgnoredPaths(raw: unknown): Record<string, string[]> | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const result: Record<string, string[]> = {};
  for (const [workspaceId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) {
      return undefined;
    }
    const seen = new Set<string>();
    const list: string[] = [];
    for (const p of value) {
      if (typeof p !== 'string') {
        continue;
      }
      const normalized = normalizeIgnoredEntry(p);
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        list.push(normalized);
      }
    }
    result[workspaceId] = list;
  }
  return result;
}

/**
 * 检索 `.gitignore` 开关的读侧映射（Task 11）。
 * 任一值非布尔 ⇒ 整字段判为不合法（回退 fallback）；非对象外层同样判为不合法。
 */
export function readSearchUseGitignore(raw: unknown): Record<string, boolean> | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const result: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'boolean') {
      return undefined;
    }
    result[key] = value;
  }
  return result;
}

/**
 * 每标签缩放的读侧校验（Task 24，`Record<tabId, zoom>`）。
 * 任一值非有限数值即整字段判为不合法；越界值钳制到 [0.5, 2.0]
 * （与写侧 setBrowserZoomByTab 的 clamp 同源，见 browserSliceShared）。
 */
export function readZoomByTab(raw: unknown): Record<string, number> | undefined {
  if (!isPlainRecord(raw)) {
    return undefined;
  }
  const result: Record<string, number> = {};
  for (const [tabId, value] of Object.entries(raw)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return undefined;
    }
    result[tabId] = clamp(value, BROWSER_ZOOM_MIN, BROWSER_ZOOM_MAX);
  }
  return result;
}

/**
 * 读取单个工作区的文件树展开态（`TreeExpansion`）。
 *
 * 形状校验：
 * - 必须是普通对象，且 `expanded` 必须是 `Record<string, boolean>`（借用 `readBooleanRecord`）；
 * - `manualCollapsed` 若存在，其叶子必须**恒为 `true`**，否则整条判为不合法。
 *
 * 跨字段不变量修复（裁定 2，有意偏离"任一成员畸形即整条回退"的惯例）：
 * 当 `manualCollapsed[k] === true` 与 `expanded[k] === true` 冲突时，以后者为准、
 * **就地丢弃** `manualCollapsed[k]` 而非判整条非法。原因：这种损坏的值**可解释且有唯一
 * 正解**（`expanded[k] === true` 表示目录当前确实展开，与"被手动折叠"矛盾），整条回退会
 * 因一处冲突丢掉用户全部展开态——这是不可接受的。读侧修复后，剪枝侧（`pruneDirExpansion`）
 * 再次应用同一修复作为防御（防止后来者绕过 read 直接构造）。
 *
 * 旧版扁平值（如 `{ 'src/legacy': false }`）必须被**拒绝**：它缺少合法的 `expanded`
 * 成员，`readBooleanRecord(raw.expanded)` 返回 undefined，于是整条判非法、回退 fallback，
 * 而非把路径误当成 `TreeExpansion` 的成员。这是本任务"不兼容旧格式、旧扁平值直接丢弃"的
 * 落点——绝不为旧格式写任何兼容/迁移代码。
 */
/**
 * 跨字段不变量修复（裁定 2）的唯一实现：
 * `manualCollapsed[k] === true` ⇒ `expanded[k] !== true`，冲突时以后者为准、
 * **丢弃** `manualCollapsed[k]`（`expanded[k] === true` 表示目录当前确实展开，
 * 与"被手动折叠"矛盾，这种损坏可解释且有唯一正解，故修复而非判非法）。
 *
 * 必须放在 `parsers.ts`（而非 `apply.ts` 或更高层）：`apply.ts` 值导入 `registry`，
 * `registry` 又导入 `parsers`，放在上方任何一层都会引入运行时循环；
 * `parsers.ts` 只依赖 `storageHelpers` / `searchIgnore` / `entry`（后两者为终点模块），方向安全。
 *
 * 语义约定：
 * - 入参 `manualCollapsed` 为 `undefined` 或修复后为空 ⇒ 返回 `undefined`（无标记即无成员）；
 * - 丢弃计数由调用方自行比对前后键数得出（`pruneDirExpansion` 依赖它区分
 *   "修复丢了一项"与"标记项全部幸存"，`changed` 信号语义不变）。
 */
export function repairManualCollapsed(
  expanded: Record<string, boolean>,
  manualCollapsed: Record<string, true> | undefined,
): Record<string, true> | undefined {
  if (!manualCollapsed) {
    return undefined;
  }
  const repaired: Record<string, true> = {};
  for (const [key, value] of Object.entries(manualCollapsed)) {
    if (expanded[key] === true) {
      continue;
    }
    repaired[key] = value;
  }
  return Object.keys(repaired).length > 0 ? repaired : undefined;
}

export function readDirExpansion(raw: unknown): TreeExpansion | undefined {
  if (!isPlainRecord(raw)) {
    return undefined;
  }
  const expanded = readBooleanRecord(raw.expanded);
  if (expanded === undefined) {
    return undefined;
  }
  let manualCollapsed: Record<string, true> | undefined;
  if (raw.manualCollapsed !== undefined) {
    if (!isPlainRecord(raw.manualCollapsed)) {
      return undefined;
    }
    manualCollapsed = {};
    for (const [key, value] of Object.entries(raw.manualCollapsed)) {
      if (value !== true) {
        return undefined;
      }
      manualCollapsed[key] = true;
    }
  }
  // 就地修复跨字段冲突（共享实现见 repairManualCollapsed）
  manualCollapsed = repairManualCollapsed(expanded, manualCollapsed);
  return { expanded, manualCollapsed };
}

/**
 * 读取按工作区隔离的目录展开态（`Record<workspaceId, TreeExpansion>`）。
 *
 * 外层按工作区拆开逐个交给 `readDirExpansion` 校验 + 修复；任一工作区不合法 ⇒
 * 整条回退 fallback（与登记表既有约定一致）。旧版扁平值会被 `readDirExpansion`
 * 拒绝（缺少合法的 `expanded` 成员），直接丢弃 —— 不写兼容代码。
 */
export function readDirExpansionRecord(raw: unknown): Record<string, TreeExpansion> | undefined {
  if (!isPlainRecord(raw)) {
    return undefined;
  }
  const result: Record<string, TreeExpansion> = {};
  for (const [workspaceId, value] of Object.entries(raw)) {
    const parsed = readDirExpansion(value);
    if (parsed === undefined) {
      return undefined;
    }
    result[workspaceId] = parsed;
  }
  return result;
}

/**
 * 文件检索三开关（大小写/全词/正则）的读侧校验（Task 22）。
 * 三个成员必须同时为布尔 —— 任一缺失或类型不对即整字段判为不合法
 * （与登记表既有约定一致；写侧 `setSearchFlags` 恒产出完整对象）。
 */
export function readSearchFlags(raw: unknown): SearchFlags | undefined {
  if (!isPlainRecord(raw)) {
    return undefined;
  }
  const { matchCase, matchWholeWord, useRegex } = raw;
  if (
    typeof matchCase !== 'boolean' ||
    typeof matchWholeWord !== 'boolean' ||
    typeof useRegex !== 'boolean'
  ) {
    return undefined;
  }
  return { matchCase, matchWholeWord, useRegex };
}

/**
 * 文件树选中节点的读侧校验（Task 22，`Record<workspaceId, FileTreeClickedNode>`）。
 * 每个成员必须是普通对象；`path` / `workspaceRoot` 若出现必须为字符串，
 * `kind` 若出现必须为 'directory' | 'file' —— 任一成员不合法即整字段回退。
 */
export function readClickedNodeRecord(
  raw: unknown,
): Record<string, FileTreeClickedNode> | undefined {
  if (!isPlainRecord(raw)) {
    return undefined;
  }
  const result: Record<string, FileTreeClickedNode> = {};
  for (const [workspaceId, value] of Object.entries(raw)) {
    if (!isPlainRecord(value)) {
      return undefined;
    }
    const node: FileTreeClickedNode = {};
    if (value.path !== undefined) {
      if (typeof value.path !== 'string') {
        return undefined;
      }
      node.path = value.path;
    }
    if (value.kind !== undefined) {
      if (value.kind !== 'directory' && value.kind !== 'file') {
        return undefined;
      }
      node.kind = value.kind;
    }
    if (value.workspaceRoot !== undefined) {
      if (typeof value.workspaceRoot !== 'string') {
        return undefined;
      }
      node.workspaceRoot = value.workspaceRoot;
    }
    result[workspaceId] = node;
  }
  return result;
}

/**
 * 会话恢复：上次打开的文件（Task 26）。
 * workspaceId 与 relativePath 必须同为字符串，否则整条判为不合法；
 * null（从未打开过）是合法持久值，由登记表条目直接处理，不经过本函数。
 */
export function readSessionLastFile(raw: unknown): SessionLastFile | undefined {
  if (!isPlainRecord(raw)) {
    return undefined;
  }
  if (typeof raw.workspaceId !== 'string' || typeof raw.relativePath !== 'string') {
    return undefined;
  }
  return { workspaceId: raw.workspaceId, relativePath: raw.relativePath };
}

/**
 * CI 仓库配置（Task 29）。
 * 与旧 hydrateCiConfigDefaults 的接受集一致：owner/repo/branch 必须为字符串
 * （旧读路径以 ''/'main' 兜底，登记表约定改为整条拒绝并回退等价默认值），
 * workflowId 只接受字符串（旧 `?? null` 会透传非空垃圾值，此处收紧为 null）。
 * accessToken 恒为 null——写入侧已剥离（stripTokenFromConfig），读侧不再信任盘上旧值。
 */
export function readCiRepoConfig(raw: unknown): CiRepoConfig | undefined {
  if (!isPlainRecord(raw)) {
    return undefined;
  }
  const { owner, repo, branch, workflowId } = raw;
  if (typeof owner !== 'string' || typeof repo !== 'string' || typeof branch !== 'string') {
    return undefined;
  }
  return {
    owner,
    repo,
    branch,
    workflowId: typeof workflowId === 'string' ? workflowId : null,
    accessToken: null,
  };
}

/**
 * CI 快照表（Task 29，大对象，sync:false）。
 * 旧读路径（readJson 直转）零校验；此处要求成员含 repo/branch 字符串与 jobs 数组，
 * 否则整表拒绝——损坏数据仅来自手改存储，写盘侧恒产出合法形状。
 */
export function readCiSnapshots(raw: unknown): Record<string, CiStatusSnapshot> | undefined {
  if (!isPlainRecord(raw)) {
    return undefined;
  }
  const result: Record<string, CiStatusSnapshot> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (
      !isPlainRecord(value) ||
      typeof value.repo !== 'string' ||
      typeof value.branch !== 'string' ||
      !Array.isArray(value.jobs)
    ) {
      return undefined;
    }
    result[key] = value as unknown as CiStatusSnapshot;
  }
  return result;
}

/**
 * CI 日志缓存表（Task 29，大对象，sync:false）。
 * 成员 selectedJobId 须为数字或 null，logs 的值须全为字符串，否则整表拒绝。
 */
export type CiLogCacheMap = Record<
  string,
  { selectedJobId: number | null; logs: Record<number, string> }
>;

export function readCiLogCaches(raw: unknown): CiLogCacheMap | undefined {
  if (!isPlainRecord(raw)) {
    return undefined;
  }
  const result: CiLogCacheMap = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isPlainRecord(value)) {
      return undefined;
    }
    const { selectedJobId, logs } = value;
    if (
      (selectedJobId !== null && typeof selectedJobId !== 'number') ||
      !isPlainRecord(logs) ||
      !Object.values(logs).every((line) => typeof line === 'string')
    ) {
      return undefined;
    }
    result[key] = value as unknown as CiLogCacheMap[string];
  }
  return result;
}

/**
 * GitHub 工作区配置表（Task 29，按工作区隔离）。
 * 与旧 hydrateGitHubConfigs 逐字同语义：缺 owner 的成员跳过（保留其余，不整表拒绝；
 * readStringSet 式成员级过滤先例见 Task 23），accessToken 恒为 null（写入侧已剥离）。
 */
export function readGitHubWorkspaceConfigs(
  raw: unknown,
): Record<string, GitWorkspaceCiConfig> | undefined {
  if (!isPlainRecord(raw)) {
    return undefined;
  }
  const result: Record<string, GitWorkspaceCiConfig> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isPlainRecord(value) || typeof value.owner !== 'string' || value.owner.length === 0) {
      continue;
    }
    result[key] = {
      owner: value.owner,
      repo: value.repo as string,
      branch: (value.branch as string | undefined) ?? 'main',
      workflowId: (value.workflowId as string | null | undefined) ?? null,
      accessToken: null,
      configured: (value.configured as boolean | undefined) ?? true,
    };
  }
  return result;
}

/**
 * GitHub CI 文件夹数组（Task 29）。
 * 与旧 hydrateGitHubFolders 同语义：非数组回退；成员 token 恒 null；缺 id 的成员跳过。
 */
export function readGitHubCiFolders(raw: unknown): GitHubCiFolderState[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const result: GitHubCiFolderState[] = [];
  for (const item of raw) {
    if (!isPlainRecord(item) || typeof item.id !== 'string') {
      continue;
    }
    const folder = { ...item } as unknown as GitHubCiFolderState;
    if (isPlainRecord(folder.ciConfig)) {
      folder.ciConfig = {
        ...(folder.ciConfig as unknown as Record<string, unknown>),
        accessToken: null,
      } as unknown as GitWorkspaceCiConfig;
    }
    result.push(folder);
  }
  return result;
}
