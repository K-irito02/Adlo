import envNode from './env-node.md?raw';
import envGitBash from './env-git-bash.md?raw';
import envWebview2 from './env-webview2.md?raw';
import envAdlserver from './env-adlserver.md?raw';
import envNetDownload from './env-net-download.md?raw';
import envModelCredential from './env-model-credential.md?raw';

export type RunbookKey =
  | 'env-node'
  | 'env-git-bash'
  | 'env-webview2'
  | 'env-adlserver'
  | 'env-net-download'
  | 'env-model-credential';

/**
 * Runbook 唯一真源：Markdown 经 `?raw` 打进前端包，桌面与浏览器模式行为一致。
 * `docs/runbooks/README.md` 只做索引，不复制正文（避免双份内容漂移）。
 */
export const RUNBOOKS: Record<RunbookKey, string> = {
  'env-node': envNode,
  'env-git-bash': envGitBash,
  'env-webview2': envWebview2,
  'env-adlserver': envAdlserver,
  'env-net-download': envNetDownload,
  'env-model-credential': envModelCredential,
};

/** 结构守卫与测试遍历用，顺序与依赖行一致。 */
export const RUNBOOK_KEYS = Object.keys(RUNBOOKS) as RunbookKey[];
