pub mod command_risk;
pub mod config_watcher;
pub use command_risk::{
    assess_command_risk, requires_approval,
    build_ruleset, doom_loop_check, evaluate_permission, is_external_directory, risk_to_decision,
    PermissionDecision, PermissionRule, PermissionRuleset, PermissionRulesetConfig,
    pattern_matches as permission_pattern_matches,
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
