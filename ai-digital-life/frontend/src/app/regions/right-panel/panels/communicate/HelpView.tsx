import React from 'react';

export function HelpView({ copy }: { copy: Record<string, string> }) {
  return (
    <div style={{ padding: 12 }}>
      <section style={{ marginBottom: 16 }}>
        <h3
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            color: 'var(--text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            margin: 0,
            paddingBottom: 4,
            borderBottom: '1px solid var(--border)',
          }}
        >
          {copy.ciHelpBasicTitle}
        </h3>
        <div
          style={{
            background: 'var(--surface-secondary)',
            borderRadius: 6,
            padding: '10px 12px',
            marginTop: 8,
          }}
        >
          <h4
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: '0 0 6px',
            }}
          >
            {copy.ciHelpHowToConfig}
          </h4>
          <p
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {copy.ciHelpHowToConfigContent}
          </p>
        </div>
        <div
          style={{
            background: 'var(--surface-secondary)',
            borderRadius: 6,
            padding: '10px 12px',
            marginTop: 8,
          }}
        >
          <h4
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: '0 0 6px',
            }}
          >
            {copy.ciHelpStatusColors}
          </h4>
          <pre
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
              margin: 0,
              whiteSpace: 'pre-wrap',
              lineHeight: 1.6,
            }}
          >
            {copy.ciHelpStatusColorsContent}
          </pre>
        </div>
        <div
          style={{
            background: 'var(--surface-secondary)',
            borderRadius: 6,
            padding: '10px 12px',
            marginTop: 8,
          }}
        >
          <h4
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: '0 0 6px',
            }}
          >
            {copy.ciHelpViewLogs}
          </h4>
          <p
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {copy.ciHelpViewLogsContent}
          </p>
        </div>
      </section>

      <section style={{ marginBottom: 16 }}>
        <h3
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            color: 'var(--text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            margin: 0,
            paddingBottom: 4,
            borderBottom: '1px solid var(--border)',
          }}
        >
          {copy.ciHelpConceptsTitle}
        </h3>
        <div
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-secondary)',
            marginTop: 8,
            lineHeight: 1.6,
          }}
        >
          <p>
            <strong>Workflow：</strong>
            {copy.ciHelpConceptWorkflowDef}
          </p>
          <p>
            <strong>Job：</strong>
            {copy.ciHelpConceptJobDef}
          </p>
          <p>
            <strong>Step：</strong>
            {copy.ciHelpConceptStepDef}
          </p>
          <p>
            <strong>Run：</strong>
            {copy.ciHelpConceptRunDef}
          </p>
        </div>
      </section>

      <section>
        <h3
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            color: 'var(--text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            margin: 0,
            paddingBottom: 4,
            borderBottom: '1px solid var(--border)',
          }}
        >
          {copy.ciHelpTokenTitle}
        </h3>
        <div
          style={{
            background: 'var(--surface-secondary)',
            borderRadius: 6,
            padding: '10px 12px',
            marginTop: 8,
          }}
        >
          <h4
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: '0 0 6px',
            }}
          >
            {copy.ciHelpTokenWhyNeed}
          </h4>
          <pre
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
              margin: 0,
              whiteSpace: 'pre-wrap',
              lineHeight: 1.6,
            }}
          >
            {copy.ciHelpTokenWhyNeedContent}
          </pre>
        </div>
        <div
          style={{
            background: 'var(--surface-secondary)',
            borderRadius: 6,
            padding: '10px 12px',
            marginTop: 8,
          }}
        >
          <h4
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: '0 0 6px',
            }}
          >
            {copy.ciHelpTokenSecurity}
          </h4>
          <pre
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
              margin: 0,
              whiteSpace: 'pre-wrap',
              lineHeight: 1.6,
            }}
          >
            {copy.ciHelpTokenSecurityContent}
          </pre>
        </div>
      </section>
    </div>
  );
}
