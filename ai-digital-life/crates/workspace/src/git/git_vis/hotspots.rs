use adl_errors::AppError;
use adl_types::{GitVisFileHotspotFile, GitVisFileHotspotNode, GitVisFileHotspots};
use std::collections::BTreeMap;
use std::path::Path;
use tracing::debug;

/// Per-file aggregation state during numstat parsing.
#[derive(Default, Clone)]
struct FileAgg {
    change_count: i32,
    additions: i32,
    deletions: i32,
    last_modified: String,
}

pub async fn capture_file_hotspots(
    root: &Path,
    since: Option<&str>,
    until: Option<&str>,
) -> Result<GitVisFileHotspots, AppError> {
    let t0 = std::time::Instant::now();
    debug!(
        "[ADL-GIT-VIS] [file_hotspots] running: git log --numstat (since={:?}, until={:?})",
        since, until
    );

    let mut args: Vec<String> =
        vec!["log".to_string(), "--pretty=format:%H|%aI".to_string(), "--numstat".to_string()];
    if let Some(s) = since {
        args.push(format!("--since={}", s));
    }
    if let Some(u) = until {
        args.push(format!("--until={}", u));
    }

    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let raw = super::super::git_helpers::run_git_with_timeout(root, &args_ref)
        .await
        .ok_or_else(|| AppError::Workspace("git log --numstat failed for file_hotspots".into()))?;

    let file_map = aggregate_numstat_by_path(&raw);
    let files = build_flat_files(&file_map);
    let tree = build_hotspot_tree(&files);

    debug!(
        "[ADL-GIT-VIS] [file_hotspots] [{}] done in {:?} — {} files",
        root.display(),
        t0.elapsed(),
        files.len()
    );

    Ok(GitVisFileHotspots { tree, files })
}

/// Parse `git log --pretty=format:%H|%aI --numstat` output, aggregating per-file.
fn aggregate_numstat_by_path(raw: &str) -> BTreeMap<String, FileAgg> {
    let mut map: BTreeMap<String, FileAgg> = BTreeMap::new();
    let mut current_date: Option<String> = None;

    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        // Try parsing as numstat row first (tab-separated, 3 fields)
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() == 3 {
            let adds_raw = parts[0];
            let dels_raw = parts[1];
            let path = parts[2].to_string();
            if path.is_empty() {
                continue;
            }

            let entry = map.entry(path).or_default();
            entry.change_count += 1;

            // Binary files show "-" for additions/deletions
            let adds: i32 = adds_raw.parse().unwrap_or(0);
            let dels: i32 = dels_raw.parse().unwrap_or(0);
            entry.additions += adds;
            entry.deletions += dels;

            if let Some(ref date) = current_date {
                if date > &entry.last_modified || entry.last_modified.is_empty() {
                    entry.last_modified = date.clone();
                }
            }
            continue;
        }

        // Otherwise try parsing as commit header (%H|%aI)
        if let Some(date) = header_date(line) {
            current_date = Some(date);
        } else {
            tracing::warn!("[ADL-GIT-VIS] [file_hotspots] skipping unparseable line: {}", line);
        }
    }

    map
}

/// Extract leading YYYY-MM-DD from a `%H|%aI` header line.
fn header_date(line: &str) -> Option<String> {
    let pipe_pos = line.find('|')?;
    let date_part = &line[pipe_pos + 1..];
    if date_part.len() < 10 {
        return None;
    }
    let head = &date_part[..10];
    let bytes = head.as_bytes();
    if bytes.len() != 10 || !bytes[0..4].iter().all(|b| b.is_ascii_digit()) || bytes[4] != b'-' {
        return None;
    }
    Some(head.to_string())
}

