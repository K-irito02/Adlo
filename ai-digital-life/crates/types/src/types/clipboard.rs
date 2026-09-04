use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardItem {
    pub id: String,
    pub kind: String,
    pub content: Option<String>,
    /// 内容指纹：图片为像素哈希（用于去重，相同图片不同文件名仍可识别），文本为 None
    pub digest: Option<String>,
    pub image_path: Option<String>,
    pub thumb_path: Option<String>,
    pub image_width: Option<u32>,
    pub image_height: Option<u32>,
    pub source_app: Option<String>,
    pub created_at: i64,
}
