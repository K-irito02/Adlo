use adl_errors::AppError;
use adl_types::{WorkspaceChangeKind, WorkspaceChangePreview, WorkspaceChangeStatus};
use std::path::Path;
use std::process::Command;

/// 单文件 porcelain 状态（事项4-R2 per-file 轻量化）。
///
/// 一次 `git status --porcelain=v1 -z -- <path>` 调用替代全量 snapshot 的
/// 6 次顺序 git 派生（branch/rev-parse/4×diff-ls），Windows 下每次派生约数十毫秒。
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum PorcelainStatus {
    Conflicted,
    Untracked,
    Modified,
    Staged,
}

fn is_porcelain_code(byte: u8) -> bool {
    matches!(byte, b' ' | b'M' | b'A' | b'D' | b'R' | b'C' | b'T' | b'U' | b'?' | b'!')
}

fn classify_porcelain(x: u8, y: u8) -> Option<PorcelainStatus> {
    // 未合并集合：DD/AU/UD/UA/DU/AA/UU（与全量 snapshot 的 conflicts 列表同口径）。
    const UNMERGED: [(u8, u8); 7] = [
        (b'D', b'D'),
        (b'A', b'U'),
        (b'U', b'D'),
        (b'U', b'A'),
        (b'D', b'U'),
        (b'A', b'A'),
        (b'U', b'U'),
    ];
    if UNMERGED.contains(&(x, y)) {
        return Some(PorcelainStatus::Conflicted);
    }
    if x == b'?' && y == b'?' {
        return Some(PorcelainStatus::Untracked);
    }
    if x == b'!' && y == b'!' {
        return None;
    }
    // Y 非空（M/D/T 等）= 工作区相对 index 有改 → 与全量 unstaged 列表同口径判 Modified；
    // 仅 X 非空（M/A/D/R/C/T）= 仅暂存区有改 → Staged。
    if y != b' ' {
        return Some(PorcelainStatus::Modified);
    }
    if x != b' ' {
        return Some(PorcelainStatus::Staged);
    }
    None
}

/// 位置式解析单文件 porcelain（P4-R1-F2）：单路径 pathspec 下至多一个条目，
/// 字段 0 恒为 `XY path` 头；R/C 重命名多带一个旧路径延续字段（消费但永不匹配，
/// 与全量 `--name-only` 只列新路径同口径，P4-R1-F1）。其他形状一律回退。
/// `-z` 输出永不加引号（NUL 分隔的意义正在于此），故只做原文比较 + 反斜杠归一，
/// 不 trim 不去引号（P4-R1-F4）。
fn parse_porcelain_entry(stdout: &[u8]) -> Option<((u8, u8), String)> {
    let mut fields = stdout.split(|byte| *byte == 0).filter(|field| !field.is_empty());
    let header = fields.next()?;
    if header.len() < 4
        || header[2] != b' '
        || !is_porcelain_code(header[0])
        || !is_porcelain_code(header[1])
    {
        return None;
    }
    let rest: Vec<&[u8]> = fields.collect();
    // R/C 恰带一个延续字段；其他条目不应有延续；再多一律视为异常回退。
    let allowed = if header[0] == b'R' || header[0] == b'C' { 1 } else { 0 };
    if rest.len() > allowed {
        return None;
    }
    let candidate = String::from_utf8_lossy(&header[3..]).replace('\\', "/");
    Some(((header[0], header[1]), candidate))
}

/// 解析单文件 porcelain：只认头字段的新路径精确匹配。无匹配 → None
///（调用方回退全量路径，保留一切历史 quirks 与 NotFound 语义）。
/// `pub(crate)` 供 parity 测试做 fast-hit 断言（P4-R1-R2-N1）。
pub(crate) fn porcelain_status_for_file(
    root: &Path,
    normalized_path: &str,
) -> Option<PorcelainStatus> {
    // `:(literal)` 让 git 做精确匹配，文件名含 *?[] 等魔术字符时仍走快路径（P4-R1-F3）。
    let spec = format!(":(literal){normalized_path}");
    let output = Command::new("git")
        .args(["status", "--porcelain=v1", "-z", "--", &spec])
        .current_dir(root)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let ((x, y), candidate) = parse_porcelain_entry(&output.stdout)?;
    if candidate != normalized_path {
        return None;
    }
    classify_porcelain(x, y)
}

