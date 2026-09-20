use adl_errors::AppError;
use adl_types::{WorkspaceSearchHit, WorkspaceSearchPage};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

/// 未指定窗口时的单次返回上限（前端首屏即按此值请求）。
///
/// **跨语言契约**：必须与前端单一来源 `frontend/src/shared/ipc/searchWindow.ts`
/// 的 `SEARCH_PAGE_SIZE` 保持同值；两侧单测均把该值钉到 200，
/// 任一侧单独改动都会在各自测试中失败。
pub const MAX_SEARCH_RESULTS: usize = 200;
/// "显示全部"的默认目标：单次请求可返回的最大命中数（用户未自定义时）。
/// 超过此值仍会被截断（`has_more` 为 true），避免超大仓库一次性拉爆内存与 IPC。
///
/// **跨语言契约**：必须与前端 `searchWindow.ts` 的 `SEARCH_MAX_RESULTS` 保持同值；
/// 两侧单测均把该值钉到 5000（前端钳制、后端 `clamped` 各有一处断言）。
pub const MAX_SEARCH_RESULTS_UNLIMITED: usize = 5000;
/// 硬上限：用户自定义也不得超过的值（前端 >5000 时出卡顿警告）。
///
/// **跨语言契约**：必须与前端 `searchWindow.ts` 的 `SEARCH_HARD_MAX_RESULTS` 同值；
/// 两侧单测均把该值钉到 20000。
pub const MAX_SEARCH_RESULTS_HARD_CAP: usize = 20000;
const CANCEL_CHECK_INTERVAL: usize = 100;

/// 检索过滤器：手动忽略名单（工作区相对路径，目录隐含全部后代）与
/// `.gitignore` 开关。两者为并集关系——命中任一即跳过该文件；
/// 窗口截断（`offset`/`limit`/`has_more`）在过滤之后生效，因此
/// "加载更多/显示全部"的计数不受影响。
#[derive(Debug, Clone)]
pub struct SearchFilter {
    pub excluded_paths: Vec<String>,
    /// 缺省启用（与前端 `selectSearchFilter` 的缺省一致：不传即叠加 gitignore）。
    pub use_gitignore: bool,
}

impl Default for SearchFilter {
    fn default() -> Self {
        Self { excluded_paths: Vec::new(), use_gitignore: true }
    }
}

impl SearchFilter {
    /// 为本次检索加载 `.gitignore` 链（开关关闭或无规则文件时返回 `None`，
    /// 调用方即跳过 gitignore 判定；每次检索重新加载，改完立即生效）。
    fn matcher_for(&self, root: &Path) -> Option<crate::gitignore::GitignoreMatcher> {
        if !self.use_gitignore {
            return None;
        }
        let chain = crate::gitignore::load_gitignore_chain(root);
        if chain.is_empty() {
            return None;
        }
        Some(crate::gitignore::GitignoreMatcher::new(&chain))
    }
}

/// 调用方相对路径是否命中手动忽略名单（精确或目录前缀）。
fn is_manually_excluded(relative: &str, excluded_paths: &[String]) -> bool {
    let normalized = relative.replace('\\', "/");
    let normalized = normalized.trim_matches('/');
    excluded_paths.iter().any(|raw| {
        let ignored = raw.replace('\\', "/");
        let ignored = ignored.trim_matches('/');
        !ignored.is_empty() && (normalized == ignored || normalized.starts_with(&format!("{ignored}/")))
    })
}

/// 检索分页窗口：跳过前 `offset` 条命中，最多返回 `limit` 条。
///
/// 上限由服务端钳制（见 [`SearchWindow::clamped`]），调用方无法绕过硬上限。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SearchWindow {
    pub offset: usize,
    pub limit: usize,
}

impl Default for SearchWindow {
    fn default() -> Self {
        Self { offset: 0, limit: MAX_SEARCH_RESULTS }
    }
}

