import type { ReferenceBridge, ReferenceConfig } from "../shared/ipc/reference";

export const mockReference: ReferenceBridge = {
  listReferences: async (_dataDir) => ({
    ok: true,
    data: [
      {
        name: 'opencode',
        source: 'local' as const,
        path: '/references/opencode',
        branch: null,
        enabled: true,
      },
    ] satisfies ReferenceConfig[],
  }),
  addReference: async (_dataDir, reference) => ({
    ok: true,
    data: [reference] satisfies ReferenceConfig[],
  }),
  removeReference: async () => ({
    ok: true,
    data: [] satisfies ReferenceConfig[],
  }),
  getReferencesPrompt: async () => ({
    ok: true,
    data: 'Mock reference prompt with 1 reference loaded.',
  }),
};
