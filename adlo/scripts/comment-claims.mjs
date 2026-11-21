/**
 * 注释断言启发式（`review-snapshot` 与 `check:comment-claims` 共用）。
 *
 * 背景（2026-11-21 retro）：P4 R1 连续多轮的后半场都在核「注释说 X、代码是 Y」。
 * `review-snapshot` 原本把这条压到审查前（claims + ack），但它是「确认制」：
 * 作者只需要勾选，不会在写代码时被提醒。这里把同一套启发式抽出来，让日常门禁
 * 在**新增注释**出现绝对/计数断言时先失败，把整类发现挡在审查之前。
 *
 * 只覆盖代码注释（`.md` 由 P5 文档审查负责）；行级 `claim-allow` 可显式放行。
 */

/** 注释里的「绝对断言」：默认门控，确认后由 claims-ack / claim-allow 放行。 */
export const CLAIM_PATTERN =
  /必然|总是|永远|从不|唯一|一定|不可达|不会走到|所有[^，。；]*都|全部[^，。；]*都|都会|一律|always|never|unreachable/i;

/** 「数字断言」：注释/文案里的计数容易随代码漂移，与绝对断言同等门控。 */
export const NUMERIC_CLAIM_PATTERN =
  /\b\d+\s*(?:files?|tests?|passed)\b|\d+\s*个(?:用例|测试|文件|入口|步骤)|上限\s*\d+/i;

/** 行级放行标记：`// claim-allow: <证据或理由>`。 */
export const CLAIM_ALLOW_MARKER = "claim-allow";

const COMMENT_LINE_PATTERN = /^\s*(\/\/|\/\*|\*|<!--|#(?![![]))/;

export function isCommentLine(text) {
  return COMMENT_LINE_PATTERN.test(text);
}

/** `absolute` | `numeric` | `null`；`claim-allow` 行返回 null。 */
export function claimKind(text) {
  if (text.includes(CLAIM_ALLOW_MARKER)) {
    return null;
  }
  if (CLAIM_PATTERN.test(text)) {
    return "absolute";
  }
  if (NUMERIC_CLAIM_PATTERN.test(text)) {
    return "numeric";
  }
  return null;
}

/**
 * 解析 `git diff -U0` 的新增行，只挑注释里的断言。
 *
 * 入参是**单个文件**的 diff 文本；返回 `{ file, line, text, kind }`。
 * 行号从 hunk 头的 `+<start>` 起算，与最终文件一致。
 */
export function parseDiffClaims(diffText, file) {
  const hits = [];
  let newLine = 0;
  for (const raw of diffText.split(/\r?\n/)) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (raw.startsWith("+++") || raw.startsWith("---") || raw.startsWith("\\")) {
      continue;
    }
    if (raw.startsWith("+")) {
      const text = raw.slice(1);
      const kind = isCommentLine(text) ? claimKind(text) : null;
      if (kind) {
        hits.push({ file, line: newLine, text: text.trim(), kind });
      }
      newLine += 1;
    } else if (!raw.startsWith("-")) {
      newLine += 1;
    }
  }
  return hits;
}

/** 扫描整份新文件（未跟踪文件在 diff 里看不到）。 */
export function scanFileClaims(content, file) {
  const hits = [];
  content.split(/\r?\n/).forEach((text, index) => {
    const kind = isCommentLine(text) ? claimKind(text) : null;
    if (kind) {
      hits.push({ file, line: index + 1, text: text.trim(), kind });
    }
  });
  return hits;
}

/**
 * 把一份完整 `git diff` 拆成「单个文件」的块。
 *
 * 入参是 `git diff -U0` 的整体输出；返回 `{ file, text }[]`，`file` 取自
 * `+++ b/<path>`（已按 `core.quotepath=false` 取原始路径）。一次 git 调用即可
 * 覆盖全部文件，避免逐个文件 spawn（改动 200+ 文件时差异明显）。
 */
export function splitDiffByFile(diffText) {
  const chunks = [];
  let current = null;
  for (const line of diffText.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      if (current) {
        chunks.push(current);
      }
      current = { file: null, text: `${line}\n` };
      continue;
    }
    if (!current) {
      continue;
    }
    current.text += `${line}\n`;
    if (!current.file && line.startsWith("+++ b/")) {
      // 含空格的路径由 git 追加 tab 分隔；去掉时间戳/尾注。
      current.file = line.slice("+++ b/".length).split("\t")[0];
    }
  }
  if (current) {
    chunks.push(current);
  }
  return chunks.filter((chunk) => typeof chunk.file === "string");
}

/** 统一输出格式：`file:line [kind] text`。 */
export function formatClaim(hit) {
  return `${hit.file}:${hit.line} [${hit.kind}] ${hit.text}`;
}