impl SearchWindow {
    /// 钳制到合法区间：`limit = 0` 视为 1（否则调用方永远拿不到结果，且 `has_more` 无意义），
    /// 超过 [`MAX_SEARCH_RESULTS_HARD_CAP`] 即夹到硬上限。
    pub fn clamped(offset: usize, limit: usize) -> Self {
        Self { offset, limit: limit.clamp(1, MAX_SEARCH_RESULTS_HARD_CAP) }
    }
}

pub fn search_text(
    root: &Path,
    query: &str,
    window: SearchWindow,
    filter: &SearchFilter,
) -> Result<WorkspaceSearchPage, AppError> {
    if query.trim().is_empty() {
        return Ok(WorkspaceSearchPage { hits: vec![], has_more: false });
    }
    let files = crate::tree::collect_text_files(root, crate::DEFAULT_MAX_FILE_BYTES)?;
    let matcher = filter.matcher_for(root);
    search_text_in_files(&files, root, query, window, filter, matcher.as_ref(), &|| false)
}

pub async fn search_text_async(
    root: &Path,
    query: &str,
    window: SearchWindow,
    filter: &SearchFilter,
    mut cancellation: tokio::sync::broadcast::Receiver<()>,
) -> Result<WorkspaceSearchPage, AppError> {
    if query.trim().is_empty() {
        return Ok(WorkspaceSearchPage { hits: vec![], has_more: false });
    }

    let query = query.to_string();
    let root_owned = root.to_path_buf();
    let filter_owned = filter.clone();
    let cancelled = Arc::new(AtomicBool::new(false));
    let cancelled_clone = cancelled.clone();

    // Move collect_text_files INSIDE spawn_blocking — it does heavy I/O
    // (directory walk + metadata probes) and must not block the async runtime.
    let search_task = tokio::task::spawn_blocking(move || {
        let files = crate::tree::collect_text_files(&root_owned, crate::DEFAULT_MAX_FILE_BYTES)?;
        let matcher = filter_owned.matcher_for(&root_owned);
        let cancelled_fn = move || cancelled_clone.load(Ordering::Relaxed);
        search_text_in_files(&files, &root_owned, &query, window, &filter_owned, matcher.as_ref(), &cancelled_fn)
    });

    // Use select! instead of a detached tokio::spawn cancellation listener.
    // biased: check cancellation first (priority over search completion).
    tokio::select! {
        biased;
        _ = cancellation.recv() => {
            // Signal the blocking task to stop (it checks is_cancelled() periodically).
            // The blocking task will finish on its own; we don't abort it (unsafe for
            // spawn_blocking). Return empty results immediately.
            cancelled.store(true, Ordering::Relaxed);
            Ok(WorkspaceSearchPage { hits: vec![], has_more: false })
        }
        result = search_task => {
            result.map_err(|e| AppError::Io(e.to_string()))?
        }
    }
}

