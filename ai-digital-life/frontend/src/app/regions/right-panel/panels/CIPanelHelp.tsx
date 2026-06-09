/**
 * CI 面板 - 详细帮助文档（方案B）
 */
import React from 'react';
import { workspaceSelectors } from '../../../stores/selectors';
import { getAppCopy } from '../../../i18n';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="ci-help__section">
      <h3 className="ci-help__section-title">{title}</h3>
      {children}
    </section>
  );
}

function ConceptItem({
  term,
  definition,
  analogy,
}: {
  term: string;
  definition: string;
  analogy: string;
}) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="ci-help__concept-item">
      <div
        className="ci-help__concept-header"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded((v) => !v)}
      >
        <span className="ci-help__concept-term">{term}</span>
        <span className="ci-help__concept-toggle">{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && (
        <div className="ci-help__concept-body">
          <p className="ci-help__concept-def">{definition}</p>
          <p className="ci-help__concept-analogy">
            <strong>通俗理解：</strong>
            {analogy}
          </p>
        </div>
      )}
    </div>
  );
}

function TroubleItem({
  problem,
  cause,
  solution,
}: {
  problem: string;
  cause: string;
  solution: string;
}) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="ci-help__trouble-item">
      <div
        className="ci-help__trouble-header"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded((v) => !v)}
      >
        <span className="ci-help__trouble-icon">❓</span>
        <span className="ci-help__trouble-problem">{problem}</span>
        <span className="ci-help__trouble-toggle">{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && (
        <div className="ci-help__trouble-body">
          <div className="ci-help__trouble-row">
            <span className="ci-help__trouble-label">可能原因：</span>
            <span>{cause}</span>
          </div>
          <div className="ci-help__trouble-row">
            <span className="ci-help__trouble-label">解决方案：</span>
            <span>{solution}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function CIPanelHelp() {
  const appInfo = workspaceSelectors.useAppInfo();
  const copy = getAppCopy(appInfo);

  return (
    <div className="ci-help">
      {/* 基础使用 */}
      <Section title={copy.ciHelpBasicTitle}>
        <div className="ci-help__card">
          <h4>{copy.ciHelpHowToConfig}</h4>
          <p>{copy.ciHelpHowToConfigContent}</p>
        </div>

        <div className="ci-help__card">
          <h4>{copy.ciHelpStatusColors}</h4>
          <pre className="ci-help__pre">{copy.ciHelpStatusColorsContent}</pre>
        </div>

        <div className="ci-help__card">
          <h4>{copy.ciHelpViewLogs}</h4>
          <p>{copy.ciHelpViewLogsContent}</p>
        </div>
      </Section>

      {/* 进阶概念 */}
      <Section title={copy.ciHelpConceptsTitle}>
        <div className="ci-help__concepts">
          <ConceptItem
            term={copy.ciHelpConceptWorkflow}
            definition={copy.ciHelpConceptWorkflowDef}
            analogy={copy.ciHelpConceptWorkflowAnalogy}
          />
          <ConceptItem
            term={copy.ciHelpConceptJob}
            definition={copy.ciHelpConceptJobDef}
            analogy={copy.ciHelpConceptJobAnalogy}
          />
          <ConceptItem
            term={copy.ciHelpConceptStep}
            definition={copy.ciHelpConceptStepDef}
            analogy={copy.ciHelpConceptStepAnalogy}
          />
          <ConceptItem
            term={copy.ciHelpConceptRun}
            definition={copy.ciHelpConceptRunDef}
            analogy={copy.ciHelpConceptRunAnalogy}
          />
          <ConceptItem
            term={copy.ciHelpConceptConclusion}
            definition={copy.ciHelpConceptConclusionDef}
            analogy={copy.ciHelpConceptConclusionAnalogy}
          />
          <ConceptItem
            term={copy.ciHelpConceptStatus}
            definition={copy.ciHelpConceptStatusDef}
            analogy={copy.ciHelpConceptStatusAnalogy}
          />
        </div>
      </Section>

      {/* 故障排查 */}
      <Section title={copy.ciHelpTroubleshootingTitle}>
        <div className="ci-help__troubles">
          <TroubleItem
            problem={copy.ciHelpTroubleNoRuns}
            cause={copy.ciHelpTroubleNoRunsCause}
            solution={copy.ciHelpTroubleNoRunsSolution}
          />
          <TroubleItem
            problem={copy.ciHelpTroubleRateLimit}
            cause={copy.ciHelpTroubleRateLimitCause}
            solution={copy.ciHelpTroubleRateLimitSolution}
          />
          <TroubleItem
            problem={copy.ciHelpTroubleNoAutoRefresh}
            cause={copy.ciHelpTroubleNoAutoRefreshCause}
            solution={copy.ciHelpTroubleNoAutoRefreshSolution}
          />
          <TroubleItem
            problem={copy.ciHelpTroubleIncompleteInfo}
            cause={copy.ciHelpTroubleIncompleteInfoCause}
            solution={copy.ciHelpTroubleIncompleteInfoSolution}
          />
        </div>
      </Section>

      {/* GitHub Token 配置指南 */}
      <Section title={copy.ciHelpTokenTitle}>
        <div className="ci-help__card">
          <h4>{copy.ciHelpTokenWhyNeed}</h4>
          <pre className="ci-help__pre">{copy.ciHelpTokenWhyNeedContent}</pre>
        </div>

        <div className="ci-help__card">
          <h4>{copy.ciHelpTokenScopes}</h4>
          <ul className="ci-help__list">
            <li>{copy.ciHelpTokenScopePublic}</li>
            <li>{copy.ciHelpTokenScopePrivate}</li>
          </ul>
        </div>

        <div className="ci-help__card">
          <h4>{copy.ciHelpTokenSteps}</h4>
          <ol className="ci-help__steps">
            <li>{copy.ciHelpTokenStep1}</li>
            <li>{copy.ciHelpTokenStep2}</li>
            <li>{copy.ciHelpTokenStep3}</li>
            <li>{copy.ciHelpTokenStep4}</li>
            <li>{copy.ciHelpTokenStep5}</li>
            <li>{copy.ciHelpTokenStep6}</li>
          </ol>
        </div>

        <div className="ci-help__card ci-help__card--warning">
          <h4>{copy.ciHelpTokenSecurity}</h4>
          <pre className="ci-help__pre">{copy.ciHelpTokenSecurityContent}</pre>
        </div>

        <details className="ci-help__details">
          <summary className="ci-help__details-summary">{copy.ciHelpTokenOldMethod}</summary>
          <pre className="ci-help__pre">{copy.ciHelpTokenOldMethodContent}</pre>
        </details>
      </Section>

      <style>{`
        .ci-help {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .ci-help__section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .ci-help__section-title {
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin: 0;
          padding-bottom: 4px;
          border-bottom: 1px solid var(--border);
        }
        .ci-help__card {
          background: var(--surface-secondary);
          border-radius: 6px;
          padding: 10px 12px;
        }
        .ci-help__card h4 {
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--text-primary);
          margin: 0 0 6px;
        }
        .ci-help__card p {
          font-size: var(--text-xs);
          color: var(--text-secondary);
          margin: 0;
          line-height: 1.5;
        }
        .ci-help__pre {
          font-size: var(--text-xs);
          color: var(--text-secondary);
          margin: 0;
          white-space: pre-wrap;
          line-height: 1.6;
        }
        .ci-help__concepts,
        .ci-help__troubles {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .ci-help__concept-item,
        .ci-help__trouble-item {
          border-radius: 6px;
          overflow: hidden;
        }
        .ci-help__concept-header,
        .ci-help__trouble-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          background: var(--surface-secondary);
          cursor: pointer;
          font-size: var(--text-xs);
        }
        .ci-help__concept-header:hover,
        .ci-help__trouble-header:hover {
          background: var(--surface-hover);
        }
        .ci-help__concept-term,
        .ci-help__trouble-problem {
          flex: 1;
          font-weight: 500;
          color: var(--text-primary);
        }
        .ci-help__concept-toggle,
        .ci-help__trouble-toggle {
          color: var(--text-tertiary);
          font-size: 8px;
        }
        .ci-help__concept-body,
        .ci-help__trouble-body {
          padding: 10px 12px;
          background: var(--surface-primary);
          border-top: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .ci-help__concept-def {
          font-size: var(--text-xs);
          color: var(--text-secondary);
          margin: 0;
          line-height: 1.5;
        }
        .ci-help__concept-analogy {
          font-size: var(--text-xs);
          color: var(--text-tertiary);
          margin: 0;
          line-height: 1.5;
        }
        .ci-help__concept-analogy strong {
          color: var(--text-secondary);
        }
        .ci-help__trouble-row {
          display: flex;
          flex-direction: column;
          gap: 2px;
          font-size: var(--text-xs);
          color: var(--text-secondary);
        }
        .ci-help__trouble-label {
          font-weight: 500;
          color: var(--text-primary);
        }
        .ci-help__trouble-icon {
          font-size: var(--text-xs);
        }
        .ci-help__list {
          font-size: var(--text-xs);
          color: var(--text-secondary);
          margin: 0;
          padding-left: 16px;
          line-height: 1.6;
        }
        .ci-help__steps {
          font-size: var(--text-xs);
          color: var(--text-secondary);
          margin: 0;
          padding-left: 20px;
          line-height: 1.8;
        }
        .ci-help__card--warning {
          border-left: 3px solid var(--warning, #f59e0b);
        }
        .ci-help__details {
          background: var(--surface-secondary);
          border-radius: 6px;
          overflow: hidden;
        }
        .ci-help__details-summary {
          padding: 8px 10px;
          font-size: var(--text-xs);
          font-weight: 500;
          color: var(--text-secondary);
          cursor: pointer;
          user-select: none;
        }
        .ci-help__details-summary:hover {
          background: var(--surface-hover);
        }
        .ci-help__details[open] .ci-help__details-summary {
          border-bottom: 1px solid var(--border);
        }
        .ci-help__details pre {
          margin: 0;
          padding: 10px 12px;
        }
      `}</style>
    </div>
  );
}
