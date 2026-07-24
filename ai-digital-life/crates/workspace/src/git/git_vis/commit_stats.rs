use adl_errors::AppError;
use adl_types::{
    GitVisCodeEvolution, GitVisCodeEvolutionWeek, GitVisCommitRow, GitVisCommitStats,
    GitVisContributorActivity, GitVisContributorPeriod, GitVisDailyCommit, GitVisHourlyBin,
    GitVisTimelinePoint,
};
use std::collections::{BTreeMap, HashMap};
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

    let raw = super::super::git_helpers::run_git_with_timeout(root, &args)
        .await
        .ok_or_else(|| AppError::Workspace("git log failed for commit_stats".into()))?;

    let commits = parse_commit_log(&raw);
    let commit_count = commits.len();
    debug!("[ADL-GIT-VIS] [commit_stats] [{}] parsed {} commits", root.display(), commit_count);

    let mut daily_map: BTreeMap<String, i32> = BTreeMap::new();
    let mut hourly_map: HashMap<(i32, i32), i32> = HashMap::new();
    let mut author_map: HashMap<String, (String, i32, BTreeMap<String, i32>)> = HashMap::new();
    let mut timeline_points: Vec<GitVisTimelinePoint> = Vec::new();

    for (timeline_cumulative, c) in (1_i32..).zip(commits.iter()) {
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

        timeline_points.push(GitVisTimelinePoint { date: date10, cumulative: timeline_cumulative });
    }

    let daily_commits: Vec<GitVisDailyCommit> =
        daily_map.into_iter().map(|(date, count)| GitVisDailyCommit { date, count }).collect();

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
    if s.len() < 13 {
        return None;
    }
    let year: i32 = s[0..4].parse().ok()?;
    let month: u32 = s[5..7].parse().ok()?;
    let day: u32 = s[8..10].parse().ok()?;
    let hour: i32 = s[11..13].parse().ok()?;

    let a = (14 - month as i32) / 12;
    let y = year - a;
    let m = month as i32 + 12 * a - 2;
    let julian = (day as i32 + (31 * m) / 12 + y + y / 4 - y / 100 + y / 400) as u32;
    let day_of_week = ((julian + 1) % 7) as i32;

    let jan4_day = (6 + year * 365 + year / 4 - year / 100 + year / 400) % 7;
    let jan4_julian = 4 + if jan4_day <= 3 { 3 - jan4_day } else { 10 - jan4_day };
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

    let raw = super::super::git_helpers::run_git_with_timeout(root, &args)
        .await
        .ok_or_else(|| AppError::Workspace("git log --numstat failed".into()))?;

    let mut week_map: BTreeMap<String, (i32, i32)> = BTreeMap::new();
    let mut current_date: Option<String> = None;
    for line in raw.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() == 3 {
            let add: i32 = parts[0].parse().unwrap_or(0);
            let del: i32 = parts[1].parse().unwrap_or(0);
            if let Some(ref date_str) = current_date {
                let entry = week_map.entry(start_of_week(date_str)).or_insert((0, 0));
                entry.0 += add;
                entry.1 += del;
            }
        } else if let Some(pipe_pos) = line.find('|') {
            if pipe_pos > 30 && pipe_pos < 60 {
                let date_part = &line[pipe_pos + 1..];
                current_date = Some(date_part[..date_part.len().min(10)].to_string());
            }
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
    if date_str.len() < 10 {
        return date_str.to_string();
    }
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