/// Convert aggregated map to flat file list, sorted by change_count descending.
fn build_flat_files(map: &BTreeMap<String, FileAgg>) -> Vec<GitVisFileHotspotFile> {
    let mut files: Vec<GitVisFileHotspotFile> = map
        .iter()
        .map(|(path, agg)| GitVisFileHotspotFile {
            path: path.clone(),
            change_count: agg.change_count,
            additions: agg.additions,
            deletions: agg.deletions,
            last_modified: agg.last_modified.clone(),
        })
        .collect();
    files.sort_by(|a, b| b.change_count.cmp(&a.change_count).then_with(|| a.path.cmp(&b.path)));
    files
}

/// Build a directory tree from flat file list, aggregating counts at each directory.
fn build_hotspot_tree(files: &[GitVisFileHotspotFile]) -> GitVisFileHotspotNode {
    let mut root = GitVisFileHotspotNode {
        name: "root".to_string(),
        node_type: "directory".to_string(),
        change_count: None,
        additions: None,
        deletions: None,
        last_modified: None,
        children: Some(Vec::new()),
    };

    for file in files {
        let parts: Vec<&str> = file.path.split('/').collect();
        add_to_hotspot_tree(&mut root, &parts, 0, file);
    }

    // Aggregate directory stats from children (post-order)
    aggregate_directory_stats(&mut root);

    root
}

fn add_to_hotspot_tree(
    node: &mut GitVisFileHotspotNode,
    parts: &[&str],
    idx: usize,
    file: &GitVisFileHotspotFile,
) {
    if idx >= parts.len() {
        return;
    }
    let name = parts[idx].to_string();
    let is_file = idx == parts.len() - 1;
    let node_type = if is_file { "file" } else { "directory" };

    let children = node.children.get_or_insert_with(Vec::new);
    if let Some(existing) = children.iter_mut().find(|c| c.name == name && c.node_type == node_type)
    {
        if is_file {
            existing.change_count = Some(file.change_count);
            existing.additions = Some(file.additions);
            existing.deletions = Some(file.deletions);
            existing.last_modified = Some(file.last_modified.clone());
        } else {
            add_to_hotspot_tree(existing, parts, idx + 1, file);
        }
    } else {
        let mut new_node = GitVisFileHotspotNode {
            name,
            node_type: node_type.to_string(),
            change_count: if is_file { Some(file.change_count) } else { None },
            additions: if is_file { Some(file.additions) } else { None },
            deletions: if is_file { Some(file.deletions) } else { None },
            last_modified: if is_file { Some(file.last_modified.clone()) } else { None },
            children: if is_file { None } else { Some(Vec::new()) },
        };
        if !is_file {
            add_to_hotspot_tree(&mut new_node, parts, idx + 1, file);
        }
        children.push(new_node);
    }
}

