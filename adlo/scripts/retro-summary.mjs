#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export function parseSessionExport(input) {
  if (input && typeof input === "object") return input;
  const text = String(input ?? "");
  const start = text.indexOf("{");
  if (start < 0) throw new Error("invalid session export: JSON object not found");
  try {
    return JSON.parse(text.slice(start));
  } catch (error) {
    throw new Error(`invalid session export: ${error.message}`);
  }
}

function duration(tool) {
  const time = tool.state?.time ?? tool.time ?? {};
  return Number.isFinite(time.ran) && Number.isFinite(time.completed)
    ? time.completed - time.ran
    : 0;
}

export function summarizeSession(data, { since } = {}) {
  if (since !== undefined && (!Number.isFinite(since) || since < 0)) {
    throw new Error("--since must be a non-negative epoch milliseconds value");
  }
  const allMessages = data.messages ?? [];
  const messages =
    since === undefined
      ? allMessages
      : allMessages.filter((message) => (message.time?.created ?? 0) >= since);
  const tools = messages.flatMap((message) =>
    (message.content ?? [])
      .filter((item) => item.type === "tool")
      .map((item) => ({ message, ...item })),
  );
  const byType = {};
  const byName = {};
  const byStatus = {};
  let toolMs = 0;
  for (const message of messages) byType[message.type] = (byType[message.type] ?? 0) + 1;
  for (const tool of tools) {
    byName[tool.name] = (byName[tool.name] ?? 0) + 1;
    const status = tool.state?.status ?? "unknown";
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    toolMs += duration(tool);
  }
  const tokenPeaks = messages
    .filter((message) => message.tokens)
    .map((message) => ({
      id: message.id,
      type: message.type,
      created: message.time?.created,
      input: message.tokens.input ?? 0,
      output: message.tokens.output ?? 0,
      reasoning: message.tokens.reasoning ?? 0,
      cacheRead: message.tokens.cache?.read ?? 0,
    }))
    .sort((a, b) => b.input - a.input)
    .slice(0, 10);
  const slowest = tools
    .map((tool) => ({
      id: tool.id,
      name: tool.name,
      ms: duration(tool),
      created: tool.message.time?.created,
    }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 15);
  const errors = tools
    .filter((tool) => tool.state?.status === "error")
    .map((tool) => ({ id: tool.id, name: tool.name, created: tool.message.time?.created }));
  const repeats = [];
  for (let index = 0; index < tools.length; ) {
    let end = index + 1;
    while (end < tools.length && tools[end].name === tools[index].name) end++;
    if (end - index >= 3) {
      repeats.push({
        name: tools[index].name,
        count: end - index,
        start: tools[index].message.time?.created,
      });
    }
    index = end;
  }
  let consecutiveSameName = 0;
  for (let index = 1; index < tools.length; index++) {
    if (tools[index].name === tools[index - 1].name) consecutiveSameName++;
  }
  return {
    session: data.info ?? null,
    segmentStart: since ?? null,
    userTimes: messages
      .filter((message) => message.type === "user")
      .map((message) => ({ id: message.id, created: message.time?.created })),
    messages: messages.length,
    tools: tools.length,
    byType,
    byName,
    byStatus,
    toolMs,
    toolMinutes: Math.round(toolMs / 60_000),
    consecutiveSameName,
    shellOver60s: tools.filter((tool) => tool.name === "shell" && duration(tool) > 60_000).length,
    shellOver120s: tools.filter((tool) => tool.name === "shell" && duration(tool) > 120_000).length,
    errors,
    repeats: repeats.sort((a, b) => b.count - a.count).slice(0, 12),
    tokenPeaks,
    slowest,
  };
}

function main() {
  const argv = process.argv.slice(2);
  const file = argv[0];
  if (!file || file === "--help" || file === "-h") {
    console.log("Usage: node scripts/retro-summary.mjs <export-file> [--since <epoch-ms>]");
    return;
  }
  const sinceIndex = argv.indexOf("--since");
  const since = sinceIndex >= 0 ? Number(argv[sinceIndex + 1]) : undefined;
  const data = parseSessionExport(readFileSync(resolve(file), "utf8"));
  console.log(JSON.stringify(summarizeSession(data, { since }), null, 2));
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(`[retro-summary] ${error.message}`);
    process.exit(1);
  }
}
