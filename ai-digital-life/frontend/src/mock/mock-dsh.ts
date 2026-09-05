import type { DshBridge, DshVersionStatus } from "../shared/ipc/dsh";

const MOCK_VERSION = "0.1.0-rc.8";
const MOCK_VERSION_PREV = "0.1.0-rc.7";

const MOCK_STATUS: DshVersionStatus = {
  currentSelected: MOCK_VERSION,
  installed: [MOCK_VERSION, MOCK_VERSION_PREV],
  latestAvailable: "0.2.0",
  hasUpdate: true,
};

export const mockDsh: DshBridge = {
  open: async () => ({ ok: true, data: "http://127.0.0.1:61234" }),
  close: async (keep) => ({ ok: true, data: keep }),
  getVersionStatus: async () => ({ ok: true, data: MOCK_STATUS }),
  update: async () => ({ ok: true, data: MOCK_VERSION }),
  revert: async (version) => ({ ok: true, data: version }),
  uninstall: async () => ({ ok: true, data: true }),
  reinstall: async () => ({ ok: true, data: MOCK_VERSION }),
};