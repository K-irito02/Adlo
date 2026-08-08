export const DEMO_WORKSPACE_ID = 'workspace-demo';
export const DEMO_WORKSPACE_PATH = 'demo://workspace';
export const DEMO_WORKSPACE_NAME_MARKER = 'i18n:demoWorkspaceName';

export const DEMO_SESSION_IDS = {
  complete: 'demo-session-complete',
  plan: 'demo-session-plan',
  tools: 'demo-session-tools',
} as const;

export const DEMO_SESSION_TITLE_MARKERS = {
  complete: 'i18n:demoSessionCompleteTitle',
  plan: 'i18n:demoSessionPlanTitle',
  tools: 'i18n:demoSessionToolsTitle',
} as const;

export const DEMO_NOW = Date.now();

export const DEMO_DOCUMENTS: Record<string, string> = {
  'frontend/src/main.tsx': `import { createRoot } from 'react-dom/client';
import { App } from './app/App';

const container = document.getElementById('app');
if (!container) throw new Error('App root not found.');
createRoot(container).render(<App />);
`,
  'frontend/src/app/App.tsx': `export function App() {
  return <main>AI Digital Life</main>;
}
`,
  'README.md': `# AI Digital Life

一个基于 Rust + Tauri 的桌面应用。
`,
  'Resume/index.html': `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8"><title>简历</title></head>
  <body><h1>个人简历</h1></body>
</html>
`,
};
