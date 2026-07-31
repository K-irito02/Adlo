use adl_errors::AppError;
use adl_types::{
    GitVisCodeEvolution, GitVisCodeEvolutionWeek, GitVisCommitRow, GitVisCommitStats,
    GitVisContributorActivity, GitVisContributorPeriod, GitVisDailyCommit, GitVisHourlyBin,
    GitVisTimelinePoint,
};
use std::collections::{BTreeMap, HashMap};
use std::path::Path;
use tracing::debug;

use super::helpers::build_time_filter;

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
        let month_key = if let Some(dt) = parse_date_parts(&c.date) {
            format!("{}-{:02}", dt.year, dt.month)
        } else {
            date10[..7].to_string()
        };
        *entry.2.entry(month_key.clone()).or_insert(0) += 1;

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
                .map(|(period, count)| {
                    let month =
                        period.rsplit_once('-').and_then(|(_, m)| m.parse().ok()).unwrap_or(1);
                    GitVisContributorPeriod { period, month, count }
                })
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
    month: i32,
    day_of_week: i32,
    hour: i32,
}

/// Convert a Gregorian date to a Julian Day Number (Fliegel-Van Flandern).
fn gregorian_to_jdn(year: i64, month: i64, day: i64) -> i64 {
    let a = (14 - month) / 12;
    let y = year + 4800 - a;
    let m = month + 12 * a - 3;
    day + (153 * m + 2) / 5 + 365 * y + y / 4 - y / 100 + y / 400 - 32045
}

/// Convert a Julian Day Number to a Gregorian date `(year, month, day)`.
fn jdn_to_gregorian(jdn: i64) -> (i64, i64, i64) {
    let l = jdn + 68569;
    let n = (4 * l) / 146097;
    let l = l - (146097 * n + 3) / 4;
    let i = (4000 * (l + 1)) / 1461001;
    let l = l - (1461 * i) / 4 + 31;
    let j = (80 * l) / 2447;
    let d = l - (2447 * j) / 80;
    let l = j / 11;
    let m = j + 2 - 12 * l;
    let y = 100 * (n - 49) + i + l;
    (y, m, d)
}

/// Day of week where 0 = Sunday .. 6 = Saturday (matches JS `Date.getDay()`).
fn day_of_week(year: i64, month: i64, day: i64) -> i64 {
    (gregorian_to_jdn(year, month, day) + 1).rem_euclid(7)
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

    let day_of_week = day_of_week(year as i64, month as i64, day as i64) as i32;

    Some(DateParts { year, month: month as i32, day_of_week, hour })
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
        } else if let Some(date_str) = header_date(line) {
            current_date = Some(date_str);
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
    let year: i64 = date_str[0..4].parse().unwrap_or(0);
    let month: i64 = date_str[5..7].parse().unwrap_or(1);
    let day: i64 = date_str[8..10].parse().unwrap_or(1);
    let jdn = gregorian_to_jdn(year, month, day);
    let dow = (jdn + 1).rem_euclid(7);
    let monday_offset = (dow + 6) % 7;
    let (y, m, d) = jdn_to_gregorian(jdn - monday_offset);
    format!("{y:04}-{m:02}-{d:02}")
}

/// Matches a commit header line emitted by `--pretty=format:%H|%aI`, returning
/// the leading `YYYY-MM-DD` date. Robust for both SHA-1 and SHA-256 hashes.
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn start_of_week_returns_monday_of_the_same_week() {
        assert_eq!(start_of_week("2024-01-01"), "2024-01-01"); // Monday
        assert_eq!(start_of_week("2024-01-07"), "2024-01-01"); // Sunday → same week Monday
        assert_eq!(start_of_week("2026-07-31"), "2026-07-27");
        assert_eq!(start_of_week("2025-12-31"), "2025-12-29");
        assert_eq!(start_of_week("2026-01-01"), "2025-12-29");
        assert_eq!(start_of_week("2023-06-15"), "2023-06-12");
        assert_eq!(start_of_week("2024-02-29"), "2024-02-26"); // leap day
        assert_eq!(start_of_week("2024-12-30"), "2024-12-30");
        // 2025 has 53 ISO weeks; Dec 31 falls in 2026-01-05's week start
        assert_eq!(start_of_week("2026-01-05"), "2026-01-05");
    }

    #[test]
    fn start_of_week_never_produces_impossible_dates() {
        for d in ["2024-01-01", "2026-07-31", "2020-02-29", "1999-12-31", "2030-01-01"] {
            let s = start_of_week(d);
            let year: i32 = s[0..4].parse().unwrap();
            assert!(
                (1900..2100).contains(&year),
                "week start {s} (from {d}) should be a plausible 1900-2100 date"
            );
            assert_eq!(s.len(), 10);
        }
    }

    #[test]
    fn parse_date_parts_day_of_week_matches_js_convention() {
        // 0 = Sunday .. 6 = Saturday
        assert_eq!(parse_date_parts("2024-01-01T10:00:00+08:00").unwrap().day_of_week, 1); // Mon
        assert_eq!(parse_date_parts("2024-03-04T00:00:00Z").unwrap().day_of_week, 1); // Mon
        assert_eq!(parse_date_parts("2024-12-31T23:00:00Z").unwrap().day_of_week, 2); // Tue
        assert_eq!(parse_date_parts("2024-01-07T00:00:00Z").unwrap().day_of_week, 0); // Sun
        assert_eq!(parse_date_parts("2024-01-06T00:00:00Z").unwrap().day_of_week, 6); // Sat
    }

    #[test]
    fn header_date_parses_both_sha1_and_sha256_headers() {
        assert_eq!(
            header_date("e1278dba4e87ea8d41da7f9a8d726d54e14c91b4|2026-07-31T15:08:45+08:00"),
            Some("2026-07-31".to_string())
        );
        let sha256 = "f".repeat(64);
        assert_eq!(
            header_date(&format!("{sha256}|2025-01-02T03:04:05Z")),
            Some("2025-01-02".to_string())
        );
        assert_eq!(header_date("3\t2\tfile.ts"), None); // numstat line
        assert_eq!(header_date("not a header"), None);
        assert_eq!(header_date(""), None);
    }
}
