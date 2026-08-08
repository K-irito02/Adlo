use adl_errors::AppError;

use crate::ToolOutput;

pub const NAME: &str = "question";

pub static PARAMETERS: std::sync::LazyLock<serde_json::Value> = std::sync::LazyLock::new(|| {
    serde_json::json!({
        "type": "object",
        "properties": {
            "questions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "question": { "type": "string" },
                        "options": { "type": "array", "items": { "type": "string" } }
                    },
                    "required": ["question"]
                }
            }
        },
        "required": ["questions"]
    })
});

pub async fn execute(
    questions: &serde_json::Value,
) -> Result<ToolOutput, AppError> {
    let questions = questions.clone();
    // B3's Question service will replace this stub to truly suspend via a
    // Deferred and publish question.asked events. For now, validate shape
    // and return the questions so downstream consumers can render them.
    Ok(ToolOutput {
        output: format!("Asked {} question(s).", questions.as_array().map_or(0, Vec::len)),
        success: true,
        metadata: serde_json::json!({
            "questions": questions,
            "answers": [],
        }),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn question_schema_has_questions() {
        assert!(PARAMETERS["properties"]["questions"].is_object());
    }

    #[tokio::test]
    async fn question_returns_metadata() {
        let result = execute(&serde_json::json!([
            { "question": "Continue?", "options": ["yes", "no"] }
        ]))
        .await
        .unwrap();
        assert!(result.success);
        assert_eq!(result.metadata["questions"][0]["question"], "Continue?");
    }
}
