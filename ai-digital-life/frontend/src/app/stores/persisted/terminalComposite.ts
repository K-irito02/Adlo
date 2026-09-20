import type { StoreState } from '../StoreState';
import type { TerminalProfile } from '../types';
import type { TerminalTabState } from '../slices/terminalSliceTypes';
import { readObjectArray, readStringEnum } from './parsers';
import { isTerminalTabState } from './registry';
import { normalizeTerminalShellProfile } from '../slices/terminalSliceTypes';
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
 * 与 composite.ts 同构：直接读原始值，不经过登记表的 read 校验器之外
 * 的二次"期望形状"定义；`isTerminalTabState` 复用登记表的逐项校验器，
 * 单一来源，杜绝 T9 那种"弱判定写回 store"的缺陷。
 *
 * 语义：键缺失 ≡ 空；键存在但形状不合法 ⇒ 不产出补丁（绝不把畸形值写回 store）。
 */

const TERMINAL_PROFILES: readonly TerminalProfile[] = ['powershell', 'bash', 'cmd'];

export const terminalCompositeHydrators: CompositeHydrator[] = [
  {
    name: 'terminalDerived',
    build: (read) => {
      const rawTabs = read('adl:terminal.tabs');
      const tabs =
        rawTabs === undefined ? [] : readObjectArray<TerminalTabState>(isTerminalTabState)(rawTabs);

      const patch: Partial<StoreState> = {};
      // 标签损坏（非数组 / 含畸形元素）⇒ 不产出 terminalTabsById，store 初始即为 {}，
      // 与简单条目把 terminalTabs 回退 [] 自洽；标签空或缺失 ⇒ 同样留 {}。
      if (tabs !== undefined && tabs.length > 0) {
        const byId: Record<string, TerminalTabState> = {};
        for (const tab of tabs) {
          byId[tab.id] = tab;
        }
        patch.terminalTabsById = byId;
      }

      // 三档回退：shellSelectorProfile → defaultTerminalProfile → 'powershell'
      const defaultProfile =
        readStringEnum<TerminalProfile>(TERMINAL_PROFILES)(read('adl:terminal.defaultProfile')) ??
        'powershell';
      patch.shellSelectorProfile = normalizeTerminalShellProfile(
        read('adl:terminal.shellSelectorProfile'),
        defaultProfile,
      );

      return patch;
    },
  },
];
