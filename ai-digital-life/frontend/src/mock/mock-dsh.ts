import type {
  DshBridge,
  DshVersionStatus,
  DshSourceStatus,
} from "../shared/ipc/dsh";

const MOCK_VERSION = "0.1.0-rc.8";
const MOCK_VERSION_PREV = "0.1.0-rc.7";

const MOCK_STATUS: DshVersionStatus = {
  currentSelected: MOCK_VERSION,
  installed: [MOCK_VERSION, MOCK_VERSION_PREV],
  latestAvailable: "0.2.0",
  hasUpdate: true,
};

const MOCK_SOURCE_STATUS: DshSourceStatus = {
  bundled: { version: MOCK_VERSION, path: "/mock/bundled/dsh" },
  system: { path: "/usr/local/bin/dsh", version: MOCK_VERSION_PREV },
  running: null,
  config: {
    npm_registry: "https://registry.npmjs.org",
    dsh_mirror: null,
    proxy_mode: "auto",
  },
};

export const mockDsh: DshBridge = {
  open: async () => ({ ok: true, data: { url: "http://127.0.0.1:61234", freedPort: false } }),
  close: async (keep) => ({ ok: true, data: keep }),
  getVersionStatus: async () => ({ ok: true, data: MOCK_STATUS }),
  update: async () => ({ ok: true, data: MOCK_VERSION }),
  revert: async (version) => ({ ok: true, data: version }),
  uninstall: async () => ({ ok: true, data: true }),
  reinstall: async () => ({ ok: true, data: MOCK_VERSION }),
  getSourceStatus: async () => ({ ok: true, data: MOCK_SOURCE_STATUS }),
  saveSourceConfig: async () => ({ ok: true, data: true }),
  testSource: async () => ({
    ok: true,
    data: { reachable: true, latency_ms: 42, error: null },
  }),
};