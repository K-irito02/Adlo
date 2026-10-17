/**
 * Markdown 主题变量化生成器（事项 8 方案 A）。
 *
 * 背景：`github-markdown-css@5.9.0` 逐主题硬编码色（仅 ~8 处 var），换肤只能换文件；
 * VS Code 内核与社区方案证明"单一样式表 + 变量换肤"才是原子同步正解。
 * 本脚本以 light.css 为唯一结构基（已实证：去色/去变量引用后 6 文件结构逐字节一致，
 * 仅 `color-scheme` 一字之差），把颜色全部参数化为 `--md-*`，并输出 6 套变量定义。
 *
 * 运行：`node frontend/scripts/generate-md-theme-vars.mjs`
 * 输出：`frontend/src/styles/vendor/markdown-theme-vars.css`（构建期 `?inline` 进包）。
 * 映射表（SLOT_VAR / PRIMER_VAR / VAR_VALUE）为手写可审计真源；色值逐一核对自官方包；
 * 生成后脚本自动回代校验：把变量代回 6 主题与官方文件逐规则比对，不一致即报错。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.join(
  here,
  '..',
  'node_modules',
  'github-markdown-css',
);
const outFile = path.join(here, '..', 'src', 'styles', 'vendor', 'markdown-theme-vars.css');

const THEMES = [
  { id: 'light', file: 'github-markdown-light.css' },
  { id: 'light-colorblind', file: 'github-markdown-light-colorblind.css' },
  { id: 'dark', file: 'github-markdown-dark.css' },
  { id: 'dark-dimmed', file: 'github-markdown-dark-dimmed.css' },
  { id: 'dark-high-contrast', file: 'github-markdown-dark-high-contrast.css' },
  { id: 'dark-colorblind', file: 'github-markdown-dark-colorblind.css' },
];

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g;
const PRIMER_RE = /var\(--([a-zA-Z-]+)\)/g;

/** 槽位（selector || prop）→ 变量名。键与 `md-slots.json` 盘点一致。 */
const SLOT_VAR = {
  '.markdown-body .absent || color': '--md-danger-fg',
  '.markdown-body .csv-data .blob-num || background': '--md-canvas-default',
  '.markdown-body .csv-data th || background': '--md-canvas-muted',
  '.markdown-body .footnotes li:target || color': '--md-fg-default',
  '.markdown-body .footnotes li:target::before || border': '--md-accent-emphasis-border',
  '.markdown-body .footnotes || border-top': '--md-border-default-top',
  '.markdown-body .footnotes || color': '--md-fg-muted',
  '.markdown-body .highlight pre, .markdown-body pre || background-color': '--md-canvas-muted',
  '.markdown-body .highlight pre, .markdown-body pre || color': '--md-fg-default',
  '.markdown-body .markdown-alert || border-left': '--md-border-default-left',
  '.markdown-body .markdown-alert.markdown-alert-caution .markdown-alert-title || color':
    '--md-danger-fg',
  '.markdown-body .markdown-alert.markdown-alert-caution || border-left-color':
    '--md-danger-emphasis',
  '.markdown-body .markdown-alert.markdown-alert-important .markdown-alert-title || color':
    '--md-done-fg',
  '.markdown-body .markdown-alert.markdown-alert-important || border-left-color':
    '--md-done-emphasis',
  '.markdown-body .markdown-alert.markdown-alert-note .markdown-alert-title || color':
    '--md-accent-fg',
  '.markdown-body .markdown-alert.markdown-alert-note || border-left-color':
    '--md-accent-emphasis',
  '.markdown-body .markdown-alert.markdown-alert-tip .markdown-alert-title || color':
    '--md-alert-tip-fg',
  '.markdown-body .markdown-alert.markdown-alert-tip || border-left-color':
    '--md-alert-tip-border',
  '.markdown-body .markdown-alert.markdown-alert-warning .markdown-alert-title || color':
    '--md-alert-warning-fg',
  '.markdown-body .markdown-alert.markdown-alert-warning || border-left-color':
    '--md-alert-warning-border',
  '.markdown-body .pl-ba || color': '--color-prettylights-syntax-brackethighlighter-angle',
  '.markdown-body .pl-bu || color': '--color-prettylights-syntax-brackethighlighter-unmatched',
  '.markdown-body .pl-c || color': '--color-prettylights-syntax-comment',
  '.markdown-body .pl-c1, .markdown-body .pl-s .pl-v || color':
    '--color-prettylights-syntax-constant',
  '.markdown-body .pl-c2 || background-color':
    '--color-prettylights-syntax-invalid-illegal-bg',
  '.markdown-body .pl-c2 || color': '--color-prettylights-syntax-invalid-illegal-text',
  '.markdown-body .pl-corl || color':
    '--color-prettylights-syntax-constant-other-reference-link',
  '.markdown-body .pl-e, .markdown-body .pl-en || color': '--color-prettylights-syntax-entity',  '.markdown-body .pl-ent || color': '--color-prettylights-syntax-entity-tag',
  '.markdown-body .pl-k || color': '--color-prettylights-syntax-keyword',
  '.markdown-body .pl-mb || color': '--md-fg-primary',
  '.markdown-body .pl-mc || background-color':
    '--color-prettylights-syntax-markup-changed-bg',
  '.markdown-body .pl-mc || color': '--color-prettylights-syntax-markup-changed-text',
  '.markdown-body .pl-md || background-color': '--md-danger-muted-bg',
  '.markdown-body .pl-md || color': '--color-prettylights-syntax-markup-deleted-text',
  '.markdown-body .pl-mdr || color': '--color-prettylights-syntax-meta-diff-range',
  '.markdown-body .pl-mh, .markdown-body .pl-mh .pl-en, .markdown-body .pl-ms || color':
    '--color-prettylights-syntax-markup-heading',
  '.markdown-body .pl-mi || color': '--md-fg-primary',
  '.markdown-body .pl-mi1 || background-color':
    '--color-prettylights-syntax-markup-inserted-bg',
  '.markdown-body .pl-mi1 || color': '--color-prettylights-syntax-markup-inserted-text',
  '.markdown-body .pl-mi2 || background-color':
    '--color-prettylights-syntax-markup-ignored-bg',
  '.markdown-body .pl-mi2 || color': '--color-prettylights-syntax-markup-ignored-text',
  '.markdown-body .pl-ml || color': '--color-prettylights-syntax-markup-list',
  '.markdown-body .pl-s, .markdown-body .pl-pds, .markdown-body .pl-s .pl-pse .pl-s1, .markdown-body .pl-sr, .markdown-body .pl-sr .pl-cce, .markdown-body .pl-sr .pl-sre, .markdown-body .pl-sr .pl-sra || color':
    '--color-prettylights-syntax-string',
  '.markdown-body .pl-sg || color':
    '--color-prettylights-syntax-sublimelinter-gutter-mark',
  '.markdown-body .pl-smi, .markdown-body .pl-s .pl-s1 || color': '--md-fg-primary',
  '.markdown-body .pl-sr .pl-cce || color':
    '--color-prettylights-syntax-string-regexp',
  '.markdown-body .pl-v, .markdown-body .pl-smw || color':
    '--color-prettylights-syntax-variable',
  '.markdown-body ::placeholder || color': '--md-fg-muted',
  '.markdown-body a || color': '--md-accent-fg',
  '.markdown-body blockquote || border-left': '--md-border-default-left',
  '.markdown-body blockquote || color': '--md-fg-muted',
  '.markdown-body code, .markdown-body tt || background-color': '--md-canvas-neutral-muted',
  '.markdown-body h1 .octicon-link, .markdown-body h2 .octicon-link, .markdown-body h3 .octicon-link, .markdown-body h4 .octicon-link, .markdown-body h5 .octicon-link, .markdown-body h6 .octicon-link || color':
    '--md-fg-default',
  '.markdown-body h1 || border-bottom': '--md-border-faint-bottom',
  '.markdown-body h2 || border-bottom': '--md-border-faint-bottom',
  '.markdown-body h6 || color': '--md-fg-muted',
  '.markdown-body hr || background-color': '--md-border-default',
  '.markdown-body hr || border-bottom': '--md-border-faint-bottom',
  '.markdown-body kbd || background-color': '--md-canvas-muted',
  '.markdown-body kbd || color': '--md-fg-default',
  '.markdown-body mark || background-color': '--md-attention-muted-bg',
  '.markdown-body mark || color': '--md-fg-default',
  '.markdown-body span.frame span span || color': '--md-fg-default',
  '.markdown-body span.frame>span || border': '--md-border-default',
  '.markdown-body table img || background-color': null, // 全主题 transparent，原样保留
  '.markdown-body table th, .markdown-body table td || border': '--md-border-default',
  '.markdown-body table tr || background-color': '--md-canvas-default',
  '.markdown-body table tr || border-top': '--md-border-faint-top',
  '.markdown-body table tr:nth-child(2n) || background-color': '--md-canvas-muted',
  '.markdown-body || background-color': '--md-canvas-default',
  '.markdown-body || color': '--md-fg-default',
  // var(--primer) 引用的槽位（高对比等文件用变量，浅/暗用字面量，语义同组）
  '.markdown-body kbd || border': '--md-border-muted',
  '.markdown-body kbd || border-bottom-color': '--md-border-muted',
  '.markdown-body kbd || box-shadow': '--md-border-muted',
  '.markdown-body .pl-ii || color': '--md-danger-fg',
  '.markdown-body .pl-ii || background-color': '--md-danger-muted-bg',
};

