//! LLM-powered compaction summary generation.
//!
//! Provides the anchored summary template (ported from OpenCode) and helpers
//! to build the prompt and context used when the model gateway generates a
//! summary of pruned conversation messages.

use adl_types::conversation::{ConversationMessageRecord, ConversationRole};

/// Summary template (参考 OpenCode packages/core/src/session/compaction.ts line 16-39)
const SUMMARY_TEMPLATE: &str = r#"Output exactly the Markdown structure shown inside <template> and keep the section order unchanged. Do not include the <template> tags in your response.
<template>
## Objective
- [one or two brief sentences describing what the user is trying to accomplish]

## Important Details
- [constraints/preferences, decisions and why, important facts/assumptions, exact context needed to continue, or "(none)"]

## Work State
- Completed: [finished work, verified facts, or changes made; otherwise "(none)"]
- Active: [current work, partial changes, or investigation state; otherwise "(none)"]
- Blocked: [blockers, failing commands, or unknowns; otherwise "(none)"]

## Next Move
1. [immediate concrete action, or "(none)"]
2. [next action if known, or "(none)"]
</template>

Rules:
- Keep every section, even when empty.
- Use terse bullets, not prose paragraphs.
- Preserve exact file paths, symbols, commands, error strings, URLs, and identifiers when known.
- Put relevant files and symbols inside the section where they matter; do not add extra sections.
- Do not mention the summary process or that context was compacted."#;

/// Build the prompt for summary generation.
///
/// If `previous_summary` is provided, the LLM is asked to update the existing
/// summary (anchored summary mode); otherwise it creates a new summary.
pub fn build_summary_prompt(previous_summary: Option<&str>, context: &[String]) -> String {
    let header = match previous_summary {
        Some(prev) => format!(
            "Update the anchored summary below using the conversation history above.\nPreserve still-true details, remove stale details, and merge in the new facts.\n<previous-summary>\n{}\n</previous-summary>",
            prev
        ),
        None => "Create a new anchored summary from the conversation history.".to_string(),
    };
    let mut parts = vec![header, SUMMARY_TEMPLATE.to_string()];
    parts.extend(context.iter().cloned());
    parts.join("\n\n")
}

/// Build context strings from pruned messages for summary generation.
///
/// Each message is formatted as `[role] content` so the LLM can see the
/// conversation flow without raw JSON noise.
pub fn build_context_from_messages(messages: &[ConversationMessageRecord]) -> Vec<String> {
    messages.iter().map(|msg| format!("[{}] {}", role_label(msg.role), msg.content)).collect()
}

/// Map a [`ConversationRole`] to its lowercase string label for prompt context.
fn role_label(role: ConversationRole) -> &'static str {
    match role {
        ConversationRole::System => "system",
        ConversationRole::User => "user",
        ConversationRole::Assistant => "assistant",
        ConversationRole::Tool => "tool",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_summary_prompt_new() {
        let prompt = build_summary_prompt(None, &["[user] hello".to_string()]);
        assert!(prompt.contains("Create a new anchored summary"));
        assert!(prompt.contains("<template>"));
        assert!(prompt.contains("[user] hello"));
    }

    #[test]
    fn build_summary_prompt_update() {
        let prev = "## Objective\n- Old objective";
        let prompt = build_summary_prompt(Some(prev), &["[assistant] done".to_string()]);
        assert!(prompt.contains("Update the anchored summary"));
        assert!(prompt.contains("<previous-summary>"));
        assert!(prompt.contains("Old objective"));
        assert!(prompt.contains("[assistant] done"));
    }

    #[test]
    fn template_has_all_sections() {
        let prompt = build_summary_prompt(None, &[]);
        assert!(prompt.contains("## Objective"));
        assert!(prompt.contains("## Important Details"));
        assert!(prompt.contains("## Work State"));
        assert!(prompt.contains("## Next Move"));
    }

    #[test]
    fn context_from_messages_preserves_role() {
        use adl_types::conversation::ConversationRole;
        use adl_types::create_id;

        let msgs = vec![
            ConversationMessageRecord {
                id: create_id("msg"),
                session_id: "sess".to_string(),
                run_id: None,
                role: ConversationRole::User,
                content: "hello".to_string(),
                blocks: vec![],
                created_at: adl_types::now_ms(),
            },
            ConversationMessageRecord {
                id: create_id("msg"),
                session_id: "sess".to_string(),
                run_id: None,
                role: ConversationRole::Assistant,
                content: "hi there".to_string(),
                blocks: vec![],
                created_at: adl_types::now_ms(),
            },
        ];
        let ctx = build_context_from_messages(&msgs);
        assert_eq!(ctx.len(), 2);
        assert!(ctx[0].contains("[user] hello") || ctx[0].contains("user"));
        assert!(ctx[1].contains("[assistant] hi there") || ctx[1].contains("assistant"));
    }
}
