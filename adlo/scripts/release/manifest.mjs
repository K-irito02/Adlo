/**
 * 发布物与版本清单的纯函数（无 IO，便于单测）。
 *
 * 双源约定见 ADR-0026：
 * - GitHub 清单作为 Release 资产 `latest.json` 上传，地址 `releases/latest/download/latest.json`；
 * - Gitee 没有等价「永远指向最新」的地址，清单放仓库文件 `release/latest.json`，由 CI/脚本更新。
 * 两份清单内容只有下载地址不同，签名相同。
 */

export const RELEASE = {
  github: { owner: "K-irito02", repo: "Adlo" },
  gitee: { owner: "K_irito", repo: "Adlo" },
  target: "windows-x86_64",
  manifestPath: "release/latest.json",
};

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export function isVersion(value) {
  return typeof value === "string" && SEMVER.test(value);
}

/** NSIS 安装包文件名，与 Tauri 打包输出一致。 */
export function setupFileName(version) {
  return `Adlo_${version}_x64-setup.exe`;
}

export function downloadUrl(host, version, fileName) {
  const owner = host === "gitee" ? RELEASE.gitee.owner : RELEASE.github.owner;
  const domain = host === "gitee" ? "gitee.com" : "github.com";
  return `https://${domain}/${owner}/${RELEASE[host].repo}/releases/download/v${version}/${fileName}`;
}

/**
 * 生成 `latest.json`。字段名遵循 Tauri 静态清单（snake_case：`pub_date`）。
 * 任一项不合法直接抛错——清单写错会让所有客户端静默「已是最新」。
 */
export function buildManifest({ version, notes, pubDate, url, signature }) {
  if (!isVersion(version)) {
    throw new Error(`invalid version: ${version}`);
  }
  if (!signature || typeof signature !== "string") {
    throw new Error("missing updater signature (.sig)");
  }
  if (!url || !url.startsWith("https://")) {
    throw new Error(`manifest url must be https: ${url}`);
  }
  const date = pubDate ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(date))) {
    throw new Error(`invalid pub_date: ${date}`);
  }
  return {
    version,
    notes: notes ?? "",
    pub_date: new Date(date).toISOString().replace(/\.\d{3}Z$/, "Z"),
    platforms: {
      [RELEASE.target]: { url, signature },
    },
  };
}

/** `sha256sum` 兼容的一行；校验和文件用于人工与下载页核对。 */
export function sha256Line(fileName, hex) {
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new Error(`invalid sha256 digest for ${fileName}`);
  }
  return `${hex}  ${fileName}`;
}

/** 发布说明兜底：测试版必须明确写「测试」，避免被当成正式发布。 */
export function defaultTestNotes(version) {
  return [
    `Adlo v${version} 测试版本（非正式发布）`,
    "",
    "本版本仅用于验证应用内自动更新链路，不包含正式发布的功能宣传",
  ].join("\n");
}