fn read_change_preview_fast(
    root: &Path,
    normalized_path: &str,
) -> Option<Result<WorkspaceChangePreview, AppError>> {
    let status = porcelain_status_for_file(root, normalized_path)?;
    let change_status = match status {
        PorcelainStatus::Conflicted => WorkspaceChangeStatus::Conflicted,
        PorcelainStatus::Untracked => WorkspaceChangeStatus::Untracked,
        PorcelainStatus::Modified => WorkspaceChangeStatus::Modified,
        PorcelainStatus::Staged => WorkspaceChangeStatus::Staged,
    };

    // 以下与全量路径逐行同语义（base/current/kind/限额/错误），仅状态来源不同。
    let absolute_path = adl_fs_ops::resolve_workspace_path(root, normalized_path).ok()?;
    if absolute_path.is_dir() {
        return Some(Err(AppError::InvalidInput(format!(
            "change preview requires a file path: {normalized_path}"
        ))));
    }

    let current_exists = absolute_path.is_file();
    let current_content = if current_exists {
        match adl_fs_ops::read_text_file(root, normalized_path, crate::DEFAULT_MAX_TEXT_FILE_BYTES)
        {
            Ok(content) => content,
            Err(error) => return Some(Err(error)),
        }
    } else {
        String::new()
    };

    let base_content = match crate::git::git_show_file(root, normalized_path) {
        Ok(content) => content.unwrap_or_default(),
        Err(error) => return Some(Err(error)),
    };
    let base_exists = if !base_content.is_empty() {
        true
    } else {
        match crate::git::git_file_exists(root, normalized_path) {
            Ok(exists) => exists,
            Err(error) => return Some(Err(error)),
        }
    };
    let change_kind = match (base_exists, current_exists) {
        (false, true) => WorkspaceChangeKind::Added,
        (true, false) => WorkspaceChangeKind::Deleted,
        _ => WorkspaceChangeKind::Modified,
    };

    if !base_exists && !current_exists {
        return Some(Err(AppError::NotFound(format!(
            "change preview source is unavailable: {normalized_path}"
        ))));
    }

    Some(Ok(WorkspaceChangePreview {
        path: normalized_path.to_string(),
        change_kind,
        status: change_status,
        base_exists,
        current_exists,
        base_content,
        current_content,
    }))
}

pub fn read_change_preview(
    root: &Path,
    relative_path: &str,
) -> Result<WorkspaceChangePreview, AppError> {
    let normalized_path = relative_path.replace('\\', "/");
    // 快路径命中即返回（2–3 次 git 派生）；任何异常（非仓库/无匹配/解析失败）
    // 回退全量路径，保证与历史行为逐行一致。
    if let Some(fast) = read_change_preview_fast(root, &normalized_path) {
        return fast;
    }
    read_change_preview_full(root, &normalized_path)
}

