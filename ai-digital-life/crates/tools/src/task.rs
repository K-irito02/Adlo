use adl_errors::AppError;
use adl_subagent::TaskToolInput;
use std::future::Future;
use std::pin::Pin;

use crate::ToolOutput;

pub const NAME: &str = "task";

pub static PARAMETERS: std::sync::LazyLock<serde_json::Value> = std::sync::LazyLock::new(|| {
    serde_json::json!({
        "type": "object",
        "properties": {
            "description": { "type": "string", "description": "Short description of the subtask" },
            "prompt": { "type": "string", "description": "Prompt for the subagent" },
            "subagent_type": { "type": "string", "description": "explore | general" },
            "task_id": { "type": "string", "description": "Optional caller-provided task id" },
            "background": { "type": "boolean", "description": "Run in background" }
        },
        "required": ["description", "prompt", "subagent_type"]
    })
});

/// Dispatch a sub-agent task. The `dispatch` closure is injected by the
/// B3 adapter layer with the real sub-agent runner; tests pass a stub.
/// The closure is async so the real runner can await the sub-agent task
/// without blocking the calling tokio worker.
///
/// A `BoxFuture`-returning closure is used (rather than `AsyncFn`) because
/// async closures do not yet satisfy higher-ranked bounds over the input
/// reference lifetime; this form keeps the awaited future `Send` for tokio.
pub async fn execute<F>(
    input: &TaskToolInput,
    dispatch: F,
) -> Result<ToolOutput, AppError>
where
    F: for<'a> Fn(
        &'a TaskToolInput,
    ) -> Pin<Box<dyn Future<Output = Result<ToolOutput, AppError>> + Send + 'a>>,
{
    let output = dispatch(input).await?;
    // Ensure metadata carries the task identity even if the dispatcher
    // returned minimal data.
    let mut metadata = output.metadata;
    if let Some(obj) = metadata.as_object_mut() {
        obj.entry("task_id").or_insert_with(|| {
            serde_json::Value::String(adl_types::create_id("task"))
        });
        obj.entry("subagent_type")
            .or_insert_with(|| serde_json::Value::String(input.subagent_type.clone()));
        obj.entry("description")
            .or_insert_with(|| serde_json::Value::String(input.description.clone()));
    }
    Ok(ToolOutput { output: output.output, success: output.success, metadata })
}

#[cfg(test)]
mod tests {
    use super::*;
    use adl_subagent::TaskToolInput;

    #[test]
    fn task_schema_has_subagent_type() {
        assert!(PARAMETERS["properties"]["subagent_type"].is_object());
    }

    #[test]
    fn task_input_parses() {
        let input: TaskToolInput = serde_json::from_str(
            r#"{"description":"d","prompt":"p","subagentType":"explore","background":false}"#,
        )
        .unwrap();
        assert_eq!(input.subagent_type, "explore");
    }

    #[tokio::test]
    async fn task_executes_via_dispatch_closure() {
        let input = TaskToolInput {
            description: "d".into(),
            prompt: "p".into(),
            subagent_type: "explore".into(),
            task_id: None,
            background: false,
        };
        let result = execute(&input, |_| {
            Box::pin(async {
                Ok(ToolOutput {
                    output: "dispatched".into(),
                    success: true,
                    metadata: serde_json::json!({
                        "task_id": "sub_test",
                        "subagent_type": "explore",
                        "description": "d",
                        "state": "completed",
                    }),
                })
            })
        })
        .await;
        let result = result.unwrap();
        assert!(result.success);
        assert_eq!(result.metadata["state"], "completed");
    }
}
