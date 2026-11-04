pub(super) fn build_time_filter(since: Option<&str>, until: Option<&str>) -> Vec<String> {
    let mut args: Vec<String> = Vec::new();
    if let Some(s) = since {
        if !s.is_empty() {
            args.push(format!("--since={}", s));
        }
    }
    if let Some(u) = until {
        if !u.is_empty() {
            // Git interprets a bare `YYYY-MM-DD` for `--until` as `00:00:00` of
            // that day, which excludes the entire end day from the range. Append
            // `T23:59:59` so a user-selected end date fully includes that day.
            let normalized = normalize_until_date(u);
            args.push(format!("--until={}", normalized));
        }
    }
    args
}

/// If `until` is a bare `YYYY-MM-DD` date (no time component), append
/// `T23:59:59` so the end day is fully included. Values that already carry a
/// time component (e.g. `2026-07-10T12:00:00` or RFC-2822 strings) are returned
/// unchanged.
fn normalize_until_date(until: &str) -> String {
    // Bare `YYYY-MM-DD` is exactly 10 chars, all date, no `T`/space/time.
    if until.len() == 10 && until.chars().nth(4) == Some('-') && until.chars().nth(7) == Some('-') {
        return format!("{}T23:59:59", until);
    }
    until.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_time_filter_empty_inputs_yields_no_args() {
        let args = build_time_filter(None, None);
        assert!(args.is_empty());

        let args = build_time_filter(Some(""), Some(""));
        assert!(args.is_empty());
    }

    #[test]
    fn build_time_filter_since_only() {
        let args = build_time_filter(Some("2026-07-01"), None);
        assert_eq!(args, vec!["--since=2026-07-01"]);
    }

    #[test]
    fn build_time_filter_bare_until_appends_end_of_day() {
        // The key off-by-one fix: a bare YYYY-MM-DD until must include the whole day.
        let args = build_time_filter(Some("2026-07-01"), Some("2026-07-10"));
        assert_eq!(args, vec!["--since=2026-07-01", "--until=2026-07-10T23:59:59"]);
    }

    #[test]
    fn build_time_filter_until_with_time_is_unchanged() {
        let args = build_time_filter(None, Some("2026-07-10T12:00:00"));
        assert_eq!(args, vec!["--until=2026-07-10T12:00:00"]);
    }

    #[test]
    fn normalize_until_date_passthrough_for_non_bare() {
        assert_eq!(normalize_until_date("2026-07-10T12:00:00"), "2026-07-10T12:00:00");
        assert_eq!(normalize_until_date("2026-07-10 12:00:00"), "2026-07-10 12:00:00");
        assert_eq!(normalize_until_date("2026-07-10 12:00:00 +0800"), "2026-07-10 12:00:00 +0800");
    }

    #[test]
    fn normalize_until_date_appends_for_bare() {
        assert_eq!(normalize_until_date("2026-07-10"), "2026-07-10T23:59:59");
        assert_eq!(normalize_until_date("2025-01-31"), "2025-01-31T23:59:59");
    }
}
