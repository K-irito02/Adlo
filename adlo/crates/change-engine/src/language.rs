pub fn language_for_path(path: &str) -> Option<String> {
    path.rsplit('.').next().and_then(|extension| {
        let language = match extension {
            "rs" => "rust",
            "ts" | "tsx" => "typescript",
            "js" | "jsx" => "javascript",
            "md" => "markdown",
            "json" => "json",
            _ => return None,
        };
        Some(language.to_string())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn language_for_path_returns_correct_language() {
        assert_eq!(language_for_path("main.rs").unwrap(), "rust");
        assert_eq!(language_for_path("app.ts").unwrap(), "typescript");
        assert_eq!(language_for_path("app.tsx").unwrap(), "typescript");
        assert_eq!(language_for_path("index.js").unwrap(), "javascript");
        assert_eq!(language_for_path("readme.md").unwrap(), "markdown");
        assert_eq!(language_for_path("config.json").unwrap(), "json");
        assert!(language_for_path("image.png").is_none());
        assert!(language_for_path("document.pdf").is_none());
    }
}
