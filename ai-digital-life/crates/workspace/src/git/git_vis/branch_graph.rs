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
    let mut branch_set: Vec<String> = Vec::new();
    let mut branch_seen: HashSet<String> = HashSet::new();
    let mut head_branch: String = String::new();

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
                    if head_branch.is_empty() {
                        head_branch = stripped.to_string();
                    }
                    if branch.is_empty() {
                        branch = stripped.to_string();
                        if branch_seen.insert(branch.clone()) {
                            branch_set.push(branch.clone());
                        }
                    }
                } else if !r2.starts_with("tag:") {
                    if branch.is_empty() {
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

    debug!(
        "[ADL-GIT-VIS] [branch_graph] [{}] done in {:?} — {} nodes, {} edges, {} branches head={}",
        root.display(),
        t0.elapsed(),
        nodes.len(),
        edges.len(),
        branch_set.len(),
        head_branch,
    );

    Ok(GitVisBranchGraph { nodes, edges, branches: branch_set })
}
