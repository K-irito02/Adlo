use adl_errors::AppError;
use adl_types::{GitVisBranchEdge, GitVisBranchGraph, GitVisBranchNode};
use std::collections::HashMap;
use std::collections::HashSet;
use std::path::Path;
use tracing::debug;

pub async fn capture_branch_graph(root: &Path) -> Result<GitVisBranchGraph, AppError> {
    let t0 = std::time::Instant::now();
    debug!("[ADL-GIT-VIS] [branch_graph] running: git log --all --topo-order");

    let raw = super::super::git_helpers::run_git_with_timeout(
        root,
        &["log", "--all", "--topo-order", "--pretty=format:%H|%h|%P|%D|%aI|%an|%ae|%s"],
    )
    .await
    .ok_or_else(|| AppError::Workspace("git log --all failed".into()))?;

    let mut nodes: Vec<GitVisBranchNode> = Vec::new();
    let mut edges: Vec<GitVisBranchEdge> = Vec::new();
    let mut branch_set: HashSet<String> = HashSet::new();

    for line in raw.lines() {
        let parts: Vec<&str> = line.splitn(8, '|').collect();
        if parts.len() < 8 {
            continue;
        }
        let hash = parts[0].to_string();
        let short_hash = parts[1].to_string();
        let parent_hashes: Vec<String> =
            parts[2].split_whitespace().filter(|s| !s.is_empty()).map(|s| s.to_string()).collect();
        let refs_raw = parts[3].trim();
        let date = parts[4].to_string();
        let message = parts[7].to_string();
        let author = parts[5].to_string();
        let author_email = parts[6].to_string();

        let mut branch = String::new();
        let mut tag: Option<String> = None;
        if !refs_raw.is_empty() {
            let refs: Vec<&str> = refs_raw.split(", ").collect();
            for r in &refs {
                let r2 = r.trim();
                if let Some(stripped) = r2.strip_prefix("tag: ") {
                    tag = Some(stripped.to_string());
                } else if let Some(stripped) = r2.strip_prefix("HEAD -> ") {
                    branch = stripped.to_string();
                    branch_set.insert(branch.clone());
                } else if !r2.starts_with("tag:") {
                    branch = r2.to_string();
                    branch_set.insert(branch.clone());
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
            date,
            message,
            author,
            author_email,
            tag,
        });
    }

    // Propagate branch names from children to parents via edges
    let mut branch_of: HashMap<String, String> = HashMap::new();
    for n in &nodes {
        if !n.branch.is_empty() {
            branch_of.insert(n.hash.clone(), n.branch.clone());
        }
    }
    let mut changed = true;
    while changed {
        changed = false;
        for edge in &edges {
            let child_hash = &edge.from;
            let parent_hash = &edge.to;
            if !branch_of.contains_key(parent_hash) {
                if let Some(b) = branch_of.get(child_hash) {
                    branch_of.insert(parent_hash.clone(), b.clone());
                    changed = true;
                }
            }
        }
    }
    for node in &mut nodes {
        if node.branch.is_empty() {
            if let Some(b) = branch_of.get(&node.hash) {
                node.branch = b.clone();
            }
        }
    }

    let branches: Vec<String> = branch_set.into_iter().collect();

    debug!(
        "[ADL-GIT-VIS] [branch_graph] [{}] done in {:?} — {} nodes, {} edges, {} branches",
        root.display(),
        t0.elapsed(),
        nodes.len(),
        edges.len(),
        branches.len()
    );

    Ok(GitVisBranchGraph { nodes, edges, branches })
}
