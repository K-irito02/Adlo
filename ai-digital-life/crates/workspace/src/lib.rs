//! Workspace detection, lightweight indexing, search, and git snapshots.

pub(crate) mod detect;
pub(crate) mod fs;
mod git;
pub(crate) mod gitignore;
pub(crate) mod preview;
mod search;
mod tree;
pub mod tree_cache_store;
mod watch;

pub use detect::{
    detect_root, open_workspace, stable_workspace_id, strip_verbatim_prefix, workspace_type,
};
pub use fs::{
    create_file, create_folder, delete_entry, duplicate_entry, move_entry, rename_entry,
    update_file,
};
pub use git::git_vis::{
    capture_branch_graph, capture_code_evolution, capture_commit_stats,
    capture_contributor_modules, capture_file_hotspots,
};
pub use git::{
    capture_git_snapshot, capture_git_snapshot_async, create_git_branch, discard_file_changes,
    ensure_branch_worktree, git_has_local_changes, has_auto_stash, list_git_branches,
    list_worktrees, pop_auto_stash, prune_worktrees, remove_worktree, sibling_worktree_dir,
    stage_file, switch_git_branch, unstage_file, worktree_for_branch,
};
pub use gitignore::{GitignoreMatcher, GitignoreRuleSet, load_gitignore_chain};
pub use preview::read_change_preview;
pub use search::{
    MAX_SEARCH_RESULTS, MAX_SEARCH_RESULTS_HARD_CAP, MAX_SEARCH_RESULTS_UNLIMITED, SearchFilter,
    SearchWindow, search_in_files, search_text, search_text_async,
};
pub use tree::{
    build_retrieval_snapshot, build_retrieval_snapshot_async, invalidate_tree_cache, list_tree,
    list_tree_cached_stale_ok, list_tree_force, list_tree_fresh, remove_tree_cache_row,
    tree_cache_dir, tree_cache_dir_env_override,
};
pub use watch::{FilesChangedBatch, WorkspaceWatcher};

use adl_errors::AppError;
use adl_types::FileOutlineItem;

pub fn outline(root: &Path, relative_path: &str) -> Result<Vec<FileOutlineItem>, AppError> {
    // 大纲解析锁定 1MB（Phase 4 审查 R7）：read_file 的 8MB 只服务用户主动打开，
    // outline 走检索级门限，避免 8MB 全量 walk 拖慢后台任务。
    let content = adl_fs_ops::read_text_file(root, relative_path, DEFAULT_MAX_FILE_BYTES)?;
    let total_lines = content.lines().count().max(1);
    adl_outline::outline(&content, relative_path, total_lines)
}

use adl_types::WorkspaceFileDocument;
use adl_types::WorkspaceMediaDocument;
use base64::Engine as _;
use std::path::Path;

/// 检索/树扫描/大纲共用门限（1MB）：语义是"后台批量通道上限"，
/// 不要把它也提到 8MB；用户主动开文件走下面的 TEXT/MEDIA 常量。
/// 变更预览的 current/base 双侧同样走 8MB（事项3）：读到之后是否渲染由前端
/// HeavyPreviewGate（1M 字符确认门）决定，后端不再先于确认门拒掉。
pub(crate) const DEFAULT_MAX_FILE_BYTES: u64 = 1024 * 1024;
/// 媒体/办公二进制读取上限（50 MiB）：图片/文档通常远小于此值；
/// 大视频超限时返回 InvalidInput，前端展示居中友好错误（含重试与体积说明）。
pub(crate) const DEFAULT_MAX_MEDIA_BYTES: u64 = 50 * 1024 * 1024;

/// 开文件文本上限（8MB）：搜索/树扫描/变更预览继续共用上面的 1MB，
/// 只有用户主动打开文件的 read_file 走这里；超 1MB 内容由前端重型门
/// 先提示、确认后才渲染，避免大文件解码/高亮卡住界面。
pub(crate) const DEFAULT_MAX_TEXT_FILE_BYTES: u64 = 8 * 1024 * 1024;

