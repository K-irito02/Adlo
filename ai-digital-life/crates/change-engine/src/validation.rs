use adl_kernel::{create_id, now_ms, DiagnosticSummary, PatchApplicationResult, PatchSet, ValidationResult};

pub fn validation_result_from_command(
    workspace_id: &str,
    run_id: Option<String>,
    patch_set_id: Option<String>,
    command_result: Option<&adl_kernel::CommandExecutionResult>,
) -> ValidationResult {
    match command_result {
        Some(result) if result.success => ValidationResult {
            id: create_id("validation"),
            workspace_id: workspace_id.to_string(),
            run_id,
            patch_set_id,
            status: "passed".into(),
            summary: result.summary.clone(),
            diagnostics: vec![],
            created_at: now_ms(),
        },
        Some(result) => ValidationResult {
            id: create_id("validation"),
            workspace_id: workspace_id.to_string(),
            run_id,
            patch_set_id,
            status: "failed".into(),
            summary: result.summary.clone(),
            diagnostics: parse_diagnostics(&result.stderr),
            created_at: now_ms(),
        },
        None => ValidationResult {
            id: create_id("validation"),
            workspace_id: workspace_id.to_string(),
            run_id,
            patch_set_id,
            status: "skipped".into(),
            summary: "No validation command was selected for this workspace.".into(),
            diagnostics: vec![],
            created_at: now_ms(),
        },
    }
}

pub fn application_result(
    patch_set: PatchSet,
    validation: Option<ValidationResult>,
    command_result: Option<adl_kernel::CommandExecutionResult>,
    rolled_back: bool,
) -> PatchApplicationResult {
    PatchApplicationResult {
        patch_set,
        repair_patch_set: None,
        validation,
        command_result,
        rolled_back,
    }
}

fn parse_diagnostics(stderr: &str) -> Vec<DiagnosticSummary> {
    stderr
        .lines()
        .take(12)
        .enumerate()
        .filter(|(_, line)| !line.trim().is_empty())
        .map(|(index, line)| DiagnosticSummary {
            id: format!("diagnostic-{index}"),
            source: "system".into(),
            severity: "error".into(),
            message: line.chars().take(240).collect(),
            path: None,
            line: None,
            column: None,
        })
        .collect()
}
