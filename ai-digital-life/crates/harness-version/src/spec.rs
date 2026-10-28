//! Harness 描述符：把「工具差异」集中成数据，通用内核只读描述符。
//!
//! 两个 harness 的差异只有五处：npm 包名、安装通道、版本目录里的可执行 marker、
//! 系统安装探测用的可执行名、版本目录的限量策略。其余（版本目录、选中、回退、
//! 卸载、安装任务、来源解析）由本 crate 的通用内核承担。

use serde::{Deserialize, Serialize};

/// 应用集成的 harness。序列化值进入 IPC（camelCase）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HarnessId {
    Dsh,
    OpenCode,
}

impl HarnessId {
    /// 稳定标识（也是存储目录名与 IPC 字段名）。
    pub fn key(self) -> &'static str {
        match self {
            Self::Dsh => "dsh",
            Self::OpenCode => "opencode",
        }
    }
}

/// 宿主安装通道。两者最终都落到「版本目录 + 可执行 marker」，但取包方式不同。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InstallChannel {
    /// `npm install --prefix <tmp> <package>@<version>`（DSH：JS 包，运行时也要 node）。
    Npm,
    /// 直接下载平台包 tarball，解出 `bin_rel`（OpenCode：自包含单文件 exe，无需 node）。
    PlatformTarball,
}

/// 版本目录限量策略。registry 的版本总量差异很大（DSH 39 个，OpenCode 12000+），
/// 不做限量会把 UI 与 payload 压垮。
#[derive(Debug, Clone, Copy)]
pub struct CatalogPolicy {
    /// 正式版最多保留多少个（None = 不限）。
    pub stable_limit: Option<usize>,
    /// 预发布最多保留多少个（None = 不限）。
    pub prerelease_limit: Option<usize>,
    /// 预发布版本必须匹配的 pre 段前缀（None = 所有 pre 段）。
    pub prerelease_prefix: Option<&'static str>,
    /// 「最新预发布」的 dist-tag 回退顺序。
    pub prerelease_tags: &'static [&'static str],
}

/// 单个 harness 的静态描述符。
#[derive(Debug, Clone, Copy)]
pub struct HarnessSpec {
    pub id: HarnessId,
    /// npm 包名（Npm 通道）或平台包名前缀（PlatformTarball 通道，实际包名按平台拼）。
    pub package: &'static str,
    pub channel: InstallChannel,
    /// `installed/<version>/` 下的可执行 marker（相对路径）。
    pub marker_rel: &'static str,
    /// 系统安装探测用的可执行名（`where` / `--version`）。
    pub system_bin: &'static str,
    pub catalog: CatalogPolicy,
}

/// DSH：npm 包，入口 `lib/bin.js`；目录只有 39 个版本，全量列出。
pub const DSH: HarnessSpec = HarnessSpec {
    id: HarnessId::Dsh,
    package: "@deepseek-ai/dsh",
    channel: InstallChannel::Npm,
    marker_rel: "node_modules/@deepseek-ai/dsh/lib/bin.js",
    system_bin: "dsh",
    catalog: CatalogPolicy {
        stable_limit: None,
        prerelease_limit: None,
        prerelease_prefix: None,
        // DSH 的预发布通道为 next，历史上还用过 alpha。
        prerelease_tags: &["next", "alpha"],
    },
};

/// OpenCode 版本目录里的可执行文件相对路径（平台包内布局固定为 `bin/opencode*`）。
pub const OPENCODE_BIN_REL: &str =
    if cfg!(windows) { "bin/opencode.exe" } else { "bin/opencode" };

/// OpenCode：直接下载平台包，入口为包内 `bin/opencode(.exe)`。
/// 稳定版 950 个、beta 3,151 个——限量到「最近 50 个稳定版 + 最新 1 个 beta」。
pub const OPENCODE: HarnessSpec = HarnessSpec {
    id: HarnessId::OpenCode,
    package: "opencode-ai",
    channel: InstallChannel::PlatformTarball,
    marker_rel: OPENCODE_BIN_REL,
    system_bin: "opencode",
    catalog: CatalogPolicy {
        stable_limit: Some(50),
        prerelease_limit: Some(1),
        prerelease_prefix: Some("beta"),
        prerelease_tags: &["beta"],
    },
};

/// OpenCode 平台包候选名，按尝试顺序返回（首个可用即用）。
///
/// 与上游 `opencode-ai/postinstall.mjs` 同口径：x64 若检测不到 AVX2，先试
/// `-baseline` 包，再回退普通包；arm64 只有普通包。
pub fn opencode_platform_packages(platform: &str, arch: &str, avx2: bool) -> Vec<String> {
    let base = format!("opencode-{platform}-{arch}");
    if arch != "x64" {
        return vec![base];
    }
    if avx2 {
        vec![base.clone(), format!("{base}-baseline")]
    } else {
        vec![format!("{base}-baseline"), base]
    }
}

/// 当前机器的 OpenCode 平台包候选（Rust 侧运行时检测 AVX2，等价于上游的
/// `IsProcessorFeaturePresent(40)`，不必再拉 PowerShell）。
pub fn opencode_platform_packages_for_current() -> Vec<String> {
    let avx2 = cfg!(target_arch = "x86_64") && std::is_x86_feature_detected!("avx2");
    opencode_platform_packages(std::env::consts::OS, std::env::consts::ARCH, avx2)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dsh_is_an_unlimited_npm_harness() {
        assert_eq!(DSH.id.key(), "dsh");
        assert_eq!(DSH.channel, InstallChannel::Npm);
        assert_eq!(DSH.package, "@deepseek-ai/dsh");
        assert_eq!(DSH.catalog.stable_limit, None);
        assert_eq!(DSH.catalog.prerelease_limit, None);
        assert_eq!(DSH.catalog.prerelease_tags, &["next", "alpha"]);
    }

    #[test]
    fn opencode_is_a_limited_tarball_harness() {
        assert_eq!(OPENCODE.id.key(), "opencode");
        assert_eq!(OPENCODE.channel, InstallChannel::PlatformTarball);
        assert_eq!(OPENCODE.package, "opencode-ai");
        assert_eq!(OPENCODE.catalog.stable_limit, Some(50));
        assert_eq!(OPENCODE.catalog.prerelease_limit, Some(1));
        assert_eq!(OPENCODE.catalog.prerelease_prefix, Some("beta"));
        assert_eq!(OPENCODE.catalog.prerelease_tags, &["beta"]);
    }

    #[test]
    fn x64_without_avx2_tries_the_baseline_package_first() {
        assert_eq!(
            opencode_platform_packages("windows", "x64", false),
            vec!["opencode-windows-x64-baseline", "opencode-windows-x64"]
        );
    }

    #[test]
    fn x64_with_avx2_prefers_the_regular_package() {
        assert_eq!(
            opencode_platform_packages("windows", "x64", true),
            vec!["opencode-windows-x64", "opencode-windows-x64-baseline"]
        );
    }

    #[test]
    fn arm64_has_a_single_candidate() {
        assert_eq!(
            opencode_platform_packages("windows", "arm64", false),
            vec!["opencode-windows-arm64"]
        );
    }

    #[test]
    fn current_platform_candidates_are_non_empty() {
        assert!(!opencode_platform_packages_for_current().is_empty());
    }
}
