use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SymbolInfo {
    pub name: String,
    pub kind: SymbolKind,
    pub location: DefinitionLocation,
    pub container_name: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SymbolKind {
    File,
    Module,
    Namespace,
    Package,
    Class,
    Method,
    Property,
    Field,
    Constructor,
    Enum,
    Interface,
    Function,
    Variable,
    Constant,
    String,
    Number,
    Boolean,
    Array,
    Object,
    Key,
    Null,
    Struct,
    Event,
    Operator,
    TypeParameter,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DefinitionLocation {
    pub file_path: String,
    pub line: u32,
    pub column: u32,
    pub end_line: Option<u32>,
    pub end_column: Option<u32>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn symbol_info_serializes() {
        let symbol = SymbolInfo {
            name: "my_function".to_string(),
            kind: SymbolKind::Function,
            location: DefinitionLocation {
                file_path: "src/main.rs".to_string(),
                line: 10,
                column: 4,
                end_line: Some(15),
                end_column: Some(4),
            },
            container_name: Some("my_module".to_string()),
        };
        let json = serde_json::to_string(&symbol).unwrap();
        assert!(json.contains("my_function"));
    }
}
