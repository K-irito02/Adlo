use adl_errors::AppError;
use adl_types::{
    GitVisBranchEdge, GitVisBranchGraph, GitVisBranchNode, GitVisCodeEvolution,
    GitVisCodeEvolutionWeek, GitVisCommitRow, GitVisCommitStats, GitVisContributorActivity,
    GitVisContributorModule, GitVisContributorModules, GitVisContributorPeriod,
    GitVisDailyCommit, GitVisFileSunburst, GitVisHourlyBin, GitVisModuleEntry,
    GitVisSunburstNode, GitVisTimelinePoint,
};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::Path;
use tracing::debug;

fn build_time_filter(since: Option<&str>, until: Option<&str>) -> Vec<String> {
    let mut args: Vec<String> = Vec::new();
    if let Some(s) = since {
        if !s.is_empty() {
            args.push(format!("--since={}", s));
        }
    }
    if let Some(u) = until {
        if !u.is_empty() {
            args.push(format!("--until={}", u));
        }
    }
    args
}

#[allow(dead_code)]
fn parse_commit_log(raw: &str) -> Vec<GitVisCommitRow> {
    raw.lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(6, '|').collect();
            if parts.len() < 6 {
                return None;
            }
            Some(GitVisCommitRow {
                hash: parts[0].to_string(),
                short_hash: parts[1].to_string(),
                date: parts[2].to_string(),
                author: parts[3].to_string(),
                author_email: parts[4].to_string(),
                message: parts[5].to_string(),
            })
        })
        .collect()
}

pub async fn capture_commit_stats(
    root: &Path,
    since: Option<&str>,
    until: Option<&str>,
) -> Result<GitVisCommitStats, AppError> {
    let t0 = std::time::Instant::now();
    let time_filter = build_time_filter(since, until);
    let mut args: Vec<&str> = vec!["log", "--pretty=format:%H|%h|%aI|%an|%ae|%s"];
    args.extend(time_filter.iter().map(|s| s.as_str()));

    debug!(
        "[ADL-GIT-VIS] [commit_stats] running: git {} | args: {:?}",
        args.join(" "),
        root.display()
    );

    let raw = super::git_helpers::run_git_with_timeout(root, &args)
        .await
        .ok_or_else(|| AppError::Workspace("git log failed for commit_stats".into()))?;

    let commits = parse_commit_log(&raw);
    let commit_count = commits.len();
    debug!(
        "[ADL-GIT-VIS] [commit_stats] [{}] parsed {} commits",
        root.display(),
        commit_count
    );

    let mut daily_map: BTreeMap<String, i32> = BTreeMap::new();
    let mut hourly_map: HashMap<(i32, i32), i32> = HashMap::new();
    let mut author_map: HashMap<String, (String, i32, BTreeMap<String, i32>)> = HashMap::new();
    let mut timeline_cumulative: i32 = 0;
    let mut timeline_points: Vec<GitVisTimelinePoint> = Vec::new();

    for c in &commits {
        let date10: String = c.date.chars().take(10).collect();
        *daily_map.entry(date10.clone()).or_insert(0) += 1;

        if let Some(dt) = parse_date_parts(&c.date) {
            *hourly_map.entry((dt.day_of_week, dt.hour)).or_insert(0) += 1;
        }

        let entry = author_map
            .entry(c.author.clone())
            .or_insert_with(|| (c.author_email.clone(), 0, BTreeMap::new()));
        entry.1 += 1;
        let week_key = if let Some(dt) = parse_date_parts(&c.date) {
            format!("{}-W{:02}", dt.year, dt.week)
        } else {
            date10.clone()
        };
        *entry.2.entry(week_key.clone()).or_insert(0) += 1;

        timeline_cumulative += 1;
        timeline_points.push(GitVisTimelinePoint {
            date: date10,
            cumulative: timeline_cumulative,
        });
    }

    let daily_commits: Vec<GitVisDailyCommit> = daily_map
        .into_iter()
        .map(|(date, count)| GitVisDailyCommit { date, count })
        .collect();

    let hourly_distribution: Vec<GitVisHourlyBin> = hourly_map
        .into_iter()
        .map(|((day, hour), count)| GitVisHourlyBin { day, hour, count })
        .collect();

    let contributor_activity: Vec<GitVisContributorActivity> = author_map
        .into_iter()
        .map(|(author, (author_email, total_commits, periods))| GitVisContributorActivity {
            author,
            author_email,
            total_commits,
            periods: periods
                .into_iter()
                .map(|(period, count)| GitVisContributorPeriod { period, count })
                .collect(),
        })
        .collect();

    debug!(
        "[ADL-GIT-VIS] [commit_stats] [{}] done in {:?} — {} commits, {} daily, {} hourly bins, {} contributors",
        root.display(),
        t0.elapsed(),
        commit_count,
        daily_commits.len(),
        hourly_distribution.len(),
        contributor_activity.len(),
    );

    Ok(GitVisCommitStats {
        daily_commits,
        hourly_distribution,
        contributor_activity,
        commit_timeline: timeline_points,
        commits,
    })
}

