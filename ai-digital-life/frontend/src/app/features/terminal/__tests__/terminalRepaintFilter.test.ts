import { describe, expect, it } from 'vitest';
import { stripConptyRepaintBursts } from '../terminalRepaintFilter';

const ESC = '\x1b';
// 擦行单元：清行 + 换行（ConPTY 重绘时逐行擦除的形态）
const wipe = `${ESC}[K\r\n`;
// 完整爆发的头部：擦行游程 + 裸 [K + CUP + 显示光标 + 隐藏光标 + [H 归位
const head = (row: number) => `${ESC}[K${ESC}[${row};5H${ESC}[?25h${ESC}[?25l${ESC}[H`;
// 爆发尾部：CUP 恢复光标位置 + 显示光标
const tail = (row: number) => `${ESC}[${row};5H${ESC}[?25h`;

describe('stripConptyRepaintBursts', () => {
  it('对不含擦行序列的缓冲走快路径且原样返回', () => {
    const buffer = `${ESC}]0;title\x07PS D:\\> echo hi\r\nhi\r\n`;
    const result = stripConptyRepaintBursts(buffer);
    expect(result.bursts).toBe(0);
    expect(result.bytesRemoved).toBe(0);
    expect(result.text).toBe(buffer);
  });

  it('清洗完整重绘爆发（擦行游程 + 重发内容 + 尾部 CUP），保留真实输出', () => {
    const realOutput =
      'Microsoft Windows [版本 10.0.26200.9445]\r\n(c) Microsoft Corporation。保留所有权利。\r\n\r\nD:\\>';
    const burst =
      wipe.repeat(8) +
      head(5) +
      `Microsoft Windows [版本 10.0.26200.9445]${ESC}[K\r\n` +
      `(c) Microsoft Corporation。保留所有权利。${ESC}[K\r\n` +
      `${ESC}[K\r\nD:\\>${ESC}[K\r\n` +
      tail(5);
    const buffer = realOutput + burst;
    const result = stripConptyRepaintBursts(buffer);
    expect(result.bursts).toBe(1);
    expect(result.text).toBe(realOutput);
    expect(result.bytesRemoved).toBe(burst.length);
  });

  it('清洗「仅光标重定位」形态（擦行游程 + CUP + ?25h，无重发）', () => {
    const realOutput = 'PS D:\\> dir\r\n...output...\r\n';
    const burst = wipe.repeat(46) + `${ESC}[K${ESC}[4;16H${ESC}[?25h`;
    const buffer = realOutput + burst;
    const result = stripConptyRepaintBursts(buffer);
    expect(result.bursts).toBe(1);
    expect(result.text).toBe(realOutput);
  });

  it('重发被下一次 resize 截断时，吞并范围延伸到下一个爆发的头部', () => {
    const realOutput = 'D:\\>';
    const burst1 = wipe.repeat(6) + head(5) + `D:\\>${ESC}[K\r\nD:\\>${ESC}[K\r\n`;
    // 第二次 resize：重发没写完也没有尾部 CUP，直接又是一段擦行游程 + CUP 收尾
    const burst2 = wipe.repeat(6) + `${ESC}[K${ESC}[5;5H${ESC}[?25h`;
    const buffer = realOutput + burst1 + burst2;
    const result = stripConptyRepaintBursts(buffer);
    expect(result.bursts).toBe(2);
    expect(result.text).toBe(realOutput);
  });

  it('真实输出中零散的 [K\\r\\n（无 CUP+?25h 签名）不受影响', () => {
    const buffer = `line1${ESC}[K\r\n${ESC}[K\r\nline2${ESC}[K\r\nprogress ${ESC}[K\r\ndone\r\n`;
    const result = stripConptyRepaintBursts(buffer);
    expect(result.bursts).toBe(0);
    expect(result.text).toBe(buffer);
  });

  it('用户执行 cls 的 ESC[2J / ESC[H 不受影响', () => {
    const buffer = `PS D:\\> cls${ESC}[2J${ESC}[HPS D:\\> `;
    const result = stripConptyRepaintBursts(buffer);
    expect(result.bursts).toBe(0);
    expect(result.text).toBe(buffer);
  });

  it('清洗是幂等的', () => {
    const burst = wipe.repeat(4) + head(3) + `banner${ESC}[K\r\n` + tail(3);
    const once = stripConptyRepaintBursts(`abc${burst}`);
    const twice = stripConptyRepaintBursts(once.text);
    expect(twice.bursts).toBe(0);
    expect(twice.text).toBe(once.text);
  });

  it('多个独立爆发都能被清洗', () => {
    const mkBurst = (row: number) => wipe.repeat(5) + head(row) + `D:\\>${ESC}[K\r\n` + tail(row);
    // 注意：A 后面的擦行单元与爆发自己的游程在字节上无法区分，
    // 会作为游程的一部分被一并吞掉（只损失一个空行终止符，内容字符不受影响）
    const buffer = `A${ESC}[K\r\n` + mkBurst(4) + 'B\r\n' + mkBurst(6) + 'C';
    const result = stripConptyRepaintBursts(buffer);
    expect(result.bursts).toBe(2);
    expect(result.text).toBe('AB\r\nC');
  });
});
