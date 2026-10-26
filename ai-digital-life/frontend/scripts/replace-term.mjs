/**
 * 确定性批量替换：逐字匹配（无正则、无 shell 管道），UTF-8 读写，
 * 行尾符按原样保留；任一文件零命中即失败（防拼写错误静默通过）。
 *
 * 背景：shell 内联替换会破坏 CJK 并静默失效（见 .agents/rules/shell-encoding.md），
 * edit 工具逐处改在跨文件改名时 token 成本高。本脚本是两者之间的官方通道。
 *
 * 用法（在 ai-digital-life/frontend 下执行）：
 *   node scripts/replace-term.mjs --pairs <pairs.json> [--dry-run]
 * pairs JSON 形如：
 *   { "replacements": [{ "from": "手动路径", "to": "指定路径" }],
 *     "files": ["src/app/foo.ts", "src/app/bar.tsx"] }
 * 文件路径相对于执行目录；--dry-run 只报告不写盘。
 */
import fs from 'node:fs';
import path from 'node:path';

export function replaceInText(text, replacements) {
  let out = text;
  const counts = replacements.map(({ from, to }) => {
    if (!from) throw new Error('empty "from" is not allowed');
    const hits = out.split(from).length - 1;
    if (hits > 0) out = out.split(from).join(to);
    return hits;
  });
  return { out, counts, total: counts.reduce((a, b) => a + b, 0) };
}

export function replaceInFiles(files, replacements, { dryRun = false } = {}) {
  const report = [];
  let failed = false;
  for (const file of files) {
    const full = path.resolve(file);
    if (!fs.existsSync(full)) {
      report.push({ file, ok: false, reason: 'missing file' });
      failed = true;
      continue;
    }
    const before = fs.readFileSync(full, 'utf8');
    const { out, total } = replaceInText(before, replacements);
    if (total === 0) {
      report.push({ file, ok: false, reason: 'zero replacements (typo?)' });
      failed = true;
      continue;
    }
    if (!dryRun && out !== before) fs.writeFileSync(full, out, 'utf8');
    report.push({ file, ok: true, total });
  }
  return { report, failed };
}

function parseArgs(argv) {
  const out = { pairs: null, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--pairs') out.pairs = argv[(i += 1)];
    else if (argv[i] === '--dry-run') out.dryRun = true;
    else throw new Error(`unknown arg: ${argv[i]}`);
  }
  if (!out.pairs) throw new Error('missing required --pairs <json>');
  return out;
}

import { pathToFileURL } from 'node:url';

const invokedDirectly =
  !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  try {
    const { pairs, dryRun } = parseArgs(process.argv.slice(2));
    const { replacements = [], files = [] } = JSON.parse(fs.readFileSync(pairs, 'utf8'));
    if (replacements.length === 0 || files.length === 0) {
      throw new Error('pairs JSON needs non-empty "replacements" and "files"');
    }
    const { report, failed } = replaceInFiles(files, replacements, { dryRun });
    for (const row of report) {
      console.log(
        row.ok ? `  ok  ${row.file} (${row.total})` : `  FAIL ${row.file}: ${row.reason}`,
      );
    }
    if (failed) {
      console.log('[replace-term] failed');
      process.exit(1);
    }
    console.log(`[replace-term] OK${dryRun ? ' (dry run)' : ''}`);
  } catch (error) {
    console.log(`[replace-term] error: ${error.message}`);
    process.exit(1);
  }
}
