import type { EnvBridge } from '../shared/ipc/env';

/**
 * Tauri env bridge: delegates the environment-dependency management
 * (`GET /env/status` + `POST /env/*`) to the ad-server HTTP routes via the
 * httpBridge `env` domain — the same passthrough pattern as `tauri-dsh.ts`
 * (no dedicated Tauri `env_*` invoke commands; the desktop owns no env
 * shell capability beyond what ad-server serves).
 *
 * @param httpEnv the httpBridge env domain (business routes against ad-server)
 */
export function createTauriEnvBridge(httpEnv: EnvBridge): EnvBridge {
  return {
    getStatus: () => httpEnv.getStatus(),
    install: httpEnv.install,
    uninstall: httpEnv.uninstall,
    selectSource: httpEnv.selectSource,
    setCustomPath: httpEnv.setCustomPath,
    recheck: httpEnv.recheck,
  };
}
