/**
 * Agent 切片
 * 管理多 Agent 系统状态：已选 Agent、可用列表、Plan 模式、子代理任务
 */
import type { AgentConfig, SubagentTask } from '@shared/ipc';
import type { StoreState } from '../StoreState';

export interface AgentSlice {
  /** 当前选中的 Agent (null = 使用默认 build agent) */
  selectedAgent: AgentConfig | null;
  /** 可用的 primary agents 列表 */
  availableAgents: AgentConfig[];
  /** Plan 模式是否激活 */
  planModeActive: boolean;
  /** Plan 模式的计划文件路径 */
  planFile: string | null;
  /** 活跃的子代理任务列表 */
  activeSubagents: SubagentTask[];
  /** 是否正在拉取 agents 列表 */
  isFetchingAgents: boolean;

  setSelectedAgent: (agent: AgentConfig | null) => void;
  setAvailableAgents: (agents: AgentConfig[]) => void;
  setPlanMode: (active: boolean, planFile: string | null) => void;
  setActiveSubagents: (tasks: SubagentTask[]) => void;
}

export const createAgentSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState
): AgentSlice => ({
  selectedAgent: null,
  availableAgents: [],
  planModeActive: false,
  planFile: null,
  activeSubagents: [],
  isFetchingAgents: false,

  setSelectedAgent: (agent) => set({ selectedAgent: agent }),
  setAvailableAgents: (agents) => set({ availableAgents: agents }),
  setPlanMode: (active, planFile) => set({ planModeActive: active, planFile }),
  setActiveSubagents: (tasks) => set({ activeSubagents: tasks }),
});
