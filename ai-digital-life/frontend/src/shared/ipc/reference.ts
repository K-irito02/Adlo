import type { IpcResult, ReferenceItem, ReferenceKind } from '@ai-digital-life/kernel';

export type { IpcResult, ReferenceItem, ReferenceKind };

export type ReferenceSource = 'local' | 'git';

export interface ReferenceConfig {
  name: string;
  source: ReferenceSource;
  path: string;
  branch?: string | null;
  enabled: boolean;
}

export interface ReferenceBridge {
  listReferences(dataDir: string): Promise<IpcResult<ReferenceConfig[]>>;
  addReference(dataDir: string, reference: ReferenceConfig): Promise<IpcResult<ReferenceConfig[]>>;
  removeReference(dataDir: string, name: string): Promise<IpcResult<ReferenceConfig[]>>;
  getReferencesPrompt(dataDir: string): Promise<IpcResult<string>>;
}