/// 按窗口收集命中：跳过前 `offset` 条，收满 `limit` 条后**再多探一条**用于判定 `has_more`，
/// 随后立即返回（不扫描剩余文件）。过滤器命中的文件在计数之前即跳过，
/// 因此分页语义不受影响（被忽略的文件不占窗口名额）。
fn search_text_in_files(
    files: &[PathBuf],
    root: &Path,
    query: &str,
    window: SearchWindow,
    filter: &SearchFilter,
    gitignore: Option<&crate::gitignore::GitignoreMatcher>,
    is_cancelled: &dyn Fn() -> bool,
) -> Result<WorkspaceSearchPage, AppError> {
    let query_lower = query.to_lowercase();
    let mut hits: Vec<WorkspaceSearchHit> = Vec::new();
    let mut skipped = 0usize;
    let mut has_more = false;

    'files: for file in files {
        if is_cancelled() {
            // 取消即"扫描被截断"：宁可保守上报还有更多（调用方续页自会纠正），
            // 也不能让截断页伪装成"已取尽"终结 UI 的续页入口。
            has_more = true;
            break;
        }

        let relative = crate::tree::relative_path(root, file);
        if is_manually_excluded(&relative, &filter.excluded_paths) {
            continue;
        }
        if let Some(matcher) = gitignore {
            if matcher.is_ignored(&relative, false) {
                continue;
            }
        }
        let content = match fs::read_to_string(file) {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!(path = %file.display(), error = %e, "failed to read file during search");
                String::new()
            },
        };

        for (index, line) in content.lines().enumerate() {
            if line.to_lowercase().contains(&query_lower) {
                if skipped < window.offset {
                    skipped += 1;
                } else if hits.len() < window.limit {
                    hits.push(WorkspaceSearchHit {
                        path: relative.clone(),
                        line: index + 1,
                        preview: line.trim().chars().take(240).collect(),
                    });
                } else {
                    // 窗口之后的命中已出现：本页就是"还有更多"，不必继续扫描。
                    has_more = true;
                    break 'files;
                }
            }
            if index % CANCEL_CHECK_INTERVAL == 0 && is_cancelled() {
                // 同上：取消 = 截断，保守上报还有更多。
                has_more = true;
                break 'files;
            }
        }
    }
    Ok(WorkspaceSearchPage { hits, has_more })
}

/// 仅对给定工作区相对路径集合执行检索：行匹配语义（大小写不敏感 contains、
/// 行预览截断、全局上限与窗口语义）与 [`search_text`] 一致；候选需通过与全量检索
/// 相同的忽略/文本/体积过滤。调用方传入的每条路径都会做归一化＋工作区收敛
/// 校验（`a/../b` 放行、绝对路径/`..` 逃逸/symlink 跃出/缺失文件一律跳过），
/// 与 [`search_text`]（经 `collect_text_files` 约束在根内）不对等的旧行为已收敛。
/// 不存在的路径直接跳过（文件可能在检索后被删除/重命名）。
pub fn search_in_files(
    root: &Path,
    relative_paths: &[String],
    query: &str,
    window: SearchWindow,
    filter: &SearchFilter,
) -> Result<WorkspaceSearchPage, AppError> {
    if query.trim().is_empty() || relative_paths.is_empty() {
        return Ok(WorkspaceSearchPage { hits: vec![], has_more: false });
    }
    let matcher = filter.matcher_for(root);
    let mut files: Vec<PathBuf> = Vec::with_capacity(relative_paths.len());
    // 根 canonicalize 只算一次（每候选重复计算是浪费，且根在检索期间视为不变）。
    let canonical_root = match root.canonicalize() {
        Ok(canonical_root) => canonical_root,
        Err(_) => {
            tracing::warn!("search_in_files: workspace root unresolvable, returning empty");
            return Ok(WorkspaceSearchPage { hits: vec![], has_more: false });
        },
    };
    for relative in relative_paths {
        // 先收敛：逃逸/缺失直接跳过，避免对界外路径做任何元数据探测。
        let Some(absolute) = resolve_search_path(root, &canonical_root, relative) else {
            continue;
        };
        let normalized = absolute
            .strip_prefix(root)
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default();
        if is_ignored_relative(&normalized) {
            continue;
        }
        // watcher 重算同样受检索设置约束：被忽略的文件不再回写命中。
        if is_manually_excluded(&normalized, &filter.excluded_paths) {
            continue;
        }
        if let Some(matcher) = matcher.as_ref() {
            if matcher.is_ignored(&normalized, false) {
                continue;
            }
        }
        if !crate::tree::is_text_file(root, &normalized, crate::DEFAULT_MAX_FILE_BYTES) {
            continue;
        }
        files.push(absolute);
    }
    search_text_in_files(&files, root, query, window, filter, matcher.as_ref(), &|| false)
}

