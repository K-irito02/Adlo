use adl_errors::AppError;
use std::path::Path;

pub fn swap_into_place(staging: &Path, target: &Path) -> Result<(), AppError> {
    let io = |ctx: &str, e: std::io::Error| AppError::Io(format!("{ctx}: {e}"));
    // 目标父目录不存在时 rename/copy 都会失败；调用方（安装流程）可能尚未建好
    // 版本根，这里统一保证父目录存在（IO 错误如实上抛）。
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| io(&format!("create {}", parent.display()), e))?;
    }
    if target.exists() {
        let old = target.with_extension(format!("old-{}", nonce()));
        std::fs::rename(target, &old).map_err(|e| io("backup old", e))?;
        let r = swap_rename_or_copy(staging, target);
        if r.is_err() {
            if let Err(e) = std::fs::rename(&old, target) {
                tracing::warn!(
                    from = %old.display(),
                    to = %target.display(),
                    error = %e,
                    "swap: restore old version failed"
                );
            }
            return r;
        }
        if let Err(e) = std::fs::remove_dir_all(&old) {
            tracing::warn!(
                path = %old.display(),
                error = %e,
                "swap: remove backup failed (new version kept)"
            );
        }
    } else {
        swap_rename_or_copy(staging, target)?;
    }
    Ok(())
}

fn nonce() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default()
}

pub(crate) fn swap_rename_or_copy(staging: &Path, target: &Path) -> Result<(), AppError> {
    if std::fs::rename(staging, target).is_ok() {
        return Ok(());
    }
    // 跨卷 rename 失败退化为递归复制后删源；复制中途失败清半成品 target，
    // 此时源 staging 仍在，不丢数据。
    if let Err(e) = copy_dir(staging, target) {
        if let Err(cleanup) = std::fs::remove_dir_all(target) {
            tracing::warn!(
                path = %target.display(),
                error = %cleanup,
                "swap: remove half-copied target failed"
            );
        }
        return Err(e);
    }
    // 复制已完成，target 内容完整；删 staging 失败只留残渣，不得让安装误报失败。
    if let Err(e) = std::fs::remove_dir_all(staging) {
        tracing::warn!(
            path = %staging.display(),
            error = %e,
            "swap: remove staging failed after successful copy (target complete)"
        );
    }
    Ok(())
}

/// 递归复制目录（照抄 `dsh-bundle::copy_dir`；链接/junction 遇错直接报错，不静默丢文件）。
fn copy_dir(from: &Path, to: &Path) -> Result<(), AppError> {
    std::fs::create_dir_all(to)
        .map_err(|e| AppError::Io(format!("create {}: {e}", to.display())))?;
    let entries = std::fs::read_dir(from)
        .map_err(|e| AppError::Io(format!("read {}: {e}", from.display())))?;
    for entry in entries {
        let entry =
            entry.map_err(|e| AppError::Io(format!("read entry in {}: {e}", from.display())))?;
        let src = entry.path();
        let dst = to.join(entry.file_name());
        if is_link(&src) {
            return Err(AppError::Io(format!("refuse link {}", src.display())));
        }
        let file_type =
            entry.file_type().map_err(|e| AppError::Io(format!("stat {}: {e}", src.display())))?;
        if file_type.is_dir() {
            copy_dir(&src, &dst)?;
        } else {
            std::fs::copy(&src, &dst)
                .map_err(|e| AppError::Io(format!("copy {}: {e}", src.display())))?;
        }
    }
    Ok(())
}

fn is_link(path: &Path) -> bool {
    let Ok(md) = std::fs::symlink_metadata(path) else {
        return false;
    };
    if md.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
        if md.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::swap_into_place;

    fn nanos() -> u128 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or_default()
    }

    #[test]
    fn swap_replaces_target_and_keeps_old_on_nothing_else() {
        let tmp = std::env::temp_dir().join(format!("adl_sw_{}", nanos()));
        let target = tmp.join("installed").join("1.0.0");
        std::fs::create_dir_all(target.join("lib")).unwrap();
        std::fs::write(target.join("lib").join("old.txt"), "old").unwrap();
        let staging = tmp.join(".tmp-1.0.0-x");
        std::fs::create_dir_all(staging.join("lib")).unwrap();
        std::fs::write(staging.join("lib").join("new.txt"), "new").unwrap();
        swap_into_place(&staging, &target).expect("swap");
        assert!(target.join("lib").join("new.txt").is_file());
        assert!(!staging.exists(), "staging must be gone");
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn swap_creates_missing_target_parent() {
        let tmp = std::env::temp_dir().join(format!("adl_sw_parent_{}", nanos()));
        let target = tmp.join("nested").join("created").join("1.0.0");
        let staging = tmp.join(".tmp-1.0.0-x");
        std::fs::create_dir_all(staging.join("lib")).unwrap();
        std::fs::write(staging.join("lib").join("new.txt"), "new").unwrap();
        assert!(!target.parent().expect("parent").exists(), "parent must start absent");
        swap_into_place(&staging, &target).expect("swap with missing parent");
        assert!(target.join("lib").join("new.txt").is_file());
        assert!(!staging.exists(), "rename path must consume staging");
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
