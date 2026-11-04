/**
 * `vite.config.ts` 冒烟：真实走一遍 Vite 的配置加载（esbuild 打包 + 模块解析）。
 *
 * 为什么需要：`vite.config.ts` 此前既不在 `tsc` 的 include、也被 eslint 忽略，
 * 2026-10-25 曾把 `../scripts` 写成 `../../scripts`——所有静态门禁全绿，
 * 直到人工审查才发现，实际会让 `dev:tauri` / `dev:preview` / `frontend:build` 全部起不来。
 */
import { loadConfigFromFile } from 'vite';

const result = await loadConfigFromFile(
  { command: 'serve', mode: 'development' },
  'vite.config.ts',
  process.cwd(),
);

const server = result?.config?.server;
if (!result?.config || !server || typeof server.port !== 'number') {
  console.error('[check:vite-config] FAILED: config did not load or is missing server.port');
  process.exit(1);
}

console.log(`[check:vite-config] ok host=${server.host ?? '(unset)'} port=${server.port}`);