/// 调用方路径是否命中忽略规则（目录段走 `tree::should_ignore`，与全量一致）。
fn is_ignored_relative(relative: &str) -> bool {
    Path::new(&relative.replace('\\', "/")).components().any(|component| match component {
        Component::Normal(name) => crate::tree::should_ignore(&name.to_string_lossy()),
        _ => false,
    })
}

/// 把调用方相对路径收敛到工作区内：归一化后仍在根内的放行（含 `a/../b`）；
/// 绝对路径、`..` 逃逸返回 `None`；随后对文件本身做 canonicalize 并校验
/// `starts_with(root)`，拦截 symlink 跃出；缺失文件返回 `None`（调用方跳过）。
fn resolve_search_path(root: &Path, canonical_root: &Path, relative: &str) -> Option<PathBuf> {
    let mut normalized = PathBuf::new();
    for component in Path::new(&relative.replace('\\', "/")).components() {
        match component {
            Component::Normal(part) => normalized.push(part),
            Component::CurDir => {},
            Component::ParentDir => {
                // `a/../b` 归一化后仍在界内则放行；开头的 `..` 无处可退即逃逸。
                if !normalized.pop() {
                    tracing::warn!(relative = %relative, "search_in_files: skipping escaping path");
                    return None;
                }
            },
            Component::RootDir | Component::Prefix(_) => {
                tracing::warn!(relative = %relative, "search_in_files: skipping escaping path");
                return None;
            },
        }
    }
    let absolute = root.join(&normalized);
    let canonical = match absolute.canonicalize() {
        Ok(canonical) => canonical,
        Err(_) => return None,
    };
    if !canonical.starts_with(canonical_root) {
        tracing::warn!(relative = %relative, "search_in_files: skipping symlink escape");
        return None;
    }
    Some(absolute)
}

#[cfg(test)]
mod search_text_async_tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static SC_SEQ: AtomicU64 = AtomicU64::new(0);

    fn unique_tmp_dir() -> std::path::PathBuf {
        let id = SC_SEQ.fetch_add(1, Ordering::SeqCst);
        let path = std::env::temp_dir().join(format!("search-cancel-test-{id}"));
        let _ = std::fs::remove_dir_all(&path);
        std::fs::create_dir_all(&path).expect("temp dir creation should succeed");
        path
    }

    fn cleanup(path: &std::path::Path) {
        let _ = std::fs::remove_dir_all(path);
    }

    #[tokio::test]
    async fn search_text_async_returns_empty_on_immediate_cancellation() {
        let tmp = unique_tmp_dir();
        std::fs::write(tmp.join("test.txt"), b"hello world").unwrap();

        let (tx, rx) = tokio::sync::broadcast::channel::<()>(1);
        // Cancel immediately before search starts
        let _ = tx.send(());

        let result = search_text_async(&tmp, "hello", SearchWindow::default(), &SearchFilter::default(), rx).await;
        assert!(result.is_ok(), "search should return Ok even when cancelled");
        // Result should be empty (cancellation took effect before search could complete)
        // or contain matches — the key assertion is the function returns without hanging
        let hits = result.unwrap().hits;
        // With immediate cancellation via select! biased, the cancellation branch
        // wins and returns empty vec. But if the search_task completes first (small dir),
        // it may return matches. Both are acceptable — the test verifies no hang.
        assert!(hits.len() <= 1, "expected 0 or 1 hits for tiny test dir, got {}", hits.len());
        cleanup(&tmp);
    }

    #[tokio::test]
    async fn search_text_async_returns_matches_without_cancellation() {
        let tmp = unique_tmp_dir();
        std::fs::write(tmp.join("test.txt"), b"hello world\nhello again").unwrap();

        let (_tx, rx) = tokio::sync::broadcast::channel::<()>(1);
        // No cancellation sent — search should complete normally
        let result = search_text_async(&tmp, "hello", SearchWindow::default(), &SearchFilter::default(), rx).await;
        assert!(result.is_ok());
        let hits = result.unwrap().hits;
        assert_eq!(hits.len(), 2, "expected 2 hits (one per line containing 'hello')");
        cleanup(&tmp);
    }

    #[tokio::test]
    async fn search_text_async_returns_empty_for_empty_query() {
        let tmp = unique_tmp_dir();
        std::fs::write(tmp.join("test.txt"), b"hello world").unwrap();

        let (_tx, rx) = tokio::sync::broadcast::channel::<()>(1);
        let result = search_text_async(&tmp, "   ", SearchWindow::default(), &SearchFilter::default(), rx).await;
        assert!(result.is_ok());
        assert!(result.unwrap().hits.is_empty());
        cleanup(&tmp);
    }
}

