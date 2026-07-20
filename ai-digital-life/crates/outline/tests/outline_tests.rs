use adl_outline::outline;

#[test]
fn outline_markdown_headings() {
    let content = "# Title\n## Section 1\nHello\n## Section 2\n### Subsection\n";
    let items = outline(content, "test.md", 5).unwrap();
    assert!(!items.is_empty(), "markdown should produce outline items");
    assert!(items.iter().any(|i| i.label == "Title"), "should find top-level heading");
    assert!(items.iter().any(|i| i.label == "Section 1"), "should find section heading");
}

#[test]
fn outline_empty_content() {
    let items = outline("", "empty.py", 0).unwrap();
    assert!(items.is_empty(), "empty content should produce no outline items");
}

#[test]
fn outline_rust_brace_detection() {
    let content = "fn foo() {\n    let x = 1;\n}\nfn bar() {\n    println!(\"hi\");\n}\n";
    let items = outline(content, "test.rs", 6).unwrap();
    assert!(!items.is_empty(), "rust should produce outline items");
}

#[test]
fn outline_unknown_extension_falls_back_to_brace() {
    let content = "function foo() {\n  return 1;\n}\nfunction bar() {\n  return 2;\n}\n";
    let items = outline(content, "test.js", 5).unwrap();
    assert!(!items.is_empty(), "js should fallback to brace parsing");
}

#[test]
fn outline_single_line() {
    let content = "# Just a title";
    let items = outline(content, "readme.md", 1).unwrap();
    assert!(!items.is_empty());
    assert_eq!(items[0].label, "Just a title");
}

#[test]
fn outline_yaml_config() {
    let content = "key1: value1\nkey2:\n  subkey: subvalue\n";
    let items = outline(content, "config.yaml", 3).unwrap();
    assert!(!items.is_empty(), "yaml should produce outline items");
}
