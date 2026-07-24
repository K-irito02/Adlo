use adl_errors::AppError;
use adl_types::{
    GitVisContributorModule, GitVisContributorModules, GitVisModuleEntry,
};
use std::collections::HashMap;
use std::path::Path;
use tracing::debug;

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

    let raw = super::super::git_helpers::run_git_with_timeout(root, &args)
        .await
        .ok_or_else(|| AppError::Workspace("git log --name-only failed".into()))?;

    let mut author_modules: HashMap<String, (String, HashMap<String, i32>)> = HashMap::new();
    let mut current_author: Option<String> = None;
    let mut current_email: String = String::new();

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
