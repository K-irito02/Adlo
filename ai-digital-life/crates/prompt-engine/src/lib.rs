//! Prompt assembly with a fixed safety-first rule stack.

use adl_kernel::{ContextEntry, ConversationScenario, PromptRule};

pub fn default_rules(scenario: ConversationScenario) -> Vec<PromptRule> {
    vec![
        PromptRule {
            id: "platform-safety".into(),
            kind: "platform".into(),
            content: "You are the backend planner for a desktop-first coding assistant. Use Patch First. Do not claim files were written unless a patch application step succeeds. High-risk actions require approval.".into(),
        },
        PromptRule {
            id: "project-tauri".into(),
            kind: "project".into(),
            content: "The project is Rust + Tauri 2.x. WebView cannot access filesystem, processes, SQL, or model secrets directly. Use typed Tauri commands and least-privilege capabilities.".into(),
        },
        PromptRule {
            id: "phase-scenario".into(),
            kind: "workflow-phase".into(),
            content: match scenario {
                ConversationScenario::Plan => "Return a concise structured plan with risk labels.".into(),
                ConversationScenario::Chat => "Answer concisely and cite relevant context.".into(),
                ConversationScenario::CodeEdit => {
                    "Prefer a small patch proposal with validation instructions.".into()
                }
            },
        },
        PromptRule {
            id: "tool-contract".into(),
            kind: "tool-contract".into(),
            content: "Available tools are read_file, list_tree, search, outline, create_patch, apply_patch, rollback_patch, and run_command. Side effects are governed.".into(),
        },
    ]
}

pub fn assemble_prompt(
    scenario: ConversationScenario,
    user_prompt: &str,
    context: &[ContextEntry],
) -> String {
    let mut output = String::new();
    for rule in default_rules(scenario) {
        output.push_str(&format!("[{}]\n{}\n\n", rule.kind, rule.content));
    }
    output.push_str("[user]\n");
    output.push_str(user_prompt);
    output.push_str("\n\n[reference-material]\n");
    for entry in context {
        output.push_str(&format!("## {}\n{}\n\n", entry.label, entry.content));
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn platform_rule_precedes_user_content() {
        let prompt = assemble_prompt(ConversationScenario::CodeEdit, "change files", &[]);
        assert!(prompt.find("platform").unwrap() < prompt.find("[user]").unwrap());
    }
}
