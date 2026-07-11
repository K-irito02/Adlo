pub mod command_risk;
pub mod config_watcher;
pub mod doom_loop;
pub mod permission_types;
pub use command_risk::{
    assess_command_risk, build_ruleset, evaluate_permission,
    pattern_matches as permission_pattern_matches, requires_approval, risk_to_decision,
};
pub use doom_loop::{doom_loop_check, is_external_directory};
pub use permission_types::{
    PermissionDecision, PermissionRule, PermissionRuleset, PermissionRulesetConfig,
};
pub mod config;
pub mod events;
pub mod logger;
pub mod types;

pub use types::*;

// 按 domain 分组 re-export，提高类型可发现性
pub mod domain {
    pub use crate::types::agent::*;
    pub use crate::types::ci::*;
    pub use crate::types::command::*;
    pub use crate::types::config::*;
    pub use crate::types::conversation::*;
    pub use crate::types::model::*;
    pub use crate::types::workspace::*;
}