/**
 * 主题专属覆盖（高对比在同选择器下用了不同语义的值，无法共用变量）。
 * 键：主题 id → 选择器 → prop → 已参数化的值（用 var(--md-*) 书写）。
 * 生成时追加在主体之后（更高特异度），校验时对命中项改用覆盖值比对。
 */
const THEME_OVERRIDES = {
  'dark-high-contrast': {
    '.markdown-body h1': { 'border-bottom': '1px solid var(--md-border-default)' },
    '.markdown-body h2': { 'border-bottom': '1px solid var(--md-border-default)' },
    '.markdown-body hr': { 'border-bottom': '1px solid var(--md-border-default)' },
    '.markdown-body table tr': { 'border-top': '1px solid var(--md-border-default)' },
  },
};

/** 官方 Primer 变量 → 本文件变量（源码里 `var(--X)` 的语义归属）。 */
const PRIMER_VAR = {
  'borderColor-default': '--md-border-default',
  'borderColor-muted': '--md-border-muted',
  'borderColor-neutral-muted': '--md-border-neutral-muted',
  'borderColor-accent-emphasis': '--md-accent-emphasis',
  'fgColor-danger': '--md-danger-fg',
  'bgColor-danger-muted': '--md-danger-muted-bg',
};

/**
 * 变量取值表（6 主题顺序同 THEMES）。逐一核对自官方包盘点（见 md-slots.json）；
 * 无官方字面量的高对比 muted 取 Primer 高对比值并在注释标明。
 */
