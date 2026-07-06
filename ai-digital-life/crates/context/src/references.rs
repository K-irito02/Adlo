use adl_errors::AppError;
use adl_kernel::types::reference::{ReferenceConfig, ReferenceSource};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

pub fn validate_reference(config: &ReferenceConfig) -> Result<(), AppError> {
    match config.source {
        ReferenceSource::Local => {
            let path = Path::new(&config.path);
            if !path.exists() {
                return Err(adl_errors::AppError::NotFound(format!(
                    "Reference path does not exist: {}",
                    config.path
                )));
            }
            if !path.is_dir() {
                return Err(adl_errors::AppError::InvalidInput(format!(
                    "Reference path is not a directory: {}",
                    config.path
                )));
            }
            Ok(())
        },
        ReferenceSource::Git => {
            if config.path.is_empty() {
                return Err(adl_errors::AppError::InvalidInput(
                    "Git reference URL is empty".to_string(),
                ));
            }
            Ok(())
        },
    }
}

pub fn references_prompt(references: &[ReferenceConfig]) -> String {
    let enabled: Vec<_> = references.iter().filter(|r| r.enabled).collect();
    if enabled.is_empty() {
        return String::new();
    }

    let mut prompt = String::from("\n\n## Available References\n\n");
    prompt.push_str("The following reference directories are available for consultation:\n\n");

    for ref_config in enabled {
        prompt.push_str(&format!(
            "- **{}** ({:?}): `{}`\n",
            ref_config.name, ref_config.source, ref_config.path
        ));
    }

    prompt.push_str(
        "\nYou can read files from these directories to find relevant patterns and examples.\n",
    );
    prompt
}

pub fn clone_git_reference_sync(ref_config: &ReferenceConfig) -> Result<PathBuf, AppError> {
    match ref_config.source {
        ReferenceSource::Git => {
            static COUNTER: AtomicU64 = AtomicU64::new(0);
            let n = COUNTER.fetch_add(1, Ordering::Relaxed);
            let dest = std::env::temp_dir().join(format!("adl-git-ref-{n}"));
            let mut cmd = std::process::Command::new("git");
            cmd.arg("clone");
            if let Some(branch) = &ref_config.branch {
                cmd.arg("--branch").arg(branch);
            }
            cmd.arg(&ref_config.path).arg(&dest);
            let output = cmd.output()
                .map_err(|e| AppError::Io(format!("Failed to clone git ref: {}", e)))?;
            if !output.status.success() {
                return Err(AppError::Internal(format!(
                    "Git clone failed: {}",
                    String::from_utf8_lossy(&output.stderr)
                )));
            }
            Ok(dest)
        },
        ReferenceSource::Local => Ok(PathBuf::from(&ref_config.path)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_local_reference_existing_dir() {
        let config = ReferenceConfig {
            name: "test".to_string(),
            source: ReferenceSource::Local,
            path: std::env::temp_dir().to_string_lossy().to_string(),
            branch: None,
            enabled: true,
        };
        assert!(validate_reference(&config).is_ok());
    }

    #[test]
    fn validate_local_reference_nonexistent() {
        let config = ReferenceConfig {
            name: "test".to_string(),
            source: ReferenceSource::Local,
            path: "/nonexistent/path/xyz".to_string(),
            branch: None,
            enabled: true,
        };
        assert!(validate_reference(&config).is_err());
    }

    #[test]
    fn references_prompt_empty_when_no_references() {
        let prompt = references_prompt(&[]);
        assert!(prompt.is_empty());
    }

    #[test]
    fn references_prompt_lists_enabled_references() {
        let refs = vec![
            ReferenceConfig {
                name: "opencode".to_string(),
                source: ReferenceSource::Local,
                path: "/refs/opencode".to_string(),
                branch: None,
                enabled: true,
            },
            ReferenceConfig {
                name: "disabled".to_string(),
                source: ReferenceSource::Local,
                path: "/refs/disabled".to_string(),
                branch: None,
                enabled: false,
            },
        ];
        let prompt = references_prompt(&refs);
        assert!(prompt.contains("opencode"));
        assert!(!prompt.contains("disabled"));
    }
}
