/**
 * 真实渲染探针：用本机 Edge/Chrome 的 CDP 读取目标页面的 `getComputedStyle`。
 *
 * 为什么不用 Playwright：仓库没有 Playwright 依赖；而 Tauri/WebView2 环境必然有 Edge。
 * 本脚本只用 Node 内置 `fetch` + `WebSocket`（Node 22+），不引入任何新依赖。
 *
 * 前置：待探测页面已可访问（例如先跑 `pnpm --dir adlo run dev:preview`）。
 *
 * 用法：
 *   node scripts/ui-probe.mjs --url http://127.0.0.1:5174 \
 *     --selector ".adl-titlebar__drag-lane" --props width,position,cursor
 *   node scripts/ui-probe.mjs --url <url> --selector A --selector B --pseudo ::after
 *   node scripts/ui-probe.mjs --url <url> --selector .adl-terminal-region-actions \
 *     --props opacity --hover .adl-terminal-region-actions
 *   # 面板内 UI（设置 → 关于）：先点击进入目标面板，再取样式；`text=` 精确匹配可见文本
 *   node scripts/ui-probe.mjs --url <url> --click 'button[aria-label="设置"]' \
 *     --click 'text=关于' --selector '.adl-about__links' --props flex-direction,justify-content
 *
 * 输出：JSON（每个 selector 的计算样式；缺失的 selector 标记 missing）。
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_PROPS = ["color", "background-color"];

export function parseArgs(argv) {
  const options = {
    url: "",
    selectors: [],
    props: [...DEFAULT_PROPS],
    pseudo: "",
    hover: "",
    clicks: [],
    prelude: "",
    settle: 300,
    timeout: 60000,
    port: 9333,
    headless: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      const value = argv[index];
      if (value === undefined) throw new Error(`missing value for ${arg}`);
      return value;
    };
    switch (arg) {
      case "--url":
        options.url = next();
        break;
      case "--selector":
        options.selectors.push(next());
        break;
      case "--props":
        options.props = next()
          .split(",")
          .map((prop) => prop.trim())
          .filter(Boolean);
        break;
      case "--pseudo":
        options.pseudo = next();
        break;
      case "--hover":
        options.hover = next();
        break;
      case "--click":
        options.clicks.push(next());
        break;
      case "--eval":
        options.prelude = next();
        break;
      case "--settle":
        options.settle = Number.parseInt(next(), 10);
        break;
      case "--timeout":
        options.timeout = Number.parseInt(next(), 10);
        break;
      case "--port":
        options.port = Number.parseInt(next(), 10);
        break;
      case "--headed":
        options.headless = false;
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!options.url) throw new Error("--url is required");
  if (options.selectors.length === 0) throw new Error("at least one --selector is required");
  return options;
}

/**
 * `--click` 目标解析：普通 CSS 选择器，或 `text=<可见文本>`（精确匹配去空白后的
 * textContent，优先交互元素）。返回「是否存在」与「点击」两个表达式，分别用于
 * 等待与执行——`Runtime.evaluate` 的 returnByValue 不能回传 DOM 节点。
 */
export function buildClickExpressions(selector) {
  if (selector.startsWith("text=")) {
    const text = JSON.stringify(selector.slice("text=".length));
    const find = `Array.from(document.querySelectorAll('button,a,[role="button"],[role="tab"],[role="option"],.adl-settings-nav__item')).find((el) => (el.textContent || '').trim() === ${text})`;
    return {
      exists: `Boolean(${find})`,
      click: `(() => { const el = ${find}; if (!el) return false; el.click(); return true; })()`,
    };
  }
  const quoted = JSON.stringify(selector);
  return {
    exists: `Boolean(document.querySelector(${quoted}))`,
    click: `(() => { const el = document.querySelector(${quoted}); if (!el) return false; el.click(); return true; })()`,
  };
}

export function buildProbeExpression(selectors, props, pseudo) {
  const spec = JSON.stringify(selectors.map((selector) => ({ selector, props, pseudo })));
  return `(() => {
    const spec = ${spec};
    return spec.map((item) => {
      const el = document.querySelector(item.selector);
      if (!el) return { selector: item.selector, missing: true };
      const cs = getComputedStyle(el, item.pseudo || null);
      const values = {};
      for (const prop of item.props) values[prop] = cs.getPropertyValue(prop);
      return { selector: item.selector, values };
    });
  })()`;
}

