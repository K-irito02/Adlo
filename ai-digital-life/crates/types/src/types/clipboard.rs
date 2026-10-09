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
    /// 原图 PNG 文件体积（字节），用于放大查看的"体积"读数；非图片或旧行为 None
    pub image_bytes: Option<u64>,
    /// HTML Format 载荷的 sidecar 文件路径（`clipboard/html/<id>.html`）
    pub html_path: Option<String>,
    /// Rich Text Format 载荷的 sidecar 文件路径（`clipboard/rtf/<id>.rtf`）
    pub rtf_path: Option<String>,
    pub source_app: Option<String>,
    pub created_at: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn richtext_paths_round_trip_and_default_to_none() {
        // 旧行 JSON 不含新字段 → 必须反序列化为 None（未发布阶段不做迁移）
        let legacy = r#"{
            "id":"a","kind":"text","content":"hi","digest":null,
            "imagePath":null,"thumbPath":null,"imageWidth":null,"imageHeight":null,
            "sourceApp":null,"createdAt":1
        }"#;
        let item: ClipboardItem = serde_json::from_str(legacy).unwrap();
        assert_eq!(item.html_path, None);
        assert_eq!(item.rtf_path, None);
        // 旧行不含 imageBytes → 反序列化为 None（未发布阶段不做迁移）
        assert_eq!(item.image_bytes, None);

        // 新字段可往返
        let mut it = item.clone();
        it.html_path = Some("/x/a.html".into());
        it.rtf_path = Some("/x/a.rtf".into());
        it.image_bytes = Some(2048);
        let json = serde_json::to_string(&it).unwrap();
        let back: ClipboardItem = serde_json::from_str(&json).unwrap();
        assert_eq!(back.html_path.as_deref(), Some("/x/a.html"));
        assert_eq!(back.rtf_path.as_deref(), Some("/x/a.rtf"));
        assert_eq!(back.image_bytes, Some(2048));
    }
}
