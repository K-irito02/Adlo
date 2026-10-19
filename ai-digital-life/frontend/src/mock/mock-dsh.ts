import type {
  DshBridge,
  DshVersionCatalog,
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
  prereleaseAvailable: "0.2.1-rc.2",
  hasPrereleaseUpdate: true,
  // mock 为静态桩：目录接口恒返回上述固定数据，不模拟版本登记后的 installed 变化。
  prereleaseUnknown: false,
};

const MOCK_CATALOG: DshVersionCatalog = {
  stable: [
    { version: "0.2.0", publishedAt: "2026-09-29T09:56:27.000Z" },
    { version: "0.1.0", publishedAt: "2026-08-20T10:00:00.000Z" },
  ],
  prerelease: [{ version: "0.2.1-rc.2", publishedAt: "2026-10-17T08:36:31.000Z" }],
  latestStable: "0.2.0",
  latestPrerelease: "0.2.1-rc.2",
};

const MOCK_SOURCE_STATUS: DshSourceStatus = {
  bundled: { version: MOCK_VERSION, path: "/mock/bundled/dsh" },
  system: { path: "/usr/local/bin/dsh", version: MOCK_VERSION_PREV },
  running: null,
  config: {
    npm_registry: "https://registry.npmjs.org",
    dsh_mirror: null,
    source_mode: "auto",
    proxy: {
      mode: "auto",
      http_proxy: null,
      https_proxy: null,
      no_proxy: null,
    },
  },
};

export const mockDsh: DshBridge = {
  open: async () => ({ ok: true, data: { url: "http://127.0.0.1:61234", freedPort: false } }),
  getVersionStatus: async () => ({ ok: true, data: MOCK_STATUS }),
  getVersionCatalog: async () => ({ ok: true, data: MOCK_CATALOG }),
  installVersion: async (version) => ({ ok: true, data: version }),
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