use adl_errors::AppError;
use adl_types::{GitVisContributorModule, GitVisContributorModules, GitVisModuleEntry};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use tracing::debug;

use super::helpers::build_time_filter;

pub async fn capture_contributor_modules(
    root: &Path,
    since: Option<&str>,
    until: Option<&str>,
) -> Result<GitVisContributorModules, AppError> {
    let t0 = std::time::Instant::now();
    let time_filter = build_time_filter(since, until);
    let mut args: Vec<&str> =
        vec!["-c", "core.quotepath=false", "log", "--pretty=format:%an|%ae", "--name-only"];
    args.extend(time_filter.iter().map(|s| s.as_str()));

    debug!("[ADL-GIT-VIS] [contributor_modules] running: git {}", args.join(" "));

    let raw = super::super::git_helpers::run_git_with_timeout(root, &args)
        .await
        .ok_or_else(|| AppError::Workspace("git log --name-only failed".into()))?;

    let mut author_modules: HashMap<String, (String, HashMap<String, i32>)> = HashMap::new();
    let mut current_author: Option<String> = None;
    let mut current_email: String = String::new();
    let mut all_paths_set: HashSet<String> = HashSet::new();

    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some(_pipe_idx) = trimmed.find('|') {
            let parts: Vec<&str> = trimmed.splitn(2, '|').collect();
            current_author = Some(parts[0].to_string());
            current_email = parts.get(1).unwrap_or(&"").to_string();
        } else if let Some(ref author) = current_author {
            let entry = author_modules
                .entry(author.clone())
                .or_insert_with(|| (current_email.clone(), HashMap::new()));
            *entry.1.entry(trimmed.to_string()).or_insert(0) += 1;
            all_paths_set.insert(trimmed.to_string());
        }
    }

    let all_paths: Vec<String> = {
        let mut v: Vec<String> = all_paths_set.into_iter().collect();
        v.sort();
        v
    };

    let matrix: Vec<GitVisContributorModule> = author_modules
        .into_iter()
        .map(|(author, (author_email, modules))| GitVisContributorModule {
            author,
            author_email,
            modules: modules
                .into_iter()
                .map(|(module, count)| GitVisModuleEntry { module, count })
                .collect(),
        })
        .collect();

    debug!(
        "[ADL-GIT-VIS] [contributor_modules] [{}] done in {:?} — {} contributors, {} unique paths",
        root.display(),
        t0.elapsed(),
        matrix.len(),
        all_paths.len()
    );

    Ok(GitVisContributorModules { matrix, all_paths })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    use std::process::Command;

    #[test]
    fn test_all_paths_collection() {
        let mut all_paths_set: HashSet<String> = HashSet::new();
        let paths = ["src/a.ts", "src/b.ts", "docs/readme.md", "src/a.ts"];

        for p in &paths {
            all_paths_set.insert(p.to_string());
        }

        assert_eq!(all_paths_set.len(), 3);
        assert!(all_paths_set.contains("src/a.ts"));
        assert!(all_paths_set.contains("src/b.ts"));
        assert!(all_paths_set.contains("docs/readme.md"));
    }

    fn run_git(dir: &Path, args: &[&str]) {
        let status = Command::new("git")
            .args(args)
            .current_dir(dir)
            .status()
            .expect("git should be available");
        assert!(status.success(), "git command failed: git {}", args.join(" "));
    }

    #[tokio::test]
    #[ignore = "requires git in PATH"]
    async fn capture_contributor_modules_returns_all_paths() {
        let dir =
            std::env::temp_dir().join(format!("adl-contrib-modules-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        run_git(&dir, &["init"]);
        run_git(&dir, &["config", "user.email", "test@test.com"]);
        run_git(&dir, &["config", "user.name", "Test User"]);

        std::fs::create_dir_all(dir.join("src")).unwrap();
        std::fs::create_dir_all(dir.join("docs")).unwrap();
        std::fs::write(dir.join("src/lib.rs"), "pub fn foo() {}").unwrap();
        std::fs::write(dir.join("src/main.rs"), "fn main() {}").unwrap();
        std::fs::write(dir.join("docs/readme.md"), "# Docs").unwrap();
        run_git(&dir, &["add", "-A"]);
        run_git(&dir, &["commit", "-m", "initial"]);

        let result = capture_contributor_modules(&dir, None, None).await.unwrap();

        assert!(!result.all_paths.is_empty(), "all_paths should not be empty");
        assert!(
            result.all_paths.contains(&"src/lib.rs".to_string()),
            "expected src/lib.rs in all_paths, got: {:?}",
            result.all_paths
        );
        assert!(
            result.all_paths.contains(&"src/main.rs".to_string()),
            "expected src/main.rs in all_paths"
        );
        assert!(
            result.all_paths.contains(&"docs/readme.md".to_string()),
            "expected docs/readme.md in all_paths"
        );
        assert_eq!(result.all_paths.len(), 3, "expected 3 unique paths");
        assert!(result.all_paths.windows(2).all(|w| w[0] <= w[1]), "all_paths should be sorted");

        let test_user_mod = result.matrix.iter().find(|m| m.author == "Test User").unwrap();
        let paths: Vec<&str> = test_user_mod.modules.iter().map(|e| e.module.as_str()).collect();
        assert!(
            paths.contains(&"src/lib.rs"),
            "module entry should use full path, got: {:?}",
            paths
        );

        let _ = std::fs::remove_dir_all(dir);
    }
}
