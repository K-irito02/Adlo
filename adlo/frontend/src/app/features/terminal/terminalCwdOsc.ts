/**
 * OSC 9;9 「当前目录上报」序列的解析工具。
 *
 * 为什么需要它：重启后我们启动的是一个**新 shell 进程**，进程里没有旧进程的目录状态，
 * 因此 `cd` 的结果无法被继承，终端提示符的路径与历史结尾对不上。
 * 业界（Windows Terminal / VS Code）的解决办法是让 shell 每次打印提示符前，用
 * **OSC 9;9**（`ESC ] 9 ; 9 ; <目录> ST|BEL`）把当前目录报给终端，终端记住它，
 * 下次为该标签起 shell 时把起始目录设回去。
 *
 * xterm 只注册了 OSC `0/1/2/4/8/10-12/104/110-112`，OSC 9 会落到 fallback 分支
 * （仅写调试日志），因此该序列**不会显示成乱码**。
 */

const OSC99_PREFIX = '\u001b]9;9;';
/** 未终止片段的保留上限，避免异常输入把 carry 撑大 */
const MAX_CARRY = 64;

export interface Osc99ScanResult {
  /** 本块中解析出的目录（按出现顺序） */
  cwds: string[];
  /** 未终止的尾部片段，需与下一块拼接后再解析 */
  carry: string;
}

/**
 * 扫描一块 PTY 输出中的 OSC 9;9 序列。
 * 序列可能跨块截断（输出按 4KB 分块读取），因此返回 `carry` 供下一次拼接。
 */
export function scanOsc99(raw: string): Osc99ScanResult {
  const cwds: string[] = [];
  let index = 0;
  for (;;) {
    const start = raw.indexOf(OSC99_PREFIX, index);
    if (start === -1) {
      break;
    }
    const payloadStart = start + OSC99_PREFIX.length;
    let end = -1;
    for (let i = payloadStart; i < raw.length; i += 1) {
      const ch = raw[i];
      if (ch === '\u0007') {
        // BEL 终止符
        end = i;
        break;
      }
      if (ch === '\u001b' && raw[i + 1] === '\\') {
        // ST（ESC \）终止符
        end = i;
        break;
      }
    }
    if (end === -1) {
      // 序列被截断：整段留到下一块（带上前缀，便于直接再匹配）
      return { cwds, carry: raw.slice(start, start + MAX_CARRY) };
    }
    cwds.push(raw.slice(payloadStart, end));
    index = end + 1;
  }
  // 末尾可能只是半个前缀（例如 `\u001b]9`）：取「最长的、作为前缀子串的后缀」留到下一块
  let carry = '';
  const maxLen = Math.min(OSC99_PREFIX.length - 1, raw.length);
  for (let len = maxLen; len > 0; len -= 1) {
    const suffix = raw.slice(raw.length - len);
    if (OSC99_PREFIX.startsWith(suffix)) {
      carry = suffix;
      break;
    }
  }
  return { cwds, carry };
}

const WINDOWS_ABS_PATH = /^[a-zA-Z]:[\\/]/;

/**
 * MSYS / Git-Bash 路径转 Windows 路径：
 * `/e/AI-DIGITAL-LIFE/SourceWorkspace` → `E:\AI-DIGITAL-LIFE\SourceWorkspace`，`/e` → `E:\`。
 * 不匹配（例如 WSL 的 `/mnt/c/...`、或 `~`）时返回 `null`，表示无法转换。
 *
 * Git Bash 的 `$PWD` 是 MSYS 形式，在前端转换可以避免为每个提示符启动一次 `cygpath` 进程。
 */
export function msysPathToWindows(msysPath: string): string | null {
  const match = /^\/([a-zA-Z])(?:\/(.*))?$/.exec(msysPath);
  if (!match) {
    return null;
  }
  const drive = match[1].toUpperCase();
  const rest = (match[2] ?? '')
    .split('/')
    .filter((segment) => segment.length > 0)
    .join('\\');
  return rest ? `${drive}:\\${rest}` : `${drive}:\\`;
}

/**
 * 把 shell 上报的原始目录规范化为可用的 Windows 绝对路径。
 * 无法确认时返回 `null`（宁可不恢复，也不要把无效目录交给 spawn）。
 */
export function normalizeReportedCwd(raw: string, options: { msys: boolean }): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (WINDOWS_ABS_PATH.test(trimmed)) {
    return trimmed;
  }
  return options.msys ? msysPathToWindows(trimmed) : null;
}
