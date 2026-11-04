import type { StoreState } from '../StoreState';
import type { TerminalProfile } from '../types';
import { buildTabsById, type TerminalTabState } from '../slices/terminalSliceTypes';
import { readObjectArray } from './parsers';
import { isTerminalTabState, registry } from './registry';
import type { CompositeHydrator } from './composite';

/**
 * 终端跨键归一化器（Task 10）。
 *
 * 搬自已删除的 `hydrateTerminalDefaults` 的两处派生行为，必须保住：
 * 1. `terminalTabsById` —— 每次标签变更都重建，重启后也得由水合重建，
 *    否则按 id 检索标签全失效。
 * 2. `shellSelectorProfile` 三档回退链 —— 自己的键 → 非法回退
 *    `defaultTerminalProfile` → 再非法回退 `'powershell'`。
 *
 * 校验器来源（唯一）：
 * - `terminalTabs` 复用登记表的逐项校验器 `isTerminalTabState`；
 * - profile 白名单只存在于 `slices/terminalSliceTypes.ts`，本文件**不持有**任何一份：
 *   自有档直接调用 `registry['adl:terminal.shellSelectorProfile']` 条目**声明的那个 read**，
 *   中间档取 `hydrateAll` 经 `adl:terminal.defaultProfile` 声明的 read 产出的补丁值。
 *   两条路都不再重读原始键、不再自写第二份判定 —— 声明即生效，没有装饰性声明。
 *
 * 语义：键缺失 ≡ 空；键存在但形状不合法 ⇒ 不产出补丁（绝不把畸形值写回 store）。
 */

export const terminalCompositeHydrators: CompositeHydrator[] = [
  {
    name: 'terminalDerived',
    build: (read, priorPatch) => {
      const rawTabs = read('adl:terminal.tabs');
      const parsed =
        rawTabs === undefined ? [] : readObjectArray<TerminalTabState>(isTerminalTabState)(rawTabs);

      // 重启恢复：PTY 会话随进程退出全部失效，落盘的 sessionId 必须剥离；
      // 全部窗格回到 idle、无会话，由视图侧生命周期为每个窗格新建 shell
      //（spec §10）。注意这是无条件覆盖：上次已 terminated 的窗格也会复活重建，
      // 语义即"重启后全部窗格都有可用 shell"，是刻意选择（对应用户"重启后每格
      // 都应有命令提示符"的期望），不是误伤——窄化为仅 running 才改写反而会
      // 留下空白格。
      const tabs = parsed?.map((tab) => ({
        ...tab,
        panes: tab.panes.map((pane) => {
          const { sessionId: _dead, ...rest } = pane;
          return {
            ...rest,
            status: 'idle' as const,
          };
        }),
      }));

      const patch: Partial<StoreState> = {};
      // 标签损坏（非数组 / 含畸形元素）⇒ 不产出 terminalTabs/ById，store 初始即为 []/{}
      //（简单条目侧同步回退 []，此处不再覆盖）；标签空或缺失 ⇒ 同样留空。
      // 清洗后的 tabs 同时覆盖 terminalTabs，保证 tabs 与 tabsById 一致，
      // 否则简单条目的死 sessionId 会与此处清洗结果分叉。
      if (tabs !== undefined && tabs.length > 0) {
        patch.terminalTabs = tabs;
        patch.terminalTabsById = buildTabsById(tabs);
      }

      // 三档回退：own key（登记表声明的 read） → defaultTerminalProfile（登记表已校验的补丁值）
      // → 'powershell'。第二档在简单条目里已有 fallback 'powershell'，故第三档随之成立。
      const fallbackProfile: TerminalProfile = priorPatch.defaultTerminalProfile ?? 'powershell';
      const ownSelectorProfile = registry['adl:terminal.shellSelectorProfile'].read?.(
        read('adl:terminal.shellSelectorProfile'),
      );
      patch.shellSelectorProfile = ownSelectorProfile ?? fallbackProfile;

      return patch;
    },
  },
];