/// Post-order aggregation: directory stats = sum of children stats, last_modified = max.
fn aggregate_directory_stats(node: &mut GitVisFileHotspotNode) {
    if node.node_type == "file" {
        return;
    }
    let Some(children) = node.children.as_mut() else {
        return;
    };

    let mut total_change = 0;
    let mut total_add = 0;
    let mut total_del = 0;
    let mut max_date = String::new();

    for child in children.iter_mut() {
        aggregate_directory_stats(child);
        total_change += child.change_count.unwrap_or(0);
        total_add += child.additions.unwrap_or(0);
        total_del += child.deletions.unwrap_or(0);
        if let Some(d) = &child.last_modified {
            if d > &max_date {
                max_date = d.clone();
            }
        }
    }

    node.change_count = Some(total_change);
    node.additions = Some(total_add);
    node.deletions = Some(total_del);
    if !max_date.is_empty() {
        node.last_modified = Some(max_date);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aggregate_numstat_by_path_parses_and_aggregates() {
        let raw = "abc123|2026-07-31T10:00:00+08:00\n10\t5\tsrc/main.rs\nabc123|2026-07-31T10:00:00+08:00\n3\t1\tsrc/main.rs\ndef456|2026-08-01T12:00:00+08:00\n20\t8\tlib/utils.rs";
        let map = aggregate_numstat_by_path(raw);

        assert_eq!(map.get("src/main.rs").unwrap().change_count, 2);
        assert_eq!(map.get("src/main.rs").unwrap().additions, 13);
        assert_eq!(map.get("src/main.rs").unwrap().deletions, 6);
        assert_eq!(map.get("src/main.rs").unwrap().last_modified, "2026-07-31");
        assert_eq!(map.get("lib/utils.rs").unwrap().change_count, 1);
        assert_eq!(map.get("lib/utils.rs").unwrap().last_modified, "2026-08-01");
    }

    #[test]
    fn aggregate_numstat_handles_binary_files() {
        let raw = "abc|2026-07-31T10:00:00+08:00\n-\t-\tassets/logo.png";
        let map = aggregate_numstat_by_path(raw);
        let entry = map.get("assets/logo.png").unwrap();
        assert_eq!(entry.change_count, 1);
        assert_eq!(entry.additions, 0);
        assert_eq!(entry.deletions, 0);
    }

    #[test]
    fn aggregate_numstat_skips_unparseable_lines() {
        let raw = "garbage line\nabc|2026-07-31\n5\t2\tsrc/main.rs";
        let map = aggregate_numstat_by_path(raw);
        assert_eq!(map.len(), 1);
        assert!(map.contains_key("src/main.rs"));
    }

    #[test]
    fn build_flat_files_sorts_by_change_count_desc() {
        let mut map = BTreeMap::new();
        map.insert(
            "a.rs".to_string(),
            FileAgg {
                change_count: 5,
                additions: 10,
                deletions: 2,
                last_modified: "2026-07-01".into(),
            },
        );
        map.insert(
            "b.rs".to_string(),
            FileAgg {
                change_count: 20,
                additions: 40,
                deletions: 10,
                last_modified: "2026-08-01".into(),
            },
        );
        map.insert(
            "c.rs".to_string(),
            FileAgg {
                change_count: 5,
                additions: 1,
                deletions: 1,
                last_modified: "2026-07-15".into(),
            },
        );
        let files = build_flat_files(&map);
        assert_eq!(files[0].path, "b.rs");
        assert_eq!(files[0].change_count, 20);
        // Tie-break by path ascending
        assert_eq!(files[1].path, "a.rs");
        assert_eq!(files[2].path, "c.rs");
    }

    #[test]
    fn build_hotspot_tree_aggregates_directory_stats() {
        let files = vec![
            GitVisFileHotspotFile {
                path: "src/main.rs".into(),
                change_count: 10,
                additions: 20,
                deletions: 5,
                last_modified: "2026-07-31".into(),
            },
            GitVisFileHotspotFile {
                path: "src/lib.rs".into(),
                change_count: 5,
                additions: 8,
                deletions: 3,
                last_modified: "2026-08-01".into(),
            },
        ];
        let tree = build_hotspot_tree(&files);

        assert_eq!(tree.name, "root");
        assert_eq!(tree.node_type, "directory");
        assert_eq!(tree.change_count, Some(15));
        assert_eq!(tree.additions, Some(28));
        assert_eq!(tree.deletions, Some(8));
        assert_eq!(tree.last_modified.as_deref(), Some("2026-08-01"));

        let src = tree.children.as_ref().unwrap().iter().find(|c| c.name == "src").unwrap();
        assert_eq!(src.change_count, Some(15));
        assert_eq!(src.last_modified.as_deref(), Some("2026-08-01"));
    }

    #[test]
    fn build_hotspot_tree_handles_empty_files() {
        let tree = build_hotspot_tree(&[]);
        assert_eq!(tree.name, "root");
        assert_eq!(tree.change_count, Some(0));
        assert!(tree.children.as_ref().unwrap().is_empty());
    }

    #[test]
    fn header_date_extracts_date_from_hash_pipe_iso() {
        assert_eq!(
            header_date("abc123def|2026-07-31T10:00:00+08:00"),
            Some("2026-07-31".to_string())
        );
        assert_eq!(header_date("not a header"), None);
        assert_eq!(header_date("abc|short"), None);
    }
}
