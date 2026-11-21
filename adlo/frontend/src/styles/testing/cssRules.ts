/**
 * CSS 守卫测试共用的规则提取器 —— **单一真源**，测试文件禁止再复制本实现
 * （曾有两份逐字副本，口径单边演化会让「同口径」前提静默失效）。
 *
 * 注释感知：跳过出现在 CSS 注释里的选择器字样；规则体由调用方按需剥注释
 * （见 `settings-overlay-stacking.test.ts` 的 `ruleBodies`）。
 */
export function findRuleGroups(css: string, selector: string): string[] {
  const blocks: string[] = [];
  let from = 0;
  while (from < css.length) {
    const open = css.indexOf(selector, from);
    if (open === -1) {
      break;
    }
    from = open + selector.length;
    const lastCommentEnd = css.lastIndexOf('*/', open);
    const lastCommentStart = css.lastIndexOf('/*', open);
    if (lastCommentStart > lastCommentEnd) {
      continue;
    }
    const prev = open === 0 ? '' : css[open - 1];
    if (prev && !/[\s,{>+~]/.test(prev)) {
      continue;
    }
    const groupStart = Math.max(css.lastIndexOf('}', open), css.lastIndexOf(';', open)) + 1;
    const bodyStart = css.indexOf('{', open);
    if (bodyStart === -1) {
      break;
    }
    let depth = 1;
    let i = bodyStart + 1;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') {
        depth += 1;
      } else if (css[i] === '}') {
        depth -= 1;
      }
      i += 1;
    }
    blocks.push(css.slice(groupStart, i));
  }
  return blocks;
}

/**
 * 只取第一处命中规则的**规则体**（不含选择器与花括号）；不存在返回 null。
 *
 * 与 [`findRuleGroups`] 同源（同一套注释/边界判定），供只关心声明的用例使用。
 */
export function ruleBody(css: string, selector: string): string | null {
  const block = findRuleGroups(css, selector)[0];
  if (!block) {
    return null;
  }
  const open = block.indexOf('{');
  const close = block.lastIndexOf('}');
  return open === -1 || close === -1 ? null : block.slice(open + 1, close);
}

/**
 * 选择器与传入值**完全一致**的规则体（排除 `:hover:not(:disabled)` 等复合变体）。
 * 与 `ruleBody` 同源（同一套注释/边界判定），供需要区分前缀选择器的负向断言使用。
 */
export function exactRuleBody(css: string, selector: string): string | null {
  const block = findRuleGroups(css, selector).find((candidate) => {
    // 组起点可能带上前一条规则后的注释（如 `/* 摘要卡片 */\n.selector`）；
    // 剥离注释后再比较，使带前置注释的选择器也能命中。
    const text = candidate
      .slice(0, candidate.indexOf('{'))
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim();
    return text === selector;
  });
  if (!block) {
    return null;
  }
  const open = block.indexOf('{');
  const close = block.lastIndexOf('}');
  return open === -1 || close === -1
    ? null
    : block.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, '');
}
