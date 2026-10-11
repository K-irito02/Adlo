// 开发阶段日志 CLI 参数解析：`pnpm dev:tauri -- --log-level trace` 等。
//
// 与 Rust 侧 `adl_logging::LogOverrides::from_cli_args` 保持同一套 flag → env 映射，
// 使「启动脚本 → Tauri 应用 / ad-server」与「应用自身解析 argv」两条路径语义一致。
// 取值合法性由 Rust 侧统一校验（非法值打印告警并忽略），此处只做透传。

export const LOG_FLAG_ENV = {
  '--log-level': 'ADL_LOG_LEVEL',
  '--terminal-log-mode': 'ADL_TERMINAL_LOG_MODE',
  '--debug-log-mode': 'ADL_DEBUG_LOG_MODE',
  // 兼容简写：同时设置终端与调试两个模式。
  '--log-mode': 'ADL_CLI_LOG_MODE',
};

/**
 * @param {string[]} argv 模式参数之后的透传参数（如 `process.argv.slice(3)`）
 * @param {(msg: string) => void} [warn]
 * @returns {{ env: Record<string,string>, restArgs: string[] }}
 *   - `env`：注入给子进程环境（shell 派生的 ad-server 会继承）——**唯一的传递通道**：
 *     `cargo tauri dev` 会把 `--` 之后的参数当作 cargo 参数（实测报
 *     `unexpected argument '--log-level'`），故不依赖 argv 透传。
 *   - `restArgs`：未消费的其余参数（原样转发给 Vite 等）
 */
export function parseLogFlags(argv, warn = console.warn) {
  const env = {};
  const restArgs = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const key = LOG_FLAG_ENV[arg];
    if (!key) {
      restArgs.push(arg);
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      warn(`[adl-run] ignoring ${arg} with no value`);
      continue;
    }
    env[key] = value;
    i += 1;
  }

  return { env, restArgs };
}

/**
 * 浏览器（Vite）前端可读的调试日志模式：`import.meta.env` 只暴露 `VITE_` 前缀，
 * 故把 CLI/env 覆盖映射为 `VITE_ADL_DEBUG_LOG_MODE`。
 */
export function debugLogModeForVite(env) {
  return env.ADL_DEBUG_LOG_MODE ?? env.ADL_CLI_LOG_MODE;
}