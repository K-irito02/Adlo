#!/usr/bin/env node
/**
 * 网络/代理预检：长操作（git push、gh release、下载）之前先确认目标可达。
 *
 * 背景：2026-11-18 连续两次 `git push` 到 Gitee 各卡 2–5 分钟，而 Node fetch 到
 * 同一域名是通的——只有 git 走系统代理。先探一次能省下这类无谓等待。
 *
 * 用法：`pnpm run probe:net`（在 adlo/ 下）
 */
const PROBES = [
  { name: "gitee api", url: "https://gitee.com/api/v5/zen" },
  {
    name: "gitee git (info/refs)",
    url: "https://gitee.com/K_irito/Adlo.git/info/refs?service=git-upload-pack",
  },
  { name: "github api", url: "https://api.github.com/zen" },
  {
    name: "github git (info/refs)",
    url: "https://github.com/K-irito02/Adlo.git/info/refs?service=git-upload-pack",
  },
];

const TIMEOUT_MS = 8000;

async function probe({ name, url }) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "follow" });
    return { name, url, status: response.status, ms: Date.now() - started };
  } catch (error) {
    const reason =
      error?.name === "AbortError" ? `timeout ${TIMEOUT_MS}ms` : String(error?.message ?? error);
    return { name, url, status: `ERR (${reason})`, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

const proxy = ["HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY", "NO_PROXY"]
  .map((key) => `${key}=${process.env[key] ?? "-"}`)
  .join("  ");
console.log(`[probe:net] proxy env: ${proxy}`);

const results = await Promise.all(PROBES.map(probe));
for (const result of results) {
  console.log(
    `  ${result.name.padEnd(22)} ${String(result.status).padEnd(24)} ${result.ms}ms  ${result.url}`,
  );
}

const failed = results.filter(
  (result) => !String(result.status).startsWith("2") && !String(result.status).startsWith("3"),
);
if (failed.length > 0) {
  console.log(`[probe:net] ${failed.length} endpoint(s) unreachable — 长操作前先修网络/代理`);
  process.exitCode = 1;
}