const VAR_VALUE = {
  '--md-fg-default': ['#1f2328', '#1f2328', '#f0f6fc', '#f0f6fc', '#ffffff', '#f0f6fc'],
  '--md-fg-primary': ['#1f2328', '#1f2328', '#f0f6fc', '#f0f6fc', '#f0f6fc', '#f0f6fc'],
  '--md-fg-muted': ['#59636e', '#59636e', '#9198a1', '#9198a1', '#b7bdc8', '#9198a1'],
  '--md-canvas-default': ['#ffffff', '#ffffff', '#0d1117', '#212830', '#010409', '#0d1117'],
  '--md-canvas-muted': ['#f6f8fa', '#f6f8fa', '#151b23', '#262c36', '#151b23', '#151b23'],
  '--md-canvas-neutral-muted': ['#818b981f', '#818b981f', '#656c7633', '#656c7633', '#212830', '#656c7633'],
  '--md-border-default': ['#d1d9e0', '#d1d9e0', '#3d444d', '#3d444d', '#b7bdc8', '#3d444d'],
  '--md-border-muted': ['#d1d9e0b3', '#d1d9e0b3', '#3d444db3', '#3d444db3', '#3d444d', '#3d444db3'],
  '--md-border-neutral-muted': ['#d1d9e0b3', '#d1d9e0b3', '#3d444db3', '#3d444db3', '#3d444d', '#3d444db3'],
  '--md-border-faint-bottom': ['#d1d9e0b3', '#d1d9e0b3', '#3d444db3', '#3d444db3', '#b7bdc8', '#3d444db3'],
  '--md-border-faint-top': ['#d1d9e0b3', '#d1d9e0b3', '#3d444db3', '#3d444db3', '#b7bdc8', '#3d444db3'],
  '--md-border-default-top': ['#d1d9e0', '#d1d9e0', '#3d444d', '#3d444d', '#b7bdc8', '#3d444d'],
  '--md-border-default-left': ['#d1d9e0', '#d1d9e0', '#3d444d', '#3d444d', '#b7bdc8', '#3d444d'],
  '--md-color-scheme': ['light', 'light', 'dark', 'dark', 'dark', 'dark'],
  '--md-accent-fg': ['#0969da', '#0969da', '#4493f8', '#478be6', '#74b9ff', '#4493f8'],
  '--md-accent-emphasis': ['#0969da', '#0969da', '#1f6feb', '#316dca', '#409eff', '#1f6feb'],
  '--md-accent-emphasis-border': ['#0969da', '#0969da', '#1f6feb', '#316dca', '#409eff', '#1f6feb'],
  '--md-danger-fg': ['#d1242f', '#bc4c00', '#f85149', '#e5534b', '#ff9492', '#f0883e'],
  '--md-danger-muted-bg': ['#ffebe9', '#fff1e5', '#67060c', '#78191b', '#cc1421', '#5a1e02'],
  '--md-danger-emphasis': ['#cf222e', '#bc4c00', '#da3633', '#c93c37', '#ff6a69', '#bd561d'],
  '--md-done-fg': ['#8250df', '#8250df', '#ab7df8', '#986ee2', '#d3abff', '#ab7df8'],
  '--md-done-emphasis': ['#8250df', '#8250df', '#8957e5', '#8256d0', '#b87fff', '#8957e5'],
  '--md-attention-muted-bg': ['#fff8c5', '#fff8c5', '#bb800926', '#ae7c1426', '#edaa2726', '#bb800926'],
  '--md-alert-tip-fg': ['#1a7f37', '#0969da', '#3fb950', '#57ab5a', '#2bd853', '#58a6ff'],
  '--md-alert-tip-border': ['#1a7f37', '#0969da', '#238636', '#347d39', '#09b43a', '#1f6feb'],
  '--md-alert-warning-fg': ['#9a6700', '#9a6700', '#d29922', '#c69026', '#f0b72f', '#d29922'],
  '--md-alert-warning-border': ['#9a6700', '#9a6700', '#9e6a03', '#966600', '#e09b13', '#9e6a03'],
  '--color-prettylights-syntax-brackethighlighter-angle': ['#59636e', '#59636e', '#9198a1', '#9198a1', '#9198a1', '#9198a1'],
  '--color-prettylights-syntax-brackethighlighter-unmatched': ['#82071e', '#762c00', '#f85149', '#e5534b', '#ff8080', '#db6d28'],
  '--color-prettylights-syntax-comment': ['#59636e', '#59636e', '#9198a1', '#9198a1', '#9198a1', '#9198a1'],
  '--color-prettylights-syntax-constant': ['#0550ae', '#0550ae', '#79c0ff', '#6cb6ff', '#91cbff', '#79c0ff'],
  '--color-prettylights-syntax-constant-other-reference-link': ['#0a3069', '#0a3069', '#a5d6ff', '#96d0ff', '#addcff', '#a5d6ff'],
  '--color-prettylights-syntax-entity': ['#6639ba', '#6639ba', '#d2a8ff', '#dcbdfb', '#dbb7ff', '#d2a8ff'],
  '--color-prettylights-syntax-entity-tag': ['#0550ae', '#0550ae', '#7ee787', '#8ddb8c', '#72f088', '#a5d6ff'],
  '--color-prettylights-syntax-invalid-illegal-bg': ['#cf222e', '#bc4c00', '#b62324', '#ad2e2c', '#ff4445', '#9b4215'],
  '--color-prettylights-syntax-invalid-illegal-text': ['#f6f8fa', '#f6f8fa', '#f0f6fc', '#f0f6fc', '#f0f6fc', '#f0f6fc'],
  '--color-prettylights-syntax-keyword': ['#cf222e', '#bc4c00', '#ff7b72', '#f47067', '#ff9492', '#f0883e'],
  '--color-prettylights-syntax-markup-bold': ['#1f2328', '#1f2328', '#f0f6fc', '#f0f6fc', '#f0f6fc', '#f0f6fc'],
  '--color-prettylights-syntax-markup-changed-bg': ['#ffd8b5', '#ffd8b5', '#5a1e02', '#682d0f', '#a74c00', '#5a1e02'],
  '--color-prettylights-syntax-markup-changed-text': ['#953800', '#953800', '#ffdfb6', '#ffddb0', '#ffe1b4', '#ffdfb6'],
  '--color-prettylights-syntax-markup-deleted-text': ['#82071e', '#762c00', '#ffdcd7', '#ffd8d3', '#ffdedb', '#ffdfb6'],
  '--color-prettylights-syntax-markup-heading': ['#0550ae', '#0550ae', '#1f6feb', '#316dca', '#409eff', '#1f6feb'],
  '--color-prettylights-syntax-markup-ignored-bg': ['#0550ae', '#0550ae', '#1158c7', '#255ab2', '#318bf8', '#1158c7'],
  '--color-prettylights-syntax-markup-ignored-text': ['#d1d9e0', '#d1d9e0', '#f0f6fc', '#f0f6fc', '#f0f6fc', '#f0f6fc'],
  '--color-prettylights-syntax-markup-inserted-bg': ['#dafbe1', '#ddf4ff', '#033a16', '#1b4721', '#007728', '#0c2d6b'],
  '--color-prettylights-syntax-markup-inserted-text': ['#116329', '#0550ae', '#aff5b4', '#b4f1b4', '#acf7b6', '#cae8ff'],
  '--color-prettylights-syntax-markup-italic': ['#1f2328', '#1f2328', '#f0f6fc', '#f0f6fc', '#f0f6fc', '#f0f6fc'],
  '--color-prettylights-syntax-markup-list': ['#3b2300', '#3b2300', '#f2cc60', '#eac55f', '#fbd669', '#f2cc60'],
  '--color-prettylights-syntax-meta-diff-range': ['#8250df', '#8250df', '#d2a8ff', '#dcbdfb', '#dbb7ff', '#d2a8ff'],
  '--color-prettylights-syntax-storage-modifier-import': ['#1f2328', '#1f2328', '#f0f6fc', '#f0f6fc', '#f0f6fc', '#f0f6fc'],
  '--color-prettylights-syntax-string': ['#0a3069', '#0a3069', '#a5d6ff', '#96d0ff', '#addcff', '#a5d6ff'],
  '--color-prettylights-syntax-string-regexp': ['#116329', '#0550ae', '#7ee787', '#8ddb8c', '#72f088', '#a5d6ff'],
  '--color-prettylights-syntax-sublimelinter-gutter-mark': ['#818b98', '#818b98', '#3d444d', '#3d444d', '#3d444d', '#3d444d'],
  '--color-prettylights-syntax-variable': ['#953800', '#953800', '#ffa657', '#f69d50', '#ffb757', '#ffa657'],
};

