const sectionH3: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  fontWeight: 600,
  color: 'var(--text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  margin: 0,
  paddingBottom: 4,
  borderBottom: '1px solid var(--border)',
};

const card: React.CSSProperties = {
  background: 'var(--surface-secondary)',
  borderRadius: 6,
  padding: '10px 12px',
  marginTop: 8,
};

const cardH4: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  fontWeight: 600,
  color: 'var(--text-primary)',
  margin: '0 0 6px',
};

const body: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-secondary)',
  margin: 0,
  lineHeight: 1.5,
};

const pre: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-secondary)',
  margin: 0,
  whiteSpace: 'pre-wrap',
  lineHeight: 1.6,
};

const labelRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 6,
};

const labelDot: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: '50%',
  flexShrink: 0,
};

export function HelpView({ copy }: { copy: Record<string, string> }) {
  return (
    <div style={{ padding: 12 }}>
      {/* ==================== 面板布局与操作 ==================== */}
      <section id="gh-help-layout" style={{ marginBottom: 16 }}>
        <h3 style={sectionH3}>{copy.ciHelpLayoutTitle}</h3>
        <p style={{ ...body, marginTop: 8 }}>{copy.ciHelpLayoutOverview}</p>

        <div id="gh-help-layout-navigator" style={card}>
          <h4 style={cardH4}>{copy.ciHelpLayoutNavigator}</h4>
          <p style={body}>{copy.ciHelpLayoutNavigatorDesc}</p>
        </div>

        <div id="gh-help-layout-primary" style={card}>
          <h4 style={cardH4}>{copy.ciHelpLayoutPrimary}</h4>
          <p style={body}>{copy.ciHelpLayoutPrimaryDesc}</p>
        </div>

        <div id="gh-help-layout-toolbar" style={card}>
          <h4 style={cardH4}>{copy.ciHelpLayoutToolbar}</h4>
          <p style={body}>{copy.ciHelpLayoutToolbarDesc}</p>
        </div>
      </section>

      {/* ==================== 基础使用 ==================== */}
      <section id="gh-help-basic" style={{ marginBottom: 16 }}>
        <h3 style={sectionH3}>{copy.ciHelpBasicTitle}</h3>

        <div id="gh-help-how-to-config" style={card}>
          <h4 style={cardH4}>{copy.ciHelpHowToConfig}</h4>
          <p style={body}>{copy.ciHelpHowToConfigContent}</p>
          <div style={{ marginTop: 8, ...body }}>
            <strong>{copy.ciHelpConfigStepsLabel}</strong>
          </div>
          <ol className="adl-github-help__list">
            <li>{copy.ciHelpConfigStep1}</li>
            <li>{copy.ciHelpConfigStep2}</li>
            <li>{copy.ciHelpConfigStep3}</li>
            <li>{copy.ciHelpConfigStep4}</li>
          </ol>
        </div>

        <div id="gh-help-status-colors" style={card}>
          <h4 style={cardH4}>{copy.ciHelpStatusColors}</h4>
          <div style={labelRow}>
            <span style={{ ...labelDot, background: '#2da44e' }} />
            <span style={body}>{copy.ciHelpColorGreen}</span>
          </div>
          <div style={labelRow}>
            <span style={{ ...labelDot, background: '#cf222e' }} />
            <span style={body}>{copy.ciHelpColorRed}</span>
          </div>
          <div style={labelRow}>
            <span style={{ ...labelDot, background: '#d4a72c' }} />
            <span style={body}>{copy.ciHelpColorYellow}</span>
          </div>
          <div style={labelRow}>
            <span style={{ ...labelDot, background: '#656d76' }} />
            <span style={body}>{copy.ciHelpColorGray}</span>
          </div>
        </div>

        <div id="gh-help-view-logs" style={card}>
          <h4 style={cardH4}>{copy.ciHelpViewLogs}</h4>
          <p style={body}>{copy.ciHelpViewLogsContent}</p>
          <ul className="adl-github-help__list">
            <li>{copy.ciHelpLogFeatureAnsi}</li>
            <li>{copy.ciHelpLogFeatureSearch}</li>
            <li>{copy.ciHelpLogFeatureCollapse}</li>
            <li>{copy.ciHelpLogFeatureGithub}</li>
          </ul>
        </div>

        <div id="gh-help-basic-autorefresh" style={card}>
          <h4 style={cardH4}>{copy.ciHelpBasicAutoRefresh}</h4>
          <p style={body}>{copy.ciHelpBasicAutoRefreshContent}</p>
        </div>

        <div id="gh-help-multi-workspace" style={card}>
          <h4 style={cardH4}>{copy.ciHelpMultiWorkspace}</h4>
          <p style={body}>{copy.ciHelpMultiWorkspaceContent}</p>
        </div>
      </section>

      {/* ==================== 进阶概念 ==================== */}
      <section id="gh-help-concepts" style={{ marginBottom: 16 }}>
        <h3 style={sectionH3}>{copy.ciHelpConceptsTitle}</h3>
        <div
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-secondary)',
            marginTop: 8,
            lineHeight: 1.6,
          }}
        >
          <div id="gh-help-concept-workflow" style={card}>
            <h4 style={cardH4}>
              <strong>{copy.ciHelpConceptWorkflowLabel}</strong>
            </h4>
            <p style={body}>{copy.ciHelpConceptWorkflowDef}</p>
            <p style={{ ...body, marginTop: 4, fontStyle: 'italic', opacity: 0.7 }}>
              {copy.ciHelpConceptWorkflowAnalogy}
            </p>
          </div>
          <div id="gh-help-concept-job" style={card}>
            <h4 style={cardH4}>
              <strong>{copy.ciHelpConceptJobLabel}</strong>
            </h4>
            <p style={body}>{copy.ciHelpConceptJobDef}</p>
            <p style={{ ...body, marginTop: 4, fontStyle: 'italic', opacity: 0.7 }}>
              {copy.ciHelpConceptJobAnalogy}
            </p>
          </div>
          <div id="gh-help-concept-step" style={card}>
            <h4 style={cardH4}>
              <strong>{copy.ciHelpConceptStepLabel}</strong>
            </h4>
            <p style={body}>{copy.ciHelpConceptStepDef}</p>
            <p style={{ ...body, marginTop: 4, fontStyle: 'italic', opacity: 0.7 }}>
              {copy.ciHelpConceptStepAnalogy}
            </p>
          </div>
          <div id="gh-help-concept-run" style={card}>
            <h4 style={cardH4}>
              <strong>{copy.ciHelpConceptRunLabel}</strong>
            </h4>
            <p style={body}>{copy.ciHelpConceptRunDef}</p>
            <p style={{ ...body, marginTop: 4, fontStyle: 'italic', opacity: 0.7 }}>
              {copy.ciHelpConceptRunAnalogy}
            </p>
          </div>
          <div id="gh-help-concept-conclusion" style={card}>
            <h4 style={cardH4}>
              <strong>{copy.ciHelpConceptConclusion}</strong>
            </h4>
            <p style={body}>{copy.ciHelpConceptConclusionDef}</p>
            <p style={{ ...body, marginTop: 4, fontStyle: 'italic', opacity: 0.7 }}>
              {copy.ciHelpConceptConclusionAnalogy}
            </p>
          </div>
          <div id="gh-help-concept-status" style={card}>
            <h4 style={cardH4}>
              <strong>{copy.ciHelpConceptStatus}</strong>
            </h4>
            <p style={body}>{copy.ciHelpConceptStatusDef}</p>
            <p style={{ ...body, marginTop: 4, fontStyle: 'italic', opacity: 0.7 }}>
              {copy.ciHelpConceptStatusAnalogy}
            </p>
          </div>
        </div>
      </section>

      {/* ==================== 故障排查 ==================== */}
      <section id="gh-help-troubleshooting" style={{ marginBottom: 16 }}>
        <h3 style={sectionH3}>{copy.ciHelpTroubleshootingTitle}</h3>

        <div id="gh-help-trouble-noruns" style={card}>
          <h4 style={cardH4}>{copy.ciHelpTroubleNoRuns}</h4>
          <p style={body}>
            <strong>{copy.ciHelpTroubleCauseLabel}</strong>
            {copy.ciHelpTroubleNoRunsCause}
          </p>
          <p style={{ ...body, marginTop: 4 }}>
            <strong>{copy.ciHelpTroubleSolutionLabel}</strong>
            {copy.ciHelpTroubleNoRunsSolution}
          </p>
        </div>

        <div id="gh-help-trace-ratelimit" style={card}>
          <h4 style={cardH4}>{copy.ciHelpTroubleRateLimit}</h4>
          <p style={body}>
            <strong>{copy.ciHelpTroubleCauseLabel}</strong>
            {copy.ciHelpTroubleRateLimitCause}
          </p>
          <p style={{ ...body, marginTop: 4 }}>
            <strong>{copy.ciHelpTroubleSolutionLabel}</strong>
            {copy.ciHelpTroubleRateLimitSolution}
          </p>
        </div>

        <div id="gh-help-trouble-autorefresh" style={card}>
          <h4 style={cardH4}>{copy.ciHelpTroubleNoAutoRefresh}</h4>
          <p style={body}>
            <strong>{copy.ciHelpTroubleCauseLabel}</strong>
            {copy.ciHelpTroubleNoAutoRefreshCause}
          </p>
          <p style={{ ...body, marginTop: 4 }}>
            <strong>{copy.ciHelpTroubleSolutionLabel}</strong>
            {copy.ciHelpTroubleNoAutoRefreshSolution}
          </p>
        </div>

        <div id="gh-help-trouble-incomplete" style={card}>
          <h4 style={cardH4}>{copy.ciHelpTroubleIncompleteInfo}</h4>
          <p style={body}>
            <strong>{copy.ciHelpTroubleCauseLabel}</strong>
            {copy.ciHelpTroubleIncompleteInfoCause}
          </p>
          <p style={{ ...body, marginTop: 4 }}>
            <strong>{copy.ciHelpTroubleSolutionLabel}</strong>
            {copy.ciHelpTroubleIncompleteInfoSolution}
          </p>
        </div>
      </section>

      {/* ==================== GitHub Token 配置 ==================== */}
      <section id="gh-help-token" style={{ marginBottom: 16 }}>
        <h3 style={sectionH3}>{copy.ciHelpTokenTitle}</h3>

        <div id="gh-help-token-why" style={card}>
          <h4 style={cardH4}>{copy.ciHelpTokenWhyNeed}</h4>
          <pre style={pre}>{copy.ciHelpTokenWhyNeedContent}</pre>
        </div>

        <div id="gh-help-token-scopes" style={card}>
          <h4 style={cardH4}>{copy.ciHelpTokenScopes}</h4>
          <ul style={{ ...body, margin: 0, paddingLeft: 20 }}>
            <li>{copy.ciHelpTokenScopePublic}</li>
            <li>{copy.ciHelpTokenScopePrivate}</li>
          </ul>
        </div>

        <div id="gh-help-token-steps" style={card}>
          <h4 style={cardH4}>{copy.ciHelpTokenSteps}</h4>
          <ol style={{ ...body, margin: 0, paddingLeft: 20 }}>
            <li>{copy.ciHelpTokenStep1}</li>
            <li>{copy.ciHelpTokenStep2}</li>
            <li>{copy.ciHelpTokenStep3}</li>
            <li>{copy.ciHelpTokenStep4}</li>
            <li>{copy.ciHelpTokenStep5}</li>
            <li>{copy.ciHelpTokenStep6}</li>
          </ol>
        </div>

        <div id="gh-help-token-old" style={card}>
          <h4 style={cardH4}>{copy.ciHelpTokenOldMethod}</h4>
          <pre style={pre}>{copy.ciHelpTokenOldMethodContent}</pre>
        </div>

        <div id="gh-help-token-security" style={card}>
          <h4 style={cardH4}>{copy.ciHelpTokenSecurity}</h4>
          <pre style={pre}>{copy.ciHelpTokenSecurityContent}</pre>
        </div>
      </section>
    </div>
  );
}
