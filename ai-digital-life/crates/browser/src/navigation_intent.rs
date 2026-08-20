/// Per-tab 显式导航意图（宿主主动导航：地址栏/后退/前进/历史/书签/新标签）。
/// 单槽覆盖（只记最近一次显式导航）；软导航（SPA pushState）无 NavigationStarting，
/// 不会走到消费点，故宿主永不据此重新 Navigate。
///
/// # 当前消费状态（2026-08-20）
/// 本机制为**预留的幂等硬约束接缝**：软导航不重载由前端移除响应式反向导航
/// （Task 4）根治，宿主侧尚无 NavigationStarting/SourceChanged 消费点，前端亦
/// 未在本路径调用 `mark_navigation_intent`。因此 `PENDING_INTENT` 运行时恒空，
/// 以下函数当前不被生产调用，仅供后续若需在 Rust 侧对导航加"显式意图校验"时
/// 复用（接口已稳定 + 单测覆盖）。勿误以为此处已落地运行时导航防御。
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

static PENDING_INTENT: LazyLock<Mutex<HashMap<String, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// 登记一条 pending 显式导航意图（tab_id → url，单槽覆盖）。
pub fn mark_navigation_intent(tab_id: &str, url: &str) {
    if let Ok(mut map) = PENDING_INTENT.lock() {
        map.insert(tab_id.to_string(), url.to_string());
    }
}

/// 若待处理意图的 URL 与该 tab 匹配，则清除并返回 `true`；否则 `false`。
/// 用于 NavigationStarting/SourceChanged 到达时判定"本次是宿主显式导航"。
pub fn consume_navigation_intent(tab_id: &str, url: &str) -> bool {
    if let Ok(mut map) = PENDING_INTENT.lock() {
        if map.get(tab_id).map(String::as_str) == Some(url) {
            map.remove(tab_id);
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn intent_is_consumed_only_on_matching_url() {
        mark_navigation_intent("t1", "https://a.com/x");
        // 软导航 pushState 产生新 URL，不消费
        assert!(!consume_navigation_intent("t1", "https://a.com/y"));
        // 宿主显式导航到匹配 URL 才消费
        assert!(consume_navigation_intent("t1", "https://a.com/x"));
        // 单槽：消费后为空
        assert!(!consume_navigation_intent("t1", "https://a.com/x"));
    }

    #[test]
    fn intent_is_isolated_per_tab() {
        mark_navigation_intent("tab-a", "https://a.com/");
        mark_navigation_intent("tab-b", "https://b.com/");
        assert!(consume_navigation_intent("tab-a", "https://a.com/"));
        assert!(!consume_navigation_intent("tab-a", "https://a.com/"));
        assert!(consume_navigation_intent("tab-b", "https://b.com/"));
    }
}
