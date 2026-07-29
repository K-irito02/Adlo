use adl_errors::AppError;
use adl_types::{BranchProgress, GitVisBranchEdge, GitVisBranchGraph, GitVisBranchNode};
use std::collections::HashMap;
use std::collections::HashSet;
use std::path::Path;
use tokio::task::JoinSet;
use tracing::{debug, warn};

#[allow(clippy::if_same_then_else)]
pub async fn capture_branch_graph(root: &Path) -> Result<GitVisBranchGraph, AppError> {
    let t0 = std::time::Instant::now();
    debug!("[ADL-GIT-VIS] [branch_graph] running: git log --all --topo-order");

    let raw = super::super::git_helpers::run_git_with_timeout(
        root,
        &["log", "--all", "--topo-order", "--pretty=format:%B%x00%H|%h|%P|%D|%aI|%an|%ae%x00"],
    )
    .await
    .ok_or_else(|| AppError::Workspace("git log --all failed".into()))?;

    let mut nodes: Vec<GitVisBranchNode> = Vec::new();
    let mut edges: Vec<GitVisBranchEdge> = Vec::new();
    let mut branch_set: Vec<String> = Vec::new();
    let mut branch_seen: HashSet<String> = HashSet::new();
    let mut head_branch: String = String::new();

    let null_parts: Vec<&str> = raw.split('\0').collect();
    for chunk in null_parts.chunks(2) {
        if chunk.len() < 2 {
            continue;
        }
        let message = chunk[0].trim().to_string();
        let header = chunk[1];
        let parts: Vec<&str> = header.split('|').collect();
        if parts.len() < 7 {
            continue;
        }
        let hash = parts[0].to_string();
        let short_hash = parts[1].to_string();
        let parent_hashes: Vec<String> =
            parts[2].split_whitespace().filter(|s| !s.is_empty()).map(|s| s.to_string()).collect();
        let refs_raw = parts[3].trim();
        let date = parts[4].to_string();
        let author = parts[5].to_string();
        let author_email = parts[6].to_string();

        let mut branch = String::new();
        let mut tag: Option<String> = None;
        let mut all_refs: Vec<String> = Vec::new();
        if !refs_raw.is_empty() {
            let refs: Vec<&str> = refs_raw.split(", ").collect();
            for r in &refs {
                let r2 = r.trim();
                if let Some(stripped) = r2.strip_prefix("tag: ") {
                    tag = Some(stripped.to_string());
                    all_refs.push(stripped.to_string());
                } else if let Some(stripped) = r2.strip_prefix("HEAD -> ") {
                    if head_branch.is_empty() {
                        head_branch = stripped.to_string();
                    }
                    all_refs.push(stripped.to_string());
                    if branch.is_empty() {
                        branch = stripped.to_string();
                        if branch_seen.insert(branch.clone()) {
                            branch_set.push(branch.clone());
                        }
                    }
                } else if !r2.starts_with("tag:") {
                    all_refs.push(r2.to_string());
                    if branch.is_empty() {
                        branch = r2.to_string();
                    } else if !r2.starts_with("origin/")
                        && !r2.starts_with("upstream/")
                        && (branch.starts_with("origin/") || branch.starts_with("upstream/"))
                    {
                        branch = r2.to_string();
                    }
                    let r2_str = r2.to_string();
                    if branch_seen.insert(r2_str.clone()) {
                        branch_set.push(r2_str);
                    }
                }
            }
        }

        for p in &parent_hashes {
            edges.push(GitVisBranchEdge { from: hash.clone(), to: p.clone() });
        }

        nodes.push(GitVisBranchNode {
            hash,
            short_hash,
            parent_hashes,
            branch,
            refs: all_refs,
            date,
            message,
            author,
            author_email,
            tag,
        });
    }

    // Branch names are only set for HEAD commits (those directly pointed to by a ref).
    // Non-HEAD commits get branch display from the frontend's column/lane assignment,
    // which correctly resolves the owning branch via topological order.
    // No propagation is performed — shared ancestors would get an ambiguous result.

    // Sort branches: HEAD branch first, local branches, remote refs, origin/HEAD last
    branch_set.sort_by(|a, b| {
        if *a == head_branch {
            return std::cmp::Ordering::Less;
        }
        if *b == head_branch {
            return std::cmp::Ordering::Greater;
        }
        if a == "origin/HEAD" {
            return std::cmp::Ordering::Greater;
        }
        if b == "origin/HEAD" {
            return std::cmp::Ordering::Less;
        }
        let a_is_remote = a.starts_with("origin/") || a.starts_with("upstream/");
        let b_is_remote = b.starts_with("origin/") || b.starts_with("upstream/");
        match (a_is_remote, b_is_remote) {
            (true, false) => std::cmp::Ordering::Greater,
            (false, true) => std::cmp::Ordering::Less,
            _ => a.cmp(b),
        }
    });

    let mut branch_progress: HashMap<String, BranchProgress> = HashMap::new();

    let mut js = JoinSet::new();
    for branch in &branch_set {
        if branch.starts_with("origin/") || branch == "HEAD" {
            continue;
        }
        let remote = format!("origin/{}", branch);
        let root = root.to_path_buf();
        let branch_name = branch.clone();

        js.spawn(async move {
            let remote_ok = super::super::git_helpers::run_git_with_timeout(
                &root,
                &["rev-parse", "--verify", &remote],
            )
            .await;

            if remote_ok.is_none() {
                let count = super::super::git_helpers::run_git_with_timeout(
                    &root,
                    &["rev-list", "--count", &branch_name, "--not", "--all"],
                )
                .await
                .unwrap_or_default();
                let ahead = count.trim().parse::<u32>().unwrap_or(0);
                return (branch_name, BranchProgress { ahead, behind: 0, merge_base: None });
            }

            let ahead_range = format!("{}..{}", remote, branch_name);
            let behind_range = format!("{}..{}", branch_name, remote);
            let ahead_args = vec!["rev-list", "--count", &ahead_range];
            let behind_args = vec!["rev-list", "--count", &behind_range];
            let merge_args = vec!["merge-base", &branch_name, &remote];
            let (a, b, mb) = tokio::join!(
                super::super::git_helpers::run_git_with_timeout(&root, &ahead_args),
                super::super::git_helpers::run_git_with_timeout(&root, &behind_args),
                super::super::git_helpers::run_git_with_timeout(&root, &merge_args),
            );

            (
                branch_name,
                BranchProgress {
                    ahead: a.unwrap_or_default().trim().parse().unwrap_or(0),
                    behind: b.unwrap_or_default().trim().parse().unwrap_or(0),
                    merge_base: mb.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
                },
            )
        });
    }

    while let Some(res) = js.join_next().await {
        match res {
            Ok((name, progress)) => {
                branch_progress.insert(name, progress);
            },
            Err(e) => warn!("[ADL-GIT-VIS] branch progress task failed: {:?}", e),
        }
    }

    debug!(
        "[ADL-GIT-VIS] [branch_graph] [{}] done in {:?} — {} nodes, {} edges, {} branches head={}",
        root.display(),
        t0.elapsed(),
        nodes.len(),
        edges.len(),
        branch_set.len(),
        head_branch,
    );

    Ok(GitVisBranchGraph { nodes, edges, branches: branch_set, branch_progress })
}
