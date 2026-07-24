use adl_errors::AppError;
use adl_types::GitVisFileSunburst;
use adl_types::GitVisSunburstNode;
use std::path::Path;
use tracing::debug;

pub async fn capture_file_sunburst(root: &Path) -> Result<GitVisFileSunburst, AppError> {
    let t0 = std::time::Instant::now();
    debug!("[ADL-GIT-VIS] [file_sunburst] running: git ls-files");

    let raw = super::super::git_helpers::run_git_with_timeout(root, &["ls-files"])
        .await
        .ok_or_else(|| AppError::Workspace("git ls-files failed".into()))?;

    let files: Vec<String> =
        raw.lines().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();

    let mut tree = GitVisSunburstNode {
        name: "root".to_string(),
        node_type: "directory".to_string(),
        size: None,
        children: Some(Vec::new()),
    };

    for file in &files {
        let parts: Vec<&str> = file.split('/').collect();
        add_to_sunburst(&mut tree, &parts, 0);
    }

    fn add_to_sunburst(node: &mut GitVisSunburstNode, parts: &[&str], idx: usize) {
        if idx >= parts.len() {
            return;
        }
        let name = parts[idx].to_string();
        let is_file = idx == parts.len() - 1;
        let node_type = if is_file { "file" } else { "directory" };

        let children = node.children.get_or_insert_with(Vec::new);
        if let Some(existing) = children.iter_mut().find(|c| c.name == name) {
            if is_file {
                existing.size = Some(existing.size.unwrap_or(0) + 1);
            } else {
                add_to_sunburst(existing, parts, idx + 1);
            }
        } else {
            let mut new_node = GitVisSunburstNode {
                name,
                node_type: node_type.to_string(),
                size: if is_file { Some(1) } else { None },
                children: if is_file { None } else { Some(Vec::new()) },
            };
            if !is_file {
                add_to_sunburst(&mut new_node, parts, idx + 1);
            }
            children.push(new_node);
        }
    }

    debug!(
        "[ADL-GIT-VIS] [file_sunburst] [{}] done in {:?} — {} files",
        root.display(),
        t0.elapsed(),
        files.len()
    );

    Ok(GitVisFileSunburst { tree })
}