function parseRules(css) {
  const rules = [];
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const block of noComments.split('}')) {
    const brace = block.indexOf('{');
    if (brace < 0) continue;
    const selector = block.slice(0, brace).trim().replace(/\s+/g, ' ');
    const decls = [];
    for (const decl of block.slice(brace + 1).split(';')) {
      const colon = decl.indexOf(':');
      if (colon < 0) continue;
      decls.push({ prop: decl.slice(0, colon).trim(), value: decl.slice(colon + 1).trim() });
    }
    rules.push({ selector, decls });
  }
  return rules;
}

function parameterizeValue(slotKey, value) {
  const varName = SLOT_VAR[slotKey];
  if (varName === null || varName === undefined) {
    // G45/G47 类已在上游删硬编码、当前值与官方变量语义一致的声明才会走到这里；
    // 未登记槽位若含颜色字面量则报错（防静默失真）。
    COLOR_RE.lastIndex = 0;
    if (COLOR_RE.test(value)) {
      throw new Error(`unmapped color slot: ${slotKey} = ${value}`);
    }
    return value;
  }
  if (varName === null) return value;
  // 先归一官方 Primer 引用（避免后一步把刚插入的 var(--md-*) 当 Primer 解析）
  PRIMER_RE.lastIndex = 0;
  const primed = value.replace(PRIMER_RE, (m, primer) => {
    const mapped = PRIMER_VAR[primer];
    if (!mapped) throw new Error(`unmapped primer var: ${primer} in ${slotKey}`);
    return `var(${mapped})`;
  });
  COLOR_RE.lastIndex = 0;
  return primed.replace(COLOR_RE, `var(${varName})`);
}

