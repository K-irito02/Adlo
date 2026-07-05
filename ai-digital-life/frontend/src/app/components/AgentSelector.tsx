import { useEffect } from 'react';
import { useAppStore } from '../stores/slicedStore';
import { useTCopy } from '../i18n/useTCopy';

/**
 * AgentSelector - 切换 Agent 的下拉选择器
 * 显示可用 primary agents，调用 selectAgentForScenario 切换
 */
export function AgentSelector() {
  const { t } = useTCopy();
  const availableAgents = useAppStore((s) => s.availableAgents);
  const selectedAgent = useAppStore((s) => s.selectedAgent);
  const fetchAgents = useAppStore((s) => s.fetchAgents);
  const selectAgentForScenario = useAppStore((s) => s.selectAgentForScenario);

  useEffect(() => {
    if (availableAgents.length === 0) {
      void fetchAgents();
    }
  }, [availableAgents.length, fetchAgents]);

  const currentId = selectedAgent?.id ?? 'build';

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const agentId = e.target.value;
    // Map agent ID to scenario for the router
    const scenario = agentId === 'plan' ? 'plan' : 'chat';
    void selectAgentForScenario(scenario, '');
  };

  // Map agent ID to i18n label (type-safe switch, no casts)
  const agentLabel = (agentId: string): string => {
    switch (agentId) {
      case 'build':
        return t.agentSelectorBuild;
      case 'plan':
        return t.agentSelectorPlan;
      case 'general':
        return t.agentSelectorGeneral;
      case 'explore':
        return t.agentSelectorExplore;
      case 'custom':
        return t.agentSelectorCustom;
      default:
        return agentId;
    }
  };

  return (
    <select
      value={currentId}
      onChange={handleChange}
      aria-label={t.agentSelectorTitle}
      className="adl-agent-selector"
    >
      {availableAgents.map((agent) => (
        <option key={agent.id} value={agent.id}>
          {agentLabel(agent.id)}
        </option>
      ))}
    </select>
  );
}
