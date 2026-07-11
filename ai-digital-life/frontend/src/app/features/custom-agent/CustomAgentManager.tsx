import { useEffect } from 'react';
import { useAppStore } from '../../stores/slicedStore';
import { useTCopy } from '../../i18n/useTCopy';
import { LoadingRow } from '../../components/LoadingRow';

export function CustomAgentManager() {
  const { t } = useTCopy();
  const customAgents = useAppStore((s) => s.customAgents);
  const isFetching = useAppStore((s) => s.isFetchingCustomAgents);
  const fetchCustomAgents = useAppStore((s) => s.fetchCustomAgents);
  const deleteCustomAgent = useAppStore((s) => s.deleteCustomAgent);
  const appInfo = useAppStore((s) => s.appInfo);
  const dataDir = appInfo?.currentWorkspace?.rootPath ?? '';

  useEffect(() => {
    fetchCustomAgents(dataDir);
  }, [dataDir, fetchCustomAgents]);

  if (isFetching) {
    return <LoadingRow variant="center" />;
  }

  return (
    <div className="adl-custom-agent-manager">
      <h3>{t.customAgentManagerTitle}</h3>
      {customAgents.length === 0 && <p className="adl-empty-state">{t.customAgentManagerEmpty}</p>}
      {customAgents.map((agent) => (
        <div key={agent.name} className="adl-custom-agent-item">
          <div className="adl-custom-agent-item__info">
            <strong>{agent.name}</strong>
            <span className={`adl-badge adl-badge--${agent.mode}`}>
              {agent.mode === 'primary'
                ? t.customAgentManagerPrimary
                : agent.mode === 'subagent'
                  ? t.customAgentManagerSubagent
                  : t.customAgentManagerHiddenLabel}
            </span>
            <p>{agent.description}</p>
          </div>
          <button
            className="adl-btn adl-btn--sm adl-btn--danger"
            onClick={() => deleteCustomAgent(dataDir, agent.name)}
          >
            {t.customAgentManagerDelete}
          </button>
        </div>
      ))}
    </div>
  );
}