pub fn read_file(root: &Path, relative_path: &str) -> Result<WorkspaceFileDocument, AppError> {
    // mtime 取数走同一最终 canonical 路径（收尾 M1），与读内容同信任链，
    // 避免弱 resolve 与强 canonical 两条路径分裂。
    let canonical = adl_fs_ops::resolve_workspace_file(root, relative_path)?;
    let content = adl_fs_ops::read_text_file(root, relative_path, DEFAULT_MAX_TEXT_FILE_BYTES)?;
    let modified = crate::fs::file_modified_at(&canonical);
    Ok(WorkspaceFileDocument {
        path: relative_path.replace('\\', "/"),
        content,
        last_modified_at: modified,
    })
}

/// 按扩展名推断媒体 MIME（仅用于前端 Blob 构造与原生标签渲染，不做安全判定）。
/// 未命中时回落 `application/octet-stream`：前端按扩展名二次路由渲染器，
/// MIME 只决定 Blob 类型串（见 FilePreviewRenderers）；SVG 脚本风险由前端承担——
/// SVG 必须只经 `<img>` 渲染，禁止内联/iframe/object（见 MediaPreview）。
pub fn guess_media_mime(relative_path: &str) -> &'static str {
    let normalized = relative_path.replace('\\', "/");
    let file_name = normalized.rsplit('/').next().unwrap_or(&normalized);
    // 无点文件名（Makefile 等）显式回落，不拿整名比较；
    // 点文件（.gitignore）按后缀走表，未命中即 octet-stream。
    if !file_name.contains('.') {
        return "application/octet-stream";
    }
    let ext = file_name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "apng" => "image/apng",
        "svg" => "image/svg+xml",
        "tif" | "tiff" => "image/tiff",
        "heic" => "image/heic",
        "heif" => "image/heif",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" | "oga" => "audio/ogg",
        "m4a" => "audio/mp4",
        "flac" => "audio/flac",
        "aac" => "audio/aac",
        "opus" => "audio/opus",
        "weba" => "audio/webm",
        "wma" => "audio/x-ms-wma",
        "aiff" | "aif" => "audio/aiff",
        "mid" | "midi" => "audio/midi",
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "mkv" => "video/x-matroska",
        "avi" => "video/x-msvideo",
        "ogv" => "video/ogg",
        "wmv" => "video/x-ms-wmv",
        "flv" | "f4v" => "video/x-flv",
        "mpg" | "mpeg" => "video/mpeg",
        "3gp" => "video/3gpp",
        "3g2" => "video/3gpp2",
        "pdf" => "application/pdf",
        "csv" => "text/csv",
        "docx" | "docm" | "dotx" | "dotm" => {
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        },
        "doc" | "dot" => "application/msword",
        "xlsx" | "xlsm" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "xls" | "xlsb" => "application/vnd.ms-excel",
        "ods" => "application/vnd.oasis.opendocument.spreadsheet",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "ppsx" => "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
        "ppt" => "application/vnd.ms-powerpoint",
        "odp" => "application/vnd.oasis.opendocument.presentation",
        _ => "application/octet-stream",
    }
}

pub fn read_media_file(
    root: &Path,
    relative_path: &str,
) -> Result<WorkspaceMediaDocument, AppError> {
    read_media_file_with_limit(root, relative_path, DEFAULT_MAX_MEDIA_BYTES)
}

pub(crate) fn read_media_file_with_limit(
    root: &Path,
    relative_path: &str,
    max_bytes: u64,
) -> Result<WorkspaceMediaDocument, AppError> {
    // mtime 取数走同一最终 canonical 路径（收尾 M1），与读内容同信任链。
    let canonical = adl_fs_ops::resolve_workspace_file(root, relative_path)?;
    let bytes = adl_fs_ops::read_binary_file(root, relative_path, max_bytes)?;
    let modified = crate::fs::file_modified_at(&canonical);
    Ok(WorkspaceMediaDocument {
        path: relative_path.replace('\\', "/"),
        mime: guess_media_mime(relative_path).to_string(),
        base64: base64::engine::general_purpose::STANDARD.encode(&bytes),
        size: bytes.len() as u64,
        last_modified_at: modified,
    })
}

