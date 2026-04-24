const DEFAULT_DEV_SERVER_URL = "http://127.0.0.1:5173/";

export function normalizeDevServerUrl(input = DEFAULT_DEV_SERVER_URL) {
  const value = (input || DEFAULT_DEV_SERVER_URL).trim() || DEFAULT_DEV_SERVER_URL;
  const url = new URL(value);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Desktop dev server URL must use http or https. Received: ${value}`);
  }

  if (!url.pathname || url.pathname === "") {
    url.pathname = "/";
  }

  return url.toString();
}

export function createElectronEnv(devServerUrl, baseEnv = process.env) {
  return sanitizeSpawnEnv({
    ...baseEnv,
    ADL_RENDERER_DEV_URL: normalizeDevServerUrl(devServerUrl),
    ELECTRON_DEV: "true"
  });
}

export function sanitizeSpawnEnv(env = process.env) {
  return Object.fromEntries(
    Object.entries(env).filter(([key, value]) => !key.startsWith("=") && value !== undefined)
  );
}

function quoteWindowsArg(value) {
  return /^[A-Za-z0-9_./:-]+$/.test(value) ? value : `"${String(value).replace(/"/g, '\\"')}"`;
}

export function resolveNpmSpawn(args, platform = process.platform) {
  if (platform === "win32") {
    return {
      command: `npm.cmd ${args.map(quoteWindowsArg).join(" ")}`,
      args: [],
      shell: true
    };
  }

  return {
    command: "npm",
    args: [...args],
    shell: false
  };
}

export { DEFAULT_DEV_SERVER_URL };
