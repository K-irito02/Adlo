/**
 * CSS 选择器解析（供 check-dead-code 与单测共用）。
 *
 * 必须解析**完整样式表**：只看 git 补丁新增行时，未变更的规则选择器与花括号不在
 * 片段里，属性行会被拼成伪选择器（实测误报 “18 levels deep”）。
 */

/** 近似层级：去掉属性 [...] 与函数 (...) 内容后，按空白/组合子切分计数。 */
export function selectorDepth(selector) {
  const stripped = selector.replace(/\[[^\]]*\]/g, '[]').replace(/\([^()]*\)/g, '()');
  return stripped.split(/[\s>+~]+/).filter((part) => part && part !== '*').length;
}

export function extractSelectors(cssText) {
  const out = new Set();
  const withoutComments = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of withoutComments.matchAll(/([^{}]+)\{/g)) {
    const group = match[1].trim();
    if (!group || group.startsWith('@')) continue;
    for (const selector of group.split(',')) {
      const normalized = selector.trim();
      if (normalized && !/^(from|to|\d+%)$/.test(normalized)) out.add(normalized);
    }
  }
  return out;
}

/** 当前文件中 base 不存在、且复合层级超过 maxDepth 的选择器。 */
export function deepSelectorsAdded(currentText, baseText, maxDepth = 3) {
  const baseSelectors = extractSelectors(baseText);
  return [...extractSelectors(currentText)]
    .filter((selector) => !baseSelectors.has(selector))
    .map((selector) => ({ selector, depth: selectorDepth(selector) }))
    .filter((entry) => entry.depth > maxDepth);
}