struct DateParts {
    year: i32,
    week: i32,
    day_of_week: i32,
    hour: i32,
}

fn parse_date_parts(iso: &str) -> Option<DateParts> {
    let s = iso.trim();
    if s.len() < 13 { return None; }
    let year: i32 = s[0..4].parse().ok()?;
    let month: u32 = s[5..7].parse().ok()?;
    let day: u32 = s[8..10].parse().ok()?;
    let hour: i32 = s[11..13].parse().ok()?;

    let a = (14 - month as i32) / 12;
    let y = year - a;
    let m = month as i32 + 12 * a - 2;
    let julian = (day as i32 + (31 * m) / 12 + y + y / 4 - y / 100 + y / 400) as u32;
    let day_of_week = ((julian + 1) % 7) as i32; // 0=Mon, 6=Sun

    let jan4_day = (6 + year * 365 + year / 4 - year / 100 + year / 400) % 7;
    let jan4_julian = 4 + if jan4_day <= 3 { 3 - jan4_day as i32 } else { 10 - jan4_day as i32 };
    let week = 1 + (julian as i32 - jan4_julian) / 7;
    let week = if week < 1 { 52 + if week == 0 { 0 } else { -1 } } else { week };

    Some(DateParts { year, week, day_of_week, hour })
}

pub async fn capture_code_evolution(
    root: &Path,
    since: Option<&str>,
    until: Option<&str>,
) -> Result<GitVisCodeEvolution, AppError> {
    let t0 = std::time::Instant::now();
    let time_filter = build_time_filter(since, until);
    let mut args: Vec<&str> = vec!["log", "--pretty=format:%H|%aI", "--numstat"];
    args.extend(time_filter.iter().map(|s| s.as_str()));

    debug!("[ADL-GIT-VIS] [code_evolution] running: git {}", args.join(" "));

    let raw = super::git_helpers::run_git_with_timeout(root, &args)
        .await
        .ok_or_else(|| AppError::Workspace("git log --numstat failed".into()))?;

    let mut week_map: BTreeMap<String, (i32, i32)> = BTreeMap::new();
    for line in raw.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() == 3 {
            let add: i32 = parts[0].parse().unwrap_or(0);
            let del: i32 = parts[1].parse().unwrap_or(0);
            if let Some(iso_date) = parts.last() {
                if iso_date.len() >= 10 {
                    let date_str = &iso_date[0..10];
                    let entry = week_map.entry(start_of_week(date_str)).or_insert((0, 0));
                    entry.0 += add;
                    entry.1 += del;
                }
            }
        } else if parts.len() == 2 && parts[0].starts_with("20") {
        }
    }

    let weeks: Vec<GitVisCodeEvolutionWeek> = week_map
        .into_iter()
        .map(|(week_start, (additions, deletions))| GitVisCodeEvolutionWeek {
            week_start,
            additions,
            deletions,
        })
        .collect();

    debug!(
        "[ADL-GIT-VIS] [code_evolution] [{}] done in {:?} — {} weeks",
        root.display(),
        t0.elapsed(),
        weeks.len()
    );

    Ok(GitVisCodeEvolution { weeks })
}

