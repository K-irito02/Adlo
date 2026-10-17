use adl_errors::AppError;
use adl_types::{WorkspaceChangeKind, WorkspaceChangePreview, WorkspaceChangeStatus};
use std::path::Path;
use std::process::Command;

/// 单文件 porcelain 状态（事项4-R2 per-file 轻量化）。
///
/// 一次 `git status --porcelain=v1 -z -- <path>` 调用替代全量 snapshot 的
/// 6 次顺序 git 派生（branch/rev-parse/4×diff-ls），Windows 下每次派生约数十毫秒。
#[derive(Debug, PartialEq, Eq)]
enum PorcelainStatus {
    Conflicted,
    Untracked,
    Modified,
    Staged,
}

fn is_porcelain_code(byte: u8) -> bool {
    matches!(byte, b' ' | b'M' | b'A' | b'D' | b'R' | b'C' | b'T' | b'U' | b'?' | b'!')
}

fn strip_quotes(value: &str) -> &str {
    let trimmed = value.trim();
    if trimmed.len() >= 2 && trimmed.starts_with('"') && trimmed.ends_with('"') {
        &trimmed[1..trimmed.len() - 1]
    } else {
        trimmed
    }
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

/// 解析单文件 porcelain：只认与目标归一化路径精确匹配的条目
///（重命名条目的新旧两侧都参与匹配，顺序无关）。
/// 无匹配 → None（调用方回退全量路径，保留一切历史 quirks 与 NotFound 语义）。
fn porcelain_status_for_file(root: &Path, normalized_path: &str) -> Option<PorcelainStatus> {
    let output = Command::new("git")
        .args(["status", "--porcelain=v1", "-z", "--", normalized_path])
        .current_dir(root)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let mut current: Option<(u8, u8)> = None;
    let mut matched: Option<(u8, u8)> = None;
    for field in output.stdout.split(|byte| *byte == 0) {
        if field.is_empty() {
            continue;
        }
        if field.len() >= 4
            && field[2] == b' '
            && is_porcelain_code(field[0])
            && is_porcelain_code(field[1])
        {
            current = Some((field[0], field[1]));
            let candidate = String::from_utf8_lossy(&field[3..]).replace('\\', "/");
            if strip_quotes(candidate.trim()) == normalized_path {
                matched = current;
            }
        } else if let Some(xy) = current {
            // 重命名旧路径等延续字段：归属当前条目。
            let candidate = String::from_utf8_lossy(field).replace('\\', "/");
            if strip_quotes(candidate.trim()) == normalized_path {
                matched = Some(xy);
            }
        }
    }
    let (x, y) = matched?;
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
