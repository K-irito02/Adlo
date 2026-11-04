export type CenterTabKind = 'launcher' | 'browser' | 'terminal';

export interface CenterTabState {
  id: string;
  kind: CenterTabKind;
  /** browser: browserTabs.id；terminal: terminalTabs.id 或 null（选择器）；launcher: null */
  refId: string | null;
  createdAt: number;
}
