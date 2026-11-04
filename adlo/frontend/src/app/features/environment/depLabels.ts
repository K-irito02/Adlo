import type { CopyDict } from '@i18n';

/** 依赖 slug 的本地化展示名（toast/确认框插值必须用它，绝不直接拼接 wire slug）。 */
type DepLabelCopy = Pick<
  CopyDict,
  | 'environmentDepNode'
  | 'environmentDepGit'
  | 'environmentDepBash'
  | 'environmentDepWebview2'
  | 'environmentDepAdlserver'
  | 'environmentDepNet'
  | 'environmentDepModel'
>;

export function envDepLabel(t: DepLabelCopy, dep: string): string {
  switch (dep) {
    case 'node':
      return t.environmentDepNode;
    case 'git':
      return t.environmentDepGit;
    case 'bash':
      return t.environmentDepBash;
    case 'webview2':
      return t.environmentDepWebview2;
    case 'adlserver':
      return t.environmentDepAdlserver;
    case 'net':
      return t.environmentDepNet;
    case 'model':
      return t.environmentDepModel;
    default:
      return dep;
  }
}
