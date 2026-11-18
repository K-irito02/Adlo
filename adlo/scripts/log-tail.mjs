#!/usr/bin/env node
/**
 * 日志检索（唯一被允许的日志过滤入口）。
 *
 * 为什么需要它：项目规则禁止 `Select-String`（会把 UTF-8 中文打成 GBK 乱码），
 * 但运行日志动辄上万行、且含大段 JSON；整段 tail 既慢又占上下文。
 * 本脚本在 Node 里按 UTF-8 读取并过滤，输出行号 + 命中行，兼得安全与精简。
 *
 * 用法：
 *   node scripts/log-tail.mjs --file ../.adl-logs/terminal-logs.txt --grep "ERROR|update" --tail 40
 *   node scripts/log-tail.mjs --file ../adlo/.adl-logs/adl-server-logs.txt --grep "workspace_get_git_status"
 */
import { readFileSync, statSync } from "node:fs";
import process from "node:process";

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const file = arg("--file");
if (!file) {
  console.error("usage: node scripts/log-tail.mjs --file <path> [--grep <regex>] [--tail 80]");
  process.exit(1);
}

const pattern = arg("--grep");
const tail = Number(arg("--tail", "80"));
if (!Number.isFinite(tail) || tail <= 0) {
  console.error("--tail must be a positive number");
  process.exit(1);
}

let regex = null;
if (pattern) {
  try {
    regex = new RegExp(pattern);
  } catch (error) {
    console.error(`invalid --grep regex: ${error.message}`);
    process.exit(1);
  }
}

const size = statSync(file).size;
const content = readFileSync(file, "utf8");
const lines = content.split(/\r?\n/);
const matched = [];
lines.forEach((line, index) => {
  if (!regex || regex.test(line)) {
    matched.push({ index: index + 1, line });
  }
});

for (const item of matched.slice(-tail)) {
  console.log(`${item.index}: ${item.line}`);
}
console.log(
  `[log-tail] ${file} (${(size / 1024).toFixed(1)} KiB, ${lines.length} lines) → ${matched.length} matched, showing ${Math.min(matched.length, tail)}`,
);