pub fn get_absolute_path(root: &Path, relative_path: &str) -> Result<String, AppError> {
    let path = adl_fs_ops::resolve_workspace_path(root, relative_path)?;
    let absolute = path
        .canonicalize()
        .map_err(|e| AppError::Workspace(format!("failed to resolve path: {e}")))?;
    let s = absolute.to_string_lossy().replace('\\', "/");
    let s = if cfg!(windows) { s.strip_prefix("//?/").unwrap_or(&s).to_string() } else { s };
    Ok(s)
}

#[cfg(test)]
mod tests {
    use super::*;
    use adl_types::{WorkspaceChangeKind, WorkspaceChangeStatus, WorkspaceType};
    use std::path::Path;
    use std::process::Command;

    fn run_git_test(dir: &Path, args: &[&str]) {
        let status = Command::new("git")
            .args(args)
            .current_dir(dir)
            .status()
            .expect("git should be available for workspace tests");
        assert!(status.success(), "git command failed: git {}", args.join(" "));
    }

    fn init_git_repo(dir: &Path) {
        run_git_test(dir, &["init"]);
        run_git_test(dir, &["config", "user.email", "adl-tests@example.com"]);
        run_git_test(dir, &["config", "user.name", "ADL Tests"]);
    }

    #[test]
    fn detects_workspace_type_from_cargo() {
        let dir = std::env::temp_dir().join(format!("adl-workspace-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("Cargo.toml"), "[package]\nname='x'").unwrap();
        assert_eq!(workspace_type(&dir), WorkspaceType::Rust);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn update_file_overwrites_and_reports_mtime() {
        let dir =
            std::env::temp_dir().join(format!("adl-workspace-update-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("note.txt"), "v1\n").unwrap();

        let doc = update_file(&dir, "note.txt", "v2\n").unwrap();
        assert_eq!(doc.path, "note.txt");
        assert_eq!(doc.content, "v2\n");
        assert_eq!(std::fs::read_to_string(dir.join("note.txt")).unwrap(), "v2\n");

        let missing = update_file(&dir, "ghost.txt", "x");
        assert!(matches!(missing, Err(AppError::NotFound(_))));

        std::fs::create_dir_all(dir.join("subdir")).unwrap();
        let dir_target = update_file(&dir, "subdir", "x");
        assert!(matches!(dir_target, Err(AppError::InvalidInput(_))));

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn creates_file_and_folder_in_workspace() {
        let dir =
            std::env::temp_dir().join(format!("adl-workspace-create-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();

        let created = create_file(&dir, "docs/spec.md", "# spec\n").unwrap();
        assert_eq!(created.path, "docs/spec.md");
        assert!(dir.join("docs/spec.md").exists());

        create_folder(&dir, "empty-dir").unwrap();
        let tree = list_tree(&dir).unwrap();
        assert!(tree.iter().any(|node| node.path == "docs"));
        assert!(tree.iter().any(|node| node.path == "empty-dir"));

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    #[ignore = "requires git in PATH"]
    fn captures_git_snapshot_for_untracked_and_unstaged_files() {
        let dir = std::env::temp_dir().join(format!("adl-workspace-git-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        init_git_repo(&dir);
        std::fs::write(dir.join("tracked.txt"), "hello\n").unwrap();
        run_git_test(&dir, &["add", "tracked.txt"]);
        run_git_test(&dir, &["commit", "-m", "init"]);

        std::fs::write(dir.join("tracked.txt"), "hello again\n").unwrap();
        std::fs::write(dir.join("new file.txt"), "new\n").unwrap();

        let snapshot = capture_git_snapshot(&dir);
        assert!(snapshot.unstaged.iter().any(|path| path == "tracked.txt"));
        assert!(snapshot.untracked.iter().any(|path| path == "new file.txt"));

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn markdown_outline_keeps_full_heading_text_and_depth() {
        let dir =
            std::env::temp_dir().join(format!("adl-workspace-outline-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("AGENTS.md"),
            "# AI 数字生命 - 项目治理规则\n\n## 当前阶段\n\n### 已实现功能\n",
        )
        .unwrap();

        let items = outline(&dir, "AGENTS.md").unwrap();

        assert_eq!(items.len(), 3);
        assert_eq!(items[0].label, "AI 数字生命 - 项目治理规则");
        assert_eq!(items[0].depth, Some(1));
        assert_eq!(items[1].label, "当前阶段");
        assert_eq!(items[1].depth, Some(2));
        assert_eq!(items[2].label, "已实现功能");
        assert_eq!(items[2].depth, Some(3));

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn markdown_outline_ignores_fenced_headings_and_closing_hashes() {
        let dir = std::env::temp_dir()
            .join(format!("adl-workspace-outline-fence-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("README.md"),
            "# Visible Heading ###\n\n```md\n# Hidden Heading\n```\n\n## Second Heading\n",
        )
        .unwrap();

        let items = outline(&dir, "README.md").unwrap();

        assert_eq!(items.len(), 2);
        assert_eq!(items[0].label, "Visible Heading");
        assert_eq!(items[0].depth, Some(1));
        assert_eq!(items[1].label, "Second Heading");
        assert_eq!(items[1].depth, Some(2));

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn code_outline_builds_nested_brace_symbols() {
        let dir = std::env::temp_dir()
            .join(format!("adl-workspace-outline-brace-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(dir.join("src")).unwrap();
        std::fs::write(
            dir.join("src/runtime.ts"),
            "export class Runtime {\n  public boot() {\n    const state = {\n      ready: true\n    };\n  }\n}\n",
        )
        .unwrap();

        let items = outline(&dir, "src/runtime.ts").unwrap();

        assert_eq!(items.len(), 3);
        assert_eq!(items[0].label, "Runtime");
        assert_eq!(items[0].kind, "class");
        assert_eq!(items[0].depth, Some(1));
        assert_eq!(items[1].label, "boot");
        assert_eq!(items[1].kind, "method");
        assert_eq!(items[1].depth, Some(2));
        assert_eq!(items[2].label, "state");
        assert_eq!(items[2].kind, "const");
        assert_eq!(items[2].depth, Some(3));

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn code_outline_supports_python_yaml_and_vue_structures() {
        let dir = std::env::temp_dir()
            .join(format!("adl-workspace-outline-structured-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(dir.join("app")).unwrap();
        std::fs::write(
            dir.join("app/main.py"),
            "class App:\n    def run(self):\n        def inner():\n            return True\n",
        )
        .unwrap();
        std::fs::write(
            dir.join("app/config.yaml"),
            "server:\n  http:\n    routes:\n      - path:\n          secure: true\n",
        )
        .unwrap();
        std::fs::write(
            dir.join("app/HeroCard.vue"),
            "<template>\n  <section id=\"hero\">\n    <div class=\"panel\"></div>\n  </section>\n</template>\n<script>\nexport class HeroCard {\n  public render() {\n  }\n}\n</script>\n<style>\n.hero-card {\n  color: red;\n}\n</style>\n",
        )
        .unwrap();

        let py_items = outline(&dir, "app/main.py").unwrap();
        let yaml_items = outline(&dir, "app/config.yaml").unwrap();
        let vue_items = outline(&dir, "app/HeroCard.vue").unwrap();

        assert_eq!(
            py_items.iter().map(|item| (item.label.as_str(), item.depth)).collect::<Vec<_>>(),
            vec![("App", Some(1)), ("run", Some(2)), ("inner", Some(3))]
        );
        assert_eq!(
            yaml_items.iter().map(|item| (item.label.as_str(), item.depth)).collect::<Vec<_>>(),
            vec![("server", Some(1)), ("http", Some(2)), ("routes", Some(3)), ("- path", Some(4))]
        );
        assert_eq!(
            vue_items.iter().map(|item| (item.label.as_str(), item.depth)).collect::<Vec<_>>(),
            vec![
                ("template", Some(1)),
                ("section#hero", Some(2)),
                ("div.panel", Some(3)),
                ("script", Some(1)),
                ("HeroCard", Some(2)),
                ("render", Some(3)),
                ("style", Some(1)),
                (".hero-card", Some(2))
            ]
        );

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    #[ignore = "requires git in PATH"]
    fn reads_deleted_change_preview_from_head() {
        let dir = std::env::temp_dir()
            .join(format!("adl-workspace-change-preview-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(dir.join("resume")).unwrap();
        init_git_repo(&dir);
        std::fs::write(dir.join("resume/index.html"), "<h1>resume</h1>\n").unwrap();
        run_git_test(&dir, &["add", "resume/index.html"]);
        run_git_test(&dir, &["commit", "-m", "init"]);

        std::fs::remove_file(dir.join("resume/index.html")).unwrap();

        let preview = read_change_preview(&dir, "resume/index.html").unwrap();
        assert_eq!(preview.change_kind, WorkspaceChangeKind::Deleted);
        assert_eq!(preview.status, WorkspaceChangeStatus::Modified);
        assert!(preview.base_exists);
        assert!(!preview.current_exists);
        assert!(preview.base_content.contains("resume"));
        assert!(preview.current_content.is_empty());

        let _ = std::fs::remove_dir_all(dir);
    }

    // 事项3：变更预览与用户主动开文件对齐到 8MB（此前 current/base 双双卡 1MB，
    // 超限直接 InvalidInput，前端 HeavyPreviewGate 根本到不了）。
    // 2MB 样本：1MB 门下被拒，8MB 门下放行。
    #[test]
    #[ignore = "requires git in PATH"]
    fn reads_large_untracked_change_preview_up_to_text_limit() {
        let dir = std::env::temp_dir()
            .join(format!("adl-workspace-change-preview-large-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        init_git_repo(&dir);
        let big = "x".repeat(2 * 1024 * 1024);
        std::fs::write(dir.join("big.json"), &big).unwrap();

        let preview = read_change_preview(&dir, "big.json").unwrap();
        assert_eq!(preview.change_kind, WorkspaceChangeKind::Added);
        assert_eq!(preview.current_content.len(), big.len());

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    #[ignore = "requires git in PATH"]
    fn reads_large_base_blob_change_preview_up_to_text_limit() {
        let dir = std::env::temp_dir()
            .join(format!("adl-workspace-change-preview-large-base-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        init_git_repo(&dir);
        let big = "y".repeat(2 * 1024 * 1024);
        std::fs::write(dir.join("big.json"), &big).unwrap();
        run_git_test(&dir, &["add", "big.json"]);
        run_git_test(&dir, &["commit", "-m", "init"]);
        std::fs::write(dir.join("big.json"), "small").unwrap();

        let preview = read_change_preview(&dir, "big.json").unwrap();
        assert_eq!(preview.base_content.len(), big.len());
        assert_eq!(preview.current_content, "small");

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn guess_media_mime_covers_common_types() {
        assert_eq!(guess_media_mime("a.png"), "image/png");
        assert_eq!(guess_media_mime("a.JPG"), "image/jpeg");
        assert_eq!(guess_media_mime("a.svg"), "image/svg+xml");
        assert_eq!(guess_media_mime("clip.mp4"), "video/mp4");
        assert_eq!(guess_media_mime("clip.wmv"), "video/x-ms-wmv");
        assert_eq!(guess_media_mime("sound.mp3"), "audio/mpeg");
        assert_eq!(guess_media_mime("sound.wma"), "audio/x-ms-wma");
        assert_eq!(
            guess_media_mime("doc/a.docx"),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );
        assert_eq!(
            guess_media_mime("doc/a.docm"),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );
        assert_eq!(guess_media_mime("doc/a.dot"), "application/msword");
        assert_eq!(guess_media_mime("doc/a.pdf"), "application/pdf");
        assert_eq!(guess_media_mime("doc/a.csv"), "text/csv");
        assert_eq!(guess_media_mime("a.unknown-ext"), "application/octet-stream");
    }

    #[test]
    fn guess_media_mime_handles_backslash_and_edge_names() {
        assert_eq!(guess_media_mime("doc\\clip.MP4"), "video/mp4");
        assert_eq!(guess_media_mime("noext"), "application/octet-stream");
        assert_eq!(guess_media_mime(".gitignore"), "application/octet-stream");
        assert_eq!(guess_media_mime("archive.tar.gz"), "application/octet-stream");
    }

    #[test]
    fn outline_keeps_1mb_limit_for_large_text() {
        // 大纲锁定检索级门限：2MB 文本 outline 应拒绝而非全量解析（R7）。
        let dir = std::env::temp_dir()
            .join(format!("adl-workspace-outline-limit-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let big = format!("# Title\n{}", "x".repeat(2 * 1024 * 1024));
        std::fs::write(dir.join("big.md"), &big).unwrap();

        let err = outline(&dir, "big.md").unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn read_media_file_returns_base64_with_mime() {
        let dir =
            std::env::temp_dir().join(format!("adl-workspace-media-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("clip.mp4"), [0u8, 1u8, 2u8, 3u8]).unwrap();

        let doc = read_media_file(&dir, "clip.mp4").unwrap();
        assert_eq!(doc.path, "clip.mp4");
        assert_eq!(doc.mime, "video/mp4");
        assert_eq!(doc.size, 4);
        assert_eq!(doc.base64, "AAECAw==");

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn read_file_allows_text_above_legacy_1mb_limit() {
        // 开文件文本上限 8MB：2MB 文本可读（旧 1MB 上限会拒），渲染侧由前端重型门把关。
        let dir =
            std::env::temp_dir().join(format!("adl-workspace-text-limit-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let big = "x".repeat(2 * 1024 * 1024);
        std::fs::write(dir.join("big.txt"), &big).unwrap();

        let doc = read_file(&dir, "big.txt").unwrap();
        assert_eq!(doc.content.len(), big.len());

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn read_media_file_rejects_over_limit() {
        let dir = std::env::temp_dir()
            .join(format!("adl-workspace-media-limit-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("big.mp4"), vec![9u8; 32]).unwrap();

        let err = read_media_file_with_limit(&dir, "big.mp4", 8).unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn stable_workspace_id_normalizes_path_separators() {
        let path1 = Path::new("C:\\Users\\test\\workspace");
        let path2 = Path::new("C:/Users/test/workspace");
        let id1 = stable_workspace_id(path1);
        let id2 = stable_workspace_id(path2);
        assert_eq!(id1, id2);
    }

    #[test]
    fn stable_workspace_id_is_case_insensitive() {
        let path1 = Path::new("C:/Users/TEST/workspace");
        let path2 = Path::new("C:/Users/test/workspace");
        let id1 = stable_workspace_id(path1);
        let id2 = stable_workspace_id(path2);
        assert_eq!(id1, id2);
    }

    #[test]
    fn stable_workspace_id_produces_consistent_format() {
        let path = Path::new("C:/Users/test/workspace");
        let id = stable_workspace_id(path);
        assert!(id.starts_with("workspace_"));
        assert_eq!(id.len(), "workspace_".len() + 8);
    }

    #[test]
    fn workspace_type_detection_rust() {
        let dir = std::env::temp_dir().join(format!("adl-ws-type-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("Cargo.toml"), "[package]\nname='x'").unwrap();
        assert_eq!(workspace_type(&dir), WorkspaceType::Rust);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn workspace_type_detection_node() {
        let dir = std::env::temp_dir().join(format!("adl-ws-type-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("package.json"), "{}").unwrap();
        assert_eq!(workspace_type(&dir), WorkspaceType::Node);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn workspace_type_detection_python() {
        let dir = std::env::temp_dir().join(format!("adl-ws-type-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("pyproject.toml"), "[project]").unwrap();
        assert_eq!(workspace_type(&dir), WorkspaceType::Python);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn workspace_type_detection_go() {
        let dir = std::env::temp_dir().join(format!("adl-ws-type-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("go.mod"), "module example").unwrap();
        assert_eq!(workspace_type(&dir), WorkspaceType::Go);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn workspace_type_detection_java() {
        let dir = std::env::temp_dir().join(format!("adl-ws-type-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("pom.xml"), "<project>").unwrap();
        assert_eq!(workspace_type(&dir), WorkspaceType::Java);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn workspace_type_detection_unknown() {
        let dir = std::env::temp_dir().join(format!("adl-ws-type-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(workspace_type(&dir), WorkspaceType::Unknown);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    #[ignore = "requires git in PATH"]
    fn git_has_local_changes_returns_false_for_clean_repo() {
        let dir = std::env::temp_dir().join(format!("adl-ws-clean-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        init_git_repo(&dir);
        std::fs::write(dir.join("README.md"), "# Test").unwrap();
        run_git_test(&dir, &["add", "README.md"]);
        run_git_test(&dir, &["commit", "-m", "init"]);

        let snapshot = capture_git_snapshot(&dir);
        assert!(!git_has_local_changes(&snapshot));

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    #[ignore = "requires git in PATH"]
    fn git_has_local_changes_returns_true_with_unstaged() {
        let dir = std::env::temp_dir().join(format!("adl-ws-unstaged-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        init_git_repo(&dir);
        std::fs::write(dir.join("README.md"), "# Test").unwrap();
        run_git_test(&dir, &["add", "README.md"]);
        run_git_test(&dir, &["commit", "-m", "init"]);
        std::fs::write(dir.join("README.md"), "# Test Updated").unwrap();

        let snapshot = capture_git_snapshot(&dir);
        assert!(git_has_local_changes(&snapshot));

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    #[ignore = "requires git in PATH"]
    fn git_has_local_changes_returns_true_with_untracked() {
        let dir = std::env::temp_dir().join(format!("adl-ws-untracked-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        init_git_repo(&dir);
        std::fs::write(dir.join("README.md"), "# Test").unwrap();
        run_git_test(&dir, &["add", "README.md"]);
        run_git_test(&dir, &["commit", "-m", "init"]);
        std::fs::write(dir.join("new.txt"), "new file").unwrap();

        let snapshot = capture_git_snapshot(&dir);
        assert!(git_has_local_changes(&snapshot));

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    #[ignore = "requires git in PATH"]
    fn list_git_branches_returns_current_branch() {
        let dir = std::env::temp_dir().join(format!("adl-ws-branches-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        init_git_repo(&dir);
        std::fs::write(dir.join("README.md"), "# Test").unwrap();
        run_git_test(&dir, &["add", "README.md"]);
        run_git_test(&dir, &["commit", "-m", "init"]);

        let branches = list_git_branches(&dir).unwrap();
        assert!(!branches.is_empty());
        let current = branches.iter().find(|b| b.is_current);
        assert!(current.is_some());

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn search_text_returns_matches() {
        let dir = std::env::temp_dir().join(format!("adl-ws-search-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("test.txt"), "hello world\nfoo bar\nhello again").unwrap();

        let hits = search_text(&dir, "hello", SearchWindow::default(), &SearchFilter::default())
            .unwrap()
            .hits;
        assert_eq!(hits.len(), 2);
        assert_eq!(hits[0].path, "test.txt");
        assert_eq!(hits[0].line, 1);
        assert_eq!(hits[1].line, 3);

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn search_text_is_case_insensitive() {
        let dir = std::env::temp_dir().join(format!("adl-ws-search-case-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("test.txt"), "Hello World").unwrap();

        let hits = search_text(&dir, "hello", SearchWindow::default(), &SearchFilter::default())
            .unwrap()
            .hits;
        assert_eq!(hits.len(), 1);

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn search_text_returns_empty_for_no_matches() {
        let dir =
            std::env::temp_dir().join(format!("adl-ws-search-empty-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("test.txt"), "hello world").unwrap();

        let hits = search_text(&dir, "xyz", SearchWindow::default(), &SearchFilter::default())
            .unwrap()
            .hits;
        assert!(hits.is_empty());

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn search_text_ignores_empty_query() {
        let dir =
            std::env::temp_dir().join(format!("adl-ws-search-empty-q-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("test.txt"), "hello world").unwrap();

        let hits =
            search_text(&dir, "", SearchWindow::default(), &SearchFilter::default()).unwrap().hits;
        assert!(hits.is_empty());

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn search_text_limits_results() {
        let dir =
            std::env::temp_dir().join(format!("adl-ws-search-limit-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        for i in 0..300 {
            std::fs::write(dir.join(format!("file{}.txt", i)), "hello world").unwrap();
        }

        let hits = search_text(&dir, "hello", SearchWindow::default(), &SearchFilter::default())
            .unwrap()
            .hits;
        assert!(hits.len() <= 200);

        let _ = std::fs::remove_dir_all(dir);
    }
}