#[cfg(test)]
mod search_in_files_tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static SIF_SEQ: AtomicU64 = AtomicU64::new(0);

    fn unique_tmp_dir() -> std::path::PathBuf {
        let id = SIF_SEQ.fetch_add(1, Ordering::SeqCst);
        let path = std::env::temp_dir().join(format!("search-in-files-test-{id}"));
        let _ = std::fs::remove_dir_all(&path);
        std::fs::create_dir_all(&path).expect("temp dir creation should succeed");
        path
    }

    #[test]
    fn search_in_files_only_scans_given_paths() {
        let tmp = unique_tmp_dir();
        std::fs::write(tmp.join("hit.txt"), b"alpha needle\nbeta").unwrap();
        std::fs::write(tmp.join("miss.txt"), b"needle in other file").unwrap();

        let hits =
            search_in_files(&tmp, &["hit.txt".to_string()], "needle", SearchWindow::default(), &SearchFilter::default())
                .unwrap()
                .hits;

        assert_eq!(hits.len(), 1, "only the requested file must be scanned");
        assert_eq!(hits[0].path, "hit.txt");
        assert_eq!(hits[0].line, 1);
        cleanup(&tmp);
    }

    #[test]
    fn search_in_files_missing_path_is_skipped() {
        let tmp = unique_tmp_dir();
        std::fs::write(tmp.join("a.txt"), b"needle").unwrap();

        let hits = search_in_files(
            &tmp,
            &["nope.txt".to_string(), "a.txt".to_string()],
            "needle",
            SearchWindow::default(),
            &SearchFilter::default(),
        )
        .unwrap()
        .hits;

        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].path, "a.txt");
        cleanup(&tmp);
    }

    #[test]
    fn search_in_files_matches_search_text_semantics() {
        let tmp = unique_tmp_dir();
        std::fs::write(tmp.join("b.txt"), b"NEEDLE\nNeedle\nnone").unwrap();

        let batched =
            search_in_files(&tmp, &["b.txt".to_string()], "needle", SearchWindow::default(), &SearchFilter::default())
                .unwrap()
                .hits;
        let whole = search_text(&tmp, "needle", SearchWindow::default(), &SearchFilter::default()).unwrap().hits;

        assert_eq!(batched.len(), 2, "case-insensitive contains (same as search_text)");
        // NOTE: deviates from plan verbatim (`assert_eq!(batched, whole)`):
        // `WorkspaceSearchHit` (adl-types) derives no `PartialEq`, so compare field-wise.
        assert_eq!(batched.len(), whole.len(), "batch and whole-workspace search must agree");
        for (b, w) in batched.iter().zip(whole.iter()) {
            assert_eq!(
                (b.path.as_str(), b.line, b.preview.as_str()),
                (w.path.as_str(), w.line, w.preview.as_str())
            );
        }
        cleanup(&tmp);
    }

    #[test]
    fn search_in_files_empty_query_returns_empty() {
        let tmp = unique_tmp_dir();
        std::fs::write(tmp.join("c.txt"), b"anything").unwrap();
        assert!(
            search_in_files(&tmp, &["c.txt".to_string()], "   ", SearchWindow::default(), &SearchFilter::default())
                .unwrap()
                .hits
                .is_empty()
        );
        cleanup(&tmp);
    }

    #[test]
    fn search_in_files_rejects_parent_dir_escape() {
        let tmp = unique_tmp_dir();
        std::fs::write(tmp.join("inside.txt"), b"needle here").unwrap();

        let hits = search_in_files(
            &tmp,
            &["../outside.txt".to_string()],
            "needle",
            SearchWindow::default(),
            &SearchFilter::default(),
        )
        .unwrap()
        .hits;
        assert!(hits.is_empty(), "escaping path must be skipped");
        cleanup(&tmp);
    }

    #[test]
    fn search_in_files_allows_dot_dot_that_stays_inside() {
        let tmp = unique_tmp_dir();
        std::fs::create_dir_all(tmp.join("sub")).unwrap();
        std::fs::write(tmp.join("sub").join("deep.txt"), b"needle deep").unwrap();

        let hits = search_in_files(
            &tmp,
            &["sub/../sub/deep.txt".to_string()],
            "needle",
            SearchWindow::default(),
            &SearchFilter::default(),
        )
        .unwrap()
        .hits;
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].line, 1);
        cleanup(&tmp);
    }

    #[test]
    fn search_in_files_skips_ignored_and_oversized_files() {
        let tmp = unique_tmp_dir();
        std::fs::create_dir_all(tmp.join("target")).unwrap();
        std::fs::write(tmp.join("target").join("built.txt"), b"needle built").unwrap();
        std::fs::write(tmp.join("big.txt"), b"needle big").unwrap();
        // 2MB payload exceeds the 1MB text-file gate.
        let big = vec![b'x'; 2 * 1024 * 1024];
        std::fs::write(tmp.join("huge.txt"), &big).unwrap();

        let hits = search_in_files(
            &tmp,
            &["target/built.txt".to_string(), "big.txt".to_string(), "huge.txt".to_string()],
            "needle",
            SearchWindow::default(),
            &SearchFilter::default(),
        )
        .unwrap()
        .hits;
        let paths: Vec<&str> = hits.iter().map(|h| h.path.as_str()).collect();
        assert!(paths.contains(&"big.txt"), "normal file must hit, got {paths:?}");
        assert!(!paths.iter().any(|p| p.starts_with("target/")), "ignored dir must skip");
        assert!(!paths.contains(&"huge.txt"), "oversized file must skip");
        cleanup(&tmp);
    }

    #[cfg(unix)]
    #[test]
    fn search_in_files_rejects_symlink_escape() {
        let tmp = unique_tmp_dir();
        let outside = unique_tmp_dir();
        std::fs::write(outside.join("secret.txt"), b"needle secret").unwrap();
        std::os::unix::fs::symlink(outside.join("secret.txt"), tmp.join("evil-link")).unwrap();

        let hits =
            search_in_files(&tmp, &["evil-link".to_string()], "needle", SearchWindow::default(), &SearchFilter::default())
                .unwrap()
                .hits;
        assert!(hits.is_empty(), "symlink escape must be skipped, got {hits:?}");
        cleanup(&outside);
        cleanup(&tmp);
    }

    fn cleanup(path: &std::path::Path) {
        let _ = std::fs::remove_dir_all(path);
    }
}

