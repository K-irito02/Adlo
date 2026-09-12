/**
 * ConPTY「整屏重绘爆发」清洗器（缓冲线性化）。
 *
 * 背景：ConPTY 自认视口所有者，在 PTY 尺寸变化等时机会向输出流插入
 * 「擦屏 + 光标定位 + 整屏重发」的重绘片段（microsoft/terminal 官方承认的
 * 行为，VS Code 文档称 "ConPTY will sometimes reprint the screen"）。
 *
 * 这类片段对「实时渲染」是必需的（xterm 实时解析即可正确显示，光标保持同步）；
 * 但混进「字节缓冲」后再被回放时就是纯垃圾：
 * - 大段 `\x1b[K\r\n` 空行游程会把已回放的内容整体滚出画面；
 * - 整屏重发会把 banner / 提示符再写一遍（用户看到的「两个提示符」）；
 * - CUP 绝对定位在回放上下文里指向错误位置（「顶部一部分、底部一部分」）。
 * 由于重绘只发生在尺寸真实变化时，症状表现为「随窗口大小而变」。
 *
 * 实测的重绘爆发字节形态（2026-09-12 DB 取证，Windows 11 26200）：
 *   `\x1b[K\r\n`×N + `\x1b[K`? + `\x1b[R;CH` + `\x1b[?25h`
 *   (+ `\x1b[?25l` + `\x1b[H` + 重发内容行(以 `\x1b[K\r\n` 分隔) + `\x1b[R;CH` + `\x1b[?25h`)?
 * 连续快速 resize 会把上一次的重发截断（重发内容直接流入下一段擦行游程，
 * 中间没有尾部 CUP），因此尾部缺失时以「下一个爆发的头部」为边界。
 *
 * 纯函数、幂等。只用于「回放 / 历史迁移 / 持久化」路径；
 * 实时写往 xterm 的数据保持原样，保证实时画面与光标同步不受影响。
 */

// 本文件的正则必须匹配 ESC（\x1b）等控制字符 —— 这是 VT 序列解析的本质需求，
// no-control-regex 规则在此属于误报，故整体豁免。
/* eslint-disable no-control-regex */
const BURST_HEAD =
  /(?:\x1b\[K\r\n){2,}\x1b\[K?\x1b\[\d+;\d+H\x1b\[\?25h(?:\x1b\[\?25l\x1b\[(?:H|1;1H))?/g;
const BURST_TAIL = /\x1b\[\d+;\d+H\x1b\[\?25h/g;
/* eslint-enable no-control-regex */

export interface RepaintStripResult {
  text: string;
  /** 清洗掉的重绘爆发个数 */
  bursts: number;
  /** 清洗掉的字节数 */
  bytesRemoved: number;
}

export function stripConptyRepaintBursts(buffer: string): RepaintStripResult {
  // 快路径：没有擦行序列就不可能存在重绘爆发
  if (!buffer.includes('\x1b[K')) {
    return { text: buffer, bursts: 0, bytesRemoved: 0 };
  }
  BURST_HEAD.lastIndex = 0;
  const heads: RegExpExecArray[] = [];
  for (let m = BURST_HEAD.exec(buffer); m !== null; m = BURST_HEAD.exec(buffer)) {
    heads.push(m);
  }
  if (heads.length === 0) {
    return { text: buffer, bursts: 0, bytesRemoved: 0 };
  }

  let out = '';
  let last = 0;
  let bursts = 0;
  for (let i = 0; i < heads.length; i += 1) {
    const head = heads[i];
    const start = head.index;
    if (start < last) {
      // 已被上一个爆发的吞并区间覆盖（重发内容流入下一段擦行游程的情形）
      continue;
    }
    let end = start + head[0].length;
    if (head[0].includes('\x1b[?25l')) {
      // 完整形态：头部带了重发起点（?25l + [H），寻找尾部（CUP + ?25h）
      BURST_TAIL.lastIndex = end;
      const tail = BURST_TAIL.exec(buffer);
      const nextHeadStart = i + 1 < heads.length ? heads[i + 1].index : -1;
      if (tail && (nextHeadStart === -1 || tail.index + tail[0].length <= nextHeadStart)) {
        end = tail.index + tail[0].length;
      } else if (nextHeadStart !== -1) {
        // 重发被下一次 resize 截断（无尾部 CUP）：吞到下一个爆发的头部为止，
        // 重发内容是屏幕状态的副本，原本就已在缓冲更早的位置存在
        end = nextHeadStart;
      }
      // 尾部与下一个头部都不存在：只吞头部（保守——保留重发行，避免误删真实输出）
    }
    out += buffer.slice(last, start);
    last = end;
    bursts += 1;
  }
  out += buffer.slice(last);
  return { text: out, bursts, bytesRemoved: buffer.length - out.length };
}