export function resolveBrowserPath(env = process.env) {
  const explicit = env.ADL_PROBE_BROWSER || env.EDGE_PATH || env.CHROME_PATH;
  if (explicit && fs.existsSync(explicit)) return explicit;
  const candidates =
    process.platform === "win32"
      ? [
          "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
          "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
          "C:/Program Files/Google/Chrome/Application/chrome.exe",
          "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
        ]
      : process.platform === "darwin"
        ? [
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          ]
        : ["/usr/bin/microsoft-edge", "/usr/bin/google-chrome", "/usr/bin/chromium"];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? "";
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Windows 上 Edge 会派生渲染进程；只 kill 父进程会留下占用 profile 的孤儿。 */
function killBrowser(child) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  child.kill("SIGTERM");
}

async function removeProfile(dir) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch {
      await delay(200);
    }
  }
  // 清理失败不应把一次成功的探测变成失败；仅提示残留路径。
  console.error(`[ui-probe] could not remove temp profile: ${dir}`);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

async function waitForPageTarget(port, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
      const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      // browser 尚未监听
    }
    await delay(300);
  }
  throw new Error(`CDP target not ready on port ${port} within ${timeout}ms`);
}

function connectCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const pending = new Map();
    let messageId = 0;
    socket.addEventListener("open", () => {
      resolve({
        send(method, params = {}) {
          return new Promise((res, rej) => {
            const id = (messageId += 1);
            pending.set(id, { res, rej });
            socket.send(JSON.stringify({ id, method, params }));
          });
        },
        close() {
          socket.close();
        },
      });
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.error) entry.rej(new Error(message.error.message));
      else entry.res(message.result);
    });
    socket.addEventListener("error", () => reject(new Error("CDP websocket error")));
  });
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "evaluation failed");
  }
  return result.result.value;
}

async function waitForExpression(client, expression, timeout, label) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(client, expression)) return;
    await delay(300);
  }
  throw new Error(`${label} not found within ${timeout}ms`);
}

async function waitForSelector(client, selector, timeout) {
  await waitForExpression(
    client,
    `Boolean(document.querySelector(${JSON.stringify(selector)}))`,
    timeout,
    `selector ${selector}`,
  );
}

/** 把真实指针移到目标元素中心，使 `:hover` / `:focus-within` 等状态生效后再读计算样式。 */
async function hoverElement(client, selector) {
  await client.send("DOM.enable");
  const { root } = await client.send("DOM.getDocument", { depth: 1 });
  const { nodeId } = await client.send("DOM.querySelector", { nodeId: root.nodeId, selector });
  if (!nodeId) throw new Error(`hover selector not found: ${selector}`);
  const { model } = await client.send("DOM.getBoxModel", { nodeId });
  const quad = model.border;
  const x = (quad[0] + quad[2] + quad[4] + quad[6]) / 4;
  const y = (quad[1] + quad[3] + quad[5] + quad[7]) / 4;
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x,
    y,
    button: "none",
    clickCount: 0,
  });
  await delay(150);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const browser = resolveBrowserPath();
  if (!browser) {
    console.error(
      "[ui-probe] no Edge/Chrome found. Set ADL_PROBE_BROWSER to the browser executable path.",
    );
    process.exit(2);
  }

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "adl-ui-probe-"));
  const child = spawn(
    browser,
    [
      `--remote-debugging-port=${options.port}`,
      `--user-data-dir=${profileDir}`,
      ...(options.headless ? ["--headless=new"] : []),
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--window-size=1440,900",
      options.url,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );

  let client;
  try {
    const page = await waitForPageTarget(options.port, Math.min(options.timeout, 15000));
    client = await connectCdp(page.webSocketDebuggerUrl);
    await client.send("Runtime.enable");

    // 进入目标面板：先执行前置脚本，再依次点击；每一步都等目标元素出现，
    // 最后等探测 selector 出现再读样式。
    if (options.prelude) {
      await evaluate(client, options.prelude);
    }
    for (const selector of options.clicks) {
      const target = buildClickExpressions(selector);
      await waitForExpression(client, target.exists, options.timeout, `click target ${selector}`);
      await evaluate(client, target.click);
      await delay(options.settle);
    }

    // 等应用启动（dev 模式首屏可能 30s+）；hover 目标也必须存在。
    for (const selector of new Set([...options.selectors, options.hover].filter(Boolean))) {
      await waitForSelector(client, selector, options.timeout);
    }
    if (options.hover) {
      await hoverElement(client, options.hover);
    }

    const result = await evaluate(
      client,
      buildProbeExpression(options.selectors, options.props, options.pseudo),
    );
    const viewport = await evaluate(client, "({ width: innerWidth, height: innerHeight })");
    console.log(JSON.stringify({ url: options.url, viewport, results: result }, null, 2));
  } finally {
    client?.close();
    killBrowser(child);
    await delay(300);
    await removeProfile(profileDir);
  }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((error) => {
    console.error(`[ui-probe] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