/// 全量路径（历史实现，逐行保留）：快路径未命中时的唯一回退，
/// 保证非仓库/未变更/目录折叠等一切边缘语义与过去完全一致。
pub(crate) fn read_change_preview_full(
    root: &Path,
    normalized_path: &str,
) -> Result<WorkspaceChangePreview, AppError> {
    let snapshot = crate::git::capture_git_snapshot(root);
    if !snapshot.is_repo {
        return Err(AppError::Workspace("active workspace is not a Git repository".into()));
    }

    let status = if snapshot.conflicts.iter().any(|path| path == normalized_path) {
        WorkspaceChangeStatus::Conflicted
    } else if snapshot.untracked.iter().any(|path| path == normalized_path) {
        WorkspaceChangeStatus::Untracked
    } else if snapshot.unstaged.iter().any(|path| path == normalized_path) {
        WorkspaceChangeStatus::Modified
    } else if snapshot.staged.iter().any(|path| path == normalized_path) {
        WorkspaceChangeStatus::Staged
    } else {
        return Err(AppError::NotFound(format!("change preview for {normalized_path}")));
    };

    let absolute_path = adl_fs_ops::resolve_workspace_path(root, normalized_path)?;
    if absolute_path.is_dir() {
        return Err(AppError::InvalidInput(format!(
            "change preview requires a file path: {normalized_path}"
        )));
    }

    let current_exists = absolute_path.is_file();
    let current_content = if current_exists {
        // 事项3：与用户主动开文件对齐到 8MB（此前 1MB，超限直接 InvalidInput，
        // 前端 HeavyPreviewGate 根本到不了）。读到之后是否渲染由前端 1M 字符确认门决定。
        adl_fs_ops::read_text_file(root, normalized_path, crate::DEFAULT_MAX_TEXT_FILE_BYTES)?
    } else {
        String::new()
    };

    let base_content = crate::git::git_show_file(root, normalized_path)?.unwrap_or_default();
    let base_exists =
        !base_content.is_empty() || crate::git::git_file_exists(root, normalized_path)?;
    let change_kind = match (base_exists, current_exists) {
        (false, true) => WorkspaceChangeKind::Added,
        (true, false) => WorkspaceChangeKind::Deleted,
        _ => WorkspaceChangeKind::Modified,
    };

    if !base_exists && !current_exists {
        return Err(AppError::NotFound(format!(
            "change preview source is unavailable: {normalized_path}"
        )));
    }

    Ok(WorkspaceChangePreview {
        path: normalized_path.to_string(),
        change_kind,
        status,
        base_exists,
        current_exists,
        base_content,
        current_content,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // P4-R1-F7：XY 分类矩阵（纯单测，无需 git，CI 常跑）。
    #[test]
    fn classify_porcelain_matrix() {
        // 未合并 → Conflicted
        for xy in [
            (b'D', b'D'),
            (b'A', b'U'),
            (b'U', b'D'),
            (b'U', b'A'),
            (b'D', b'U'),
            (b'A', b'A'),
            (b'U', b'U'),
        ] {
            assert_eq!(classify_porcelain(xy.0, xy.1), Some(PorcelainStatus::Conflicted));
        }
        // 未跟踪 / 忽略
        assert_eq!(classify_porcelain(b'?', b'?'), Some(PorcelainStatus::Untracked));
        assert_eq!(classify_porcelain(b'!', b'!'), None);
        // 工作区有改（含 AM/MM/RM 等混合）→ Modified，优先于暂存侧
        for xy in [
            (b' ', b'M'),
            (b' ', b'D'),
            (b' ', b'T'),
            (b'M', b'M'),
            (b'A', b'M'),
            (b'R', b'M'),
            (b'A', b'D'),
        ] {
            assert_eq!(classify_porcelain(xy.0, xy.1), Some(PorcelainStatus::Modified));
        }
        // 仅暂存侧 → Staged
        for xy in
            [(b'M', b' '), (b'A', b' '), (b'D', b' '), (b'R', b' '), (b'C', b' '), (b'T', b' ')]
        {
            assert_eq!(classify_porcelain(xy.0, xy.1), Some(PorcelainStatus::Staged));
        }
        // 空条目 → None（回退）
        assert_eq!(classify_porcelain(b' ', b' '), None);
    }

    // P4-R1-F7：位置式 -z 解析固件（纯单测，无需 git）。
    #[test]
    fn parse_porcelain_entry_fixtures() {
        // 普通条目
        assert_eq!(parse_porcelain_entry(b"M  a.txt\0"), Some(((b'M', b' '), "a.txt".to_string())));
        // 重命名：头为新路径 + 一个延续旧路径（消费但只认头）
        assert_eq!(
            parse_porcelain_entry(b"R  new.txt\0old.txt\0"),
            Some(((b'R', b' '), "new.txt".to_string()))
        );
        // 空输出 → None
        assert_eq!(parse_porcelain_entry(b""), None);
        assert_eq!(parse_porcelain_entry(b"\0"), None);
        // 非头字段开头 → None
        assert_eq!(parse_porcelain_entry(b"garbage\0"), None);
        // 非 R/C 却带延续字段 → None（异常回退）
        assert_eq!(parse_porcelain_entry(b"M  a.txt\0extra\0"), None);
        // 续超两个字段 → None
        assert_eq!(parse_porcelain_entry(b"R  new.txt\0old.txt\0junk\0"), None);
        // 含空格文件名原文保留（不 trim）
        assert_eq!(
            parse_porcelain_entry(b"?? my file.txt\0"),
            Some(((b'?', b'?'), "my file.txt".to_string()))
        );
    }
}
