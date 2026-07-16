pub mod command_risk;
pub mod config;
pub mod config_watcher;
pub mod events;
pub mod logger;

pub use adl_types::doom_loop::{doom_loop_check, is_external_directory};
pub use adl_types::permission_types::{
    PermissionDecision, PermissionRule, PermissionRuleset, PermissionRulesetConfig,
};
pub use command_risk::{
    assess_command_risk, build_ruleset, evaluate_permission, evaluate_ruleset,
    pattern_matches as permission_pattern_matches, requires_approval, risk_to_decision,
};