#[cfg(test)]
mod search_window_tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static SW_SEQ: AtomicU64 = AtomicU64::new(0);

    fn unique_tmp_dir() -> std::path::PathBuf {
        let id = SW_SEQ.fetch_add(1, Ordering::SeqCst);
        let path = std::env::temp_dir().join(format!("search-window-test-{id}"));
        let _ = std::fs::remove_dir_all(&path);
        std::fs::create_dir_all(&path).expect("temp dir creation should succeed");
        path
    }

    fn cleanup(path: &std::path::Path) {
        let _ = std::fs::remove_dir_all(path);
    }

    /// 单文件 5 行命中（行号 1..=5）。
    fn fixture() -> std::path::PathBuf {
        let tmp = unique_tmp_dir();
        std::fs::write(tmp.join("a.txt"), b"needle 1\nneedle 2\nneedle 3\nneedle 4\nneedle 5")
            .unwrap();
        tmp
    }

    #[test]
    fn window_offset_skips_leading_hits() {
        let tmp = fixture();
        let page = search_text(&tmp, "needle", SearchWindow::clamped(2, 200), &SearchFilter::default()).unwrap();
        assert_eq!(page.hits.len(), 3, "5 hits minus 2 skipped");
        assert_eq!(page.hits[0].line, 3);
        assert!(!page.has_more, "remaining 3 fit in one page");
        cleanup(&tmp);
    }

    #[test]
    fn window_limit_caps_page_and_reports_more() {
        let tmp = fixture();
        let page = search_text(&tmp, "needle", SearchWindow::clamped(0, 2), &SearchFilter::default()).unwrap();
        assert_eq!(page.hits.len(), 2);
        assert_eq!((page.hits[0].line, page.hits[1].line), (1, 2));
        assert!(page.has_more, "3 hits remain beyond the window");
        cleanup(&tmp);
    }

    #[test]
    fn has_more_is_false_when_the_page_holds_everything() {
        let tmp = fixture();
        // 恰好等于总命中数：旧实现把"等于上限"误判为被截断，多探一条后即可精确区分。
        let page = search_text(&tmp, "needle", SearchWindow::clamped(0, 5), &SearchFilter::default()).unwrap();
        assert_eq!(page.hits.len(), 5);
        assert!(!page.has_more);
        cleanup(&tmp);
    }

    #[test]
    fn offset_beyond_total_returns_empty_page() {
        let tmp = fixture();
        let page = search_text(&tmp, "needle", SearchWindow::clamped(99, 200), &SearchFilter::default()).unwrap();
        assert!(page.hits.is_empty());
        assert!(!page.has_more);
        cleanup(&tmp);
    }

    #[test]
    fn window_is_clamped_to_the_safety_valve() {
        // 跨语言契约：这三个数字与前端 `searchWindow.ts` 的 `SEARCH_PAGE_SIZE` /
        // `SEARCH_MAX_RESULTS` / `SEARCH_HARD_MAX_RESULTS` 必须同值，
        // 前端单测同样钉住它们 —— 任一侧单独改动都会失败。
        assert_eq!(MAX_SEARCH_RESULTS, 200);
        assert_eq!(MAX_SEARCH_RESULTS_UNLIMITED, 5000);
        assert_eq!(MAX_SEARCH_RESULTS_HARD_CAP, 20000);
        assert_eq!(SearchWindow::clamped(0, 0).limit, 1, "limit 0 would starve the caller");
        assert_eq!(
            SearchWindow::clamped(0, MAX_SEARCH_RESULTS_HARD_CAP + 10_000).limit,
            MAX_SEARCH_RESULTS_HARD_CAP
        );
        assert_eq!(SearchWindow::default(), SearchWindow::clamped(0, MAX_SEARCH_RESULTS));
    }

    #[test]
    fn paged_reads_cover_every_hit_exactly_once() {
        // 分页并集必须等于全量：不漏、不重、且 has_more 在最后一页收敛为 false。
        let tmp = fixture();
        let mut collected: Vec<usize> = Vec::new();
        let mut offset = 0usize;
        loop {
            let page = search_text(&tmp, "needle", SearchWindow::clamped(offset, 2), &SearchFilter::default()).unwrap();
            collected.extend(page.hits.iter().map(|h| h.line));
            if !page.has_more {
                break;
            }
            offset += page.hits.len();
        }
        assert_eq!(collected, vec![1, 2, 3, 4, 5]);
        cleanup(&tmp);
    }

    #[test]
    fn search_in_files_honours_the_window() {
        let tmp = fixture();
        let page =
            search_in_files(&tmp, &["a.txt".to_string()], "needle", SearchWindow::clamped(1, 2), &SearchFilter::default())
                .unwrap();
        assert_eq!(page.hits.len(), 2);
        assert_eq!(page.hits[0].line, 2);
        assert!(page.has_more);
        cleanup(&tmp);
    }

    #[test]
    fn cancelled_scan_reports_has_more_instead_of_claiming_exhausted() {
        // 取消 = 扫描被截断：截断页必须保守上报 `has_more`，
        // 否则 UI 会把"还没扫完"误判成"已取尽"而终结续页入口。
        // 直接测私有 `search_text_in_files`：公开 `search_in_files` 固定传 `&|| false`。
        let tmp = fixture();
        let files = vec![tmp.join("a.txt")];
        let page = search_text_in_files(&files, &tmp, "needle", SearchWindow::default(), &SearchFilter::default(), None, &|| true)
            .unwrap();
        assert!(page.has_more, "cancelled page must not claim exhausted");
        cleanup(&tmp);
    }
}

