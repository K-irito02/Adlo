use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PageMeta {
    pub title: String,
    pub favicon: String,
    pub url: String,
    pub favicon_data_uri: String,
    /// 缓存条目真实来源（report 上报来源）；空串表示未知。
    pub source: String,
}