fn start_of_week(date_str: &str) -> String {
    if date_str.len() < 10 { return date_str.to_string(); }
    let year: i32 = date_str[0..4].parse().unwrap_or(0);
    let month: u32 = date_str[5..7].parse().unwrap_or(1);
    let day: u32 = date_str[8..10].parse().unwrap_or(1);
    let a = (14 - month as i32) / 12;
    let y = year - a;
    let m = month as i32 + 12 * a - 2;
    let julian = day as i32 + (31 * m) / 12 + y + y / 4 - y / 100 + y / 400;
    let day_of_week = ((julian as u32 + 1) % 7) as i32;
    let monday_offset = (day_of_week + 6) % 7;
    let mon_julian = julian - monday_offset;
    let l = mon_julian + 68569 + 1;
    let n = (4 * l) / 146097;
    let l = l - (146097 * n + 3) / 4;
    let i = (4000 * (l + 1)) / 1461001;
    let l = l - (1461 * i) / 4 + 31;
    let j = (80 * l) / 2447;
    let d = l - (2447 * j) / 80;
    let l = j / 11;
    let m = j + 2 - 12 * l;
    let y = 100 * (n - 49) + i + l;
    format!("{}-{:02}-{:02}", y, m, d)
}

pub async fn capture_contributor_modules(
    root: &Path,
    since: Option<&str>,
    until: Option<&str>,
) -> Result<GitVisContributorModules, AppError> {
    let t0 = std::time::Instant::now();
    let time_filter = build_time_filter(since, until);
    let mut args: Vec<&str> = vec!["log", "--pretty=format:%an|%ae", "--name-only"];
    args.extend(time_filter.iter().map(|s| s.as_str()));

    debug!("[ADL-GIT-VIS] [contributor_modules] running: git {}", args.join(" "));

    let raw = super::git_helpers::run_git_with_timeout(root, &args)
        .await
        .ok_or_else(|| AppError::Workspace("git log --name-only failed".into()))?;

    let mut author_modules: HashMap<String, (String, HashMap<String, i32>)> = HashMap::new();
    let mut current_author: Option<String> = None;
    let mut current_email: String = String::new();

    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() { continue; }
        if let Some(_pipe_idx) = trimmed.find('|') {
            let parts: Vec<&str> = trimmed.splitn(2, '|').collect();
            current_author = Some(parts[0].to_string());
            current_email = parts.get(1).unwrap_or(&"").to_string();
        } else if let Some(ref author) = current_author {
            let top_dir = trimmed.split('/').next().unwrap_or(trimmed);
            let entry = author_modules
                .entry(author.clone())
                .or_insert_with(|| (current_email.clone(), HashMap::new()));
            *entry.1.entry(top_dir.to_string()).or_insert(0) += 1;
        }
    }

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
        "[ADL-GIT-VIS] [contributor_modules] [{}] done in {:?} — {} contributors",
        root.display(),
        t0.elapsed(),
        matrix.len()
    );

    Ok(GitVisContributorModules { matrix })
}

pub async fn capture_branch_graph(root: &Path) -> Result<GitVisBranchGraph, AppError> {
    let t0 = std::time::Instant::now();
    debug!("[ADL-GIT-VIS] [branch_graph] running: git log --all --topo-order");

    let raw = super::git_helpers::run_git_with_timeout(
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
        if parts.len() < 8 { continue; }
        let hash = parts[0].to_string();
        let short_hash = parts[1].to_string();
        let parent_hashes: Vec<String> = parts[2]
            .split_whitespace()
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .collect();
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
                if r2.starts_with("tag: ") {
                    tag = Some(r2[5..].to_string());
                } else if r2.starts_with("HEAD -> ") {
                    branch = r2[8..].to_string();
                    branch_set.insert(branch.clone());
                } else if !r2.starts_with("tag:") {
                    branch = r2.to_string();
                    branch_set.insert(branch.clone());
                }
            }
        }

        if branch.is_empty() {
            for n in &nodes {
                if n.hash == hash {
                    branch = n.branch.clone();
                    break;
                }
            }
        }

        for p in &parent_hashes {
            edges.push(GitVisBranchEdge {
                from: hash.clone(),
                to: p.clone(),
            });
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

pub async fn capture_file_sunburst(root: &Path) -> Result<GitVisFileSunburst, AppError> {
    let t0 = std::time::Instant::now();
    debug!("[ADL-GIT-VIS] [file_sunburst] running: git ls-files");

    let raw = super::git_helpers::run_git_with_timeout(root, &["ls-files"])
        .await
        .ok_or_else(|| AppError::Workspace("git ls-files failed".into()))?;

    let files: Vec<String> = raw.lines().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();

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
        if idx >= parts.len() { return; }
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