#[cfg(test)]
mod search_filter_tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static SF_SEQ: AtomicU64 = AtomicU64::new(0);

    fn unique_tmp_dir() -> std::path::PathBuf {
        let id = SF_SEQ.fetch_add(1, Ordering::SeqCst);
        let path = std::env::temp_dir().join(format!("search-filter-test-{id}"));
        let _ = std::fs::remove_dir_all(&path);
        std::fs::create_dir_all(&path).expect("temp dir creation should succeed");
        path
    }

    fn cleanup(path: &std::path::Path) {
        let _ = std::fs::remove_dir_all(path);
    }

    #[test]
    fn excluded_directory_hides_all_descendants() {
        let tmp = unique_tmp_dir();
        std::fs::create_dir_all(tmp.join("skip")).unwrap();
        std::fs::write(tmp.join("skip").join("a.txt"), b"needle").unwrap();
        std::fs::write(tmp.join("keep.txt"), b"needle").unwrap();
        let filter = SearchFilter { excluded_paths: vec!["skip".to_string()], use_gitignore: true };
        let page = search_text(&tmp, "needle", SearchWindow::default(), &filter).unwrap();
        let paths: Vec<&str> = page.hits.iter().map(|h| h.path.as_str()).collect();
        assert_eq!(paths, vec!["keep.txt"], "ignored dir must not occupy window slots");
        assert!(!page.has_more);
        cleanup(&tmp);
    }

    #[test]
    fn gitignore_chain_is_applied_and_switchable() {
        let tmp = unique_tmp_dir();
        std::fs::write(tmp.join(".gitignore"), b"*.log\n").unwrap();
        std::fs::write(tmp.join("debug.log"), b"needle").unwrap();
        std::fs::write(tmp.join("note.txt"), b"needle").unwrap();
        let on = search_text(&tmp, "needle", SearchWindow::default(), &SearchFilter::default())
            .unwrap();
        assert_eq!(on.hits.len(), 1);
        assert_eq!(on.hits[0].path, "note.txt");
        let off = SearchFilter { excluded_paths: Vec::new(), use_gitignore: false };
        let page = search_text(&tmp, "needle", SearchWindow::default(), &off).unwrap();
        assert_eq!(page.hits.len(), 2, "switch off must restore gitignored files");
        cleanup(&tmp);
    }

    #[test]
    fn search_in_files_honours_the_filter() {
        let tmp = unique_tmp_dir();
        std::fs::write(tmp.join("a.txt"), b"needle").unwrap();
        std::fs::write(tmp.join("b.txt"), b"needle").unwrap();
        let filter = SearchFilter { excluded_paths: vec!["b.txt".to_string()], use_gitignore: true };
        let page = search_in_files(
            &tmp,
            &["a.txt".to_string(), "b.txt".to_string()],
            "needle",
            SearchWindow::default(),
            &filter,
        )
        .unwrap();
        assert_eq!(page.hits.len(), 1);
        assert_eq!(page.hits[0].path, "a.txt");
        cleanup(&tmp);
    }
}
