use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PageMeta {
    pub title: String,
    pub favicon: String,
    pub url: String,
    pub favicon_data_uri: String,
}