// box-shadow 等含 primer 引用的声明同样要归一（值里无字面量但有 var()）
function parameterizePrimerOnly(slotKey, value) {
  PRIMER_RE.lastIndex = 0;
  if (!PRIMER_RE.test(value)) return value;
  PRIMER_RE.lastIndex = 0;
  return value.replace(PRIMER_RE, (m, primer) => {
    const mapped = PRIMER_VAR[primer];
    if (!mapped) throw new Error(`unmapped primer var: ${primer} in ${slotKey}`);
    return `var(${mapped})`;
  });
}

function main() {
  const baseCss = fs.readFileSync(path.join(pkgDir, 'github-markdown-light.css'), 'utf8');
  const rules = parseRules(baseCss);
  const body = [];
  for (const { selector, decls } of rules) {
    const out = [];
    for (const { prop, value } of decls) {
      const slotKey = `${selector} || ${prop}`;
      let v;
      if (SLOT_VAR[slotKey] === null) {
        v = value; // 全主题 transparent，原样保留
      } else if (SLOT_VAR[slotKey]) {
        v = parameterizeValue(slotKey, value);
      } else {
        v = parameterizePrimerOnly(slotKey, value);
        COLOR_RE.lastIndex = 0;
        const m = v.match(COLOR_RE) || [];
        // 仅允许全透明字面量原样保留（如 rgba(0,0,0,0) 背景/轮廓），其余未登记即报错
        const nonTransparent = m.filter(
          (c) => c.replace(/\s+/g, '') !== 'rgba(0,0,0,0)' && c !== 'transparent',
        );
        if (nonTransparent.length > 0) {
          throw new Error(`unmapped color slot: ${slotKey} = ${value}`);
        }
      }
      // color-scheme 关键字参数化
      if (prop === 'color-scheme' && (v === 'light' || v === 'dark')) {
        v = 'var(--md-color-scheme)';
      }
      out.push(`  ${prop}: ${v};`);
    }
    body.push(`${selector} {\n${out.join('\n')}\n}`);
  }

  const varBlocks = THEMES.map((t, ti) => {
    const lines = Object.keys(VAR_VALUE).map((name) => `  ${name}: ${VAR_VALUE[name][ti]};`);
    return `.adl-markdown-preview[data-md-theme="${t.id}"] {\n${lines.join('\n')}\n}`;
  });

  const header = `/* GENERATED FILE — 请勿手改。
 * 由 frontend/scripts/generate-md-theme-vars.mjs 从 github-markdown-css@5.9.0 生成，
 * 结构取 light.css（已实证：去色后 6 文件结构一致，仅 color-scheme 一字之差），
 * 颜色逐槽映射为变量（映射表见生成脚本 SLOT_VAR），6 主题各给一组值。
 * 排版版权归原作者（MIT，见 node_modules/github-markdown-css/license）。
 * 升级官方包后重跑脚本； fidelity 由脚本内自校验保证（回代 diff 官方文件）。
 */`;
  fs.writeFileSync(outFile, `${header}\n\n${varBlocks.join('\n\n')}\n\n${body.join('\n\n')}\n`);

  // 主题专属覆盖块（更高特异度，见 THEME_OVERRIDES）
  const overrideBlocks = [];
  for (const [themeId, selectors] of Object.entries(THEME_OVERRIDES)) {
    for (const [selector, props] of Object.entries(selectors)) {
      const decls = Object.entries(props)
        .map(([p, v]) => `  ${p}: ${v};`)
        .join('\n');
      overrideBlocks.push(
        `.adl-markdown-preview[data-md-theme="${themeId}"] ${selector} {\n${decls}\n}`,
      );
    }
  }
  fs.appendFileSync(outFile, `\n${overrideBlocks.join('\n\n')}\n`);

  // —— 自校验：双边归一到变量形再比对（官方字面量/Primer 引用都映射到同一变量）。
  // 只要某主题在某槽位用了"同义不同形"的值（如 HC 用 var(--borderColor-default)
  // 而别处用字面量 #b7bdc8），此处即会暴露，倒逼映射表显式处理。
  const toVarForm = (slotKey, rawValue) => {
    // 先归一 Primer（避免把字面量替换后插入的 var(--md-*) 误判为 Primer）
    PRIMER_RE.lastIndex = 0;
    let s = rawValue.replace(PRIMER_RE, (m, primer) => {
      const mapped = PRIMER_VAR[primer];
      if (!mapped) throw new Error(`unmapped primer var in verify: ${primer}`);
      return `var(${mapped})`;
    });
    const vn = SLOT_VAR[slotKey];
    if (vn) {
      COLOR_RE.lastIndex = 0;
      s = s.replace(COLOR_RE, `var(${vn})`);
    }
    COLOR_RE.lastIndex = 0;
    const left = (s.match(COLOR_RE) || []).filter(
      (c) => c.replace(/\s+/g, '') !== 'rgba(0,0,0,0)' && c !== 'transparent',
    );
    if (left.length > 0 && slotKey !== '__color-scheme__') {
      throw new Error(`unresolved color in verify: ${slotKey} = ${rawValue}`);
    }
    return s.replace(/\s+/g, ' ').trim().toLowerCase();
  };
  const failures = [];
  for (let ti = 0; ti < THEMES.length; ti++) {
    const themeId = THEMES[ti].id;
    const official = parseRules(fs.readFileSync(path.join(pkgDir, THEMES[ti].file), 'utf8'));
    // 同选择器可出现多次（如 `.markdown-body a`）：按出现顺序逐块比对，不坍缩
    const officialGroups = new Map();
    for (const r of official) {
      if (!officialGroups.has(r.selector)) officialGroups.set(r.selector, []);
      officialGroups.get(r.selector).push(r.decls);
    }
    const seenCount = new Map();
    for (const { selector, decls } of rules) {
      const n = seenCount.get(selector) || 0;
      seenCount.set(selector, n + 1);
      const oDecls = (officialGroups.get(selector) || [])[n];
      if (!oDecls) {
        failures.push(`${themeId}: missing rule #${n} ${selector}`);
        continue;
      }
      const oMap = new Map(oDecls.map((d) => [d.prop, d.value]));
      for (const { prop, value } of decls) {
        const slotKey = `${selector} || ${prop}`;
        const oVal = oMap.get(prop);
        if (oVal === undefined) {
          failures.push(`${themeId}: missing decl ${slotKey}`);
          continue;
        }
        // 主题专属覆盖命中时以覆盖值为准
        const overrideVal = THEME_OVERRIDES[themeId]?.[selector]?.[prop];
        const genForm =
          prop === 'color-scheme'
            ? 'var(--md-color-scheme)'
            : overrideVal !== undefined
              ? overrideVal.replace(/\s+/g, ' ').trim().toLowerCase()
              : toVarForm(slotKey, value);
        const offForm =
          prop === 'color-scheme' ? 'var(--md-color-scheme)' : toVarForm(slotKey, oVal);
        if (genForm !== offForm) {
          failures.push(`${themeId}: ${slotKey}\n  gen=${genForm}\n  off=${offForm}`);
        }
      }
    }
    // 变量块完整性：每个主题的每个变量都有值
    for (const name of Object.keys(VAR_VALUE)) {
      if (VAR_VALUE[name][ti] === undefined) failures.push(`${themeId}: missing value ${name}`);
    }
  }
  if (failures.length > 0) {
    console.error(`FIDELITY FAILURES (${failures.length}):`);
    for (const f of failures.slice(0, 20)) console.error(' -', f);
    process.exit(1);
  }
  console.log(`OK: ${outFile}（${rules.length} 规则，6 主题回代校验全过）`);
}

main();
