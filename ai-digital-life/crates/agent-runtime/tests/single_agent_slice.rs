use adl_types::{ConversationScenario, PatchHunkDecision};

#[test]
fn single_agent_patch_preview_apply_and_rollback_flow() {
    let root = std::env::temp_dir().join(format!("adl-agent-slice-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::write(
        root.join("Cargo.toml"),
        "[package]\nname='slice'\nversion='0.1.0'\nedition='2021'\n",
    )
    .unwrap();
    std::fs::write(root.join("src/lib.rs"), "pub fn answer() -> i32 { 42 }\n").unwrap();

    let (workspace, _) = adl_workspace::open_workspace(&root).unwrap();
    let document = adl_workspace::read_file(&root, "src/lib.rs").unwrap();
    let mut run = adl_agent_runtime::create_run(
        &workspace.id,
        "session-test",
        "add a task note to @file:src/lib.rs",
        ConversationScenario::CodeEdit,
    );
    let mut patch = adl_change_engine::create_patch_from_document(
        &workspace.id,
        "session-test",
        Some(run.run.id.as_str()),
        "add a task note to @file:src/lib.rs",
        &document,
    );
    run = adl_agent_runtime::complete_plan(run, Some(&patch), ConversationScenario::CodeEdit);
    assert_eq!(run.run.patch_set_id, Some(patch.id.clone()));

    let hunk_id = patch.file_patches[0].hunks[0].id.clone();
    patch =
        adl_change_engine::set_hunk_decision(patch, &hunk_id, PatchHunkDecision::Accepted).unwrap();
    let checkpoint_dir = root.join(".adl-checkpoints");
    let (applied, _checkpoint) =
        adl_change_engine::apply_patch_set(patch, &root, &checkpoint_dir).unwrap();
    let changed = std::fs::read_to_string(root.join("src/lib.rs")).unwrap();
    assert!(changed.contains("AI Digital Life task"));

    let rolled_back = adl_change_engine::rollback_patch_set(applied, &root).unwrap();
    let restored = std::fs::read_to_string(root.join("src/lib.rs")).unwrap();
    assert_eq!(restored, "pub fn answer() -> i32 { 42 }\n");
    assert!(matches!(rolled_back.status, adl_types::PatchSetStatus::RolledBack));

    let _ = std::fs::remove_dir_all(root);
}
