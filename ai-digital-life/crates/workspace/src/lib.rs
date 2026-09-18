//! Workspace detection, lightweight indexing, search, and git snapshots.

pub(crate) mod detect;
pub(crate) mod fs;
mod git;
pub(crate) mod preview;
mod search;
mod tree;
mod watch;

pub use detect::{
    detect_root, open_workspace, stable_workspace_id, strip_verbatim_prefix, workspace_type,
};
pub use fs::{create_file, create_folder, delete_entry, duplicate_entry, move_entry, rename_entry};
pub use git::git_vis::{
    capture_branch_graph, capture_code_evolution, capture_commit_stats,
    capture_contributor_modules, capture_file_hotspots,
};
pub use git::{
    capture_git_snapshot, capture_git_snapshot_async, create_git_branch, discard_file_changes,
    git_has_local_changes, has_auto_stash, list_git_branches, pop_auto_stash, stage_file,
    switch_git_branch, unstage_file,
};
pub use preview::read_change_preview;
pub use search::{
    MAX_SEARCH_RESULTS, MAX_SEARCH_RESULTS_UNLIMITED, SearchWindow, search_in_files, search_text,
    search_text_async,
};
pub use tree::{
    build_retrieval_snapshot, build_retrieval_snapshot_async, invalidate_tree_cache, list_tree,
    list_tree_cached, list_tree_force,
};
pub use watch::{FilesChangedBatch, WorkspaceWatcher};

use adl_errors::AppError;
use adl_types::FileOutlineItem;

pub fn outline(root: &Path, relative_path: &str) -> Result<Vec<FileOutlineItem>, AppError> {
    let doc = read_file(root, relative_path)?;
    let total_lines = doc.content.lines().count().max(1);
    adl_outline::outline(&doc.content, relative_path, total_lines)
}

use adl_types::WorkspaceFileDocument;
use std::path::Path;

pub(crate) const DEFAULT_MAX_FILE_BYTES: u64 = 1024 * 1024;

pub fn read_file(root: &Path, relative_path: &str) -> Result<WorkspaceFileDocument, AppError> {
    let path = adl_fs_ops::resolve_workspace_path(root, relative_path)?;
    let content = adl_fs_ops::read_text_file(root, relative_path, DEFAULT_MAX_FILE_BYTES)?;
    let modified = crate::fs::file_modified_at(&path);
    Ok(WorkspaceFileDocument {
        path: relative_path.replace('\\', "/"),
        content,
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

        let hits = search_text(&dir, "hello", SearchWindow::default()).unwrap().hits;
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

        let hits = search_text(&dir, "hello", SearchWindow::default()).unwrap().hits;
        assert_eq!(hits.len(), 1);

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn search_text_returns_empty_for_no_matches() {
        let dir =
            std::env::temp_dir().join(format!("adl-ws-search-empty-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("test.txt"), "hello world").unwrap();

        let hits = search_text(&dir, "xyz", SearchWindow::default()).unwrap().hits;
        assert!(hits.is_empty());

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn search_text_ignores_empty_query() {
        let dir =
            std::env::temp_dir().join(format!("adl-ws-search-empty-q-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("test.txt"), "hello world").unwrap();

        let hits = search_text(&dir, "", SearchWindow::default()).unwrap().hits;
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

        let hits = search_text(&dir, "hello", SearchWindow::default()).unwrap().hits;
        assert!(hits.len() <= 200);

        let _ = std::fs::remove_dir_all(dir);
    }
}
