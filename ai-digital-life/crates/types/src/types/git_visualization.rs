use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitVisCommitRow {
    pub hash: String,
    pub short_hash: String,
    pub date: String,
    pub author: String,
    pub author_email: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitVisDailyCommit {
    pub date: String,
    pub count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitVisHourlyBin {
    pub day: i32,
    pub hour: i32,
    pub count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitVisContributorPeriod {
    pub period: String,
    pub month: i32,
    pub count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitVisContributorActivity {
    pub author: String,
    pub author_email: String,
    pub total_commits: i32,
    pub periods: Vec<GitVisContributorPeriod>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitVisTimelinePoint {
    pub date: String,
    pub cumulative: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitVisCommitStats {
    pub daily_commits: Vec<GitVisDailyCommit>,
    pub hourly_distribution: Vec<GitVisHourlyBin>,
    pub contributor_activity: Vec<GitVisContributorActivity>,
    pub commit_timeline: Vec<GitVisTimelinePoint>,
    pub commits: Vec<GitVisCommitRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitVisCodeEvolutionWeek {
    pub week_start: String,
    pub additions: i32,
    pub deletions: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitVisCodeEvolution {
    pub weeks: Vec<GitVisCodeEvolutionWeek>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitVisModuleEntry {
    pub module: String,
    pub count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitVisContributorModule {
    pub author: String,
    pub author_email: String,
    pub modules: Vec<GitVisModuleEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitVisContributorModules {
    pub matrix: Vec<GitVisContributorModule>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitVisBranchNode {
    pub hash: String,
    pub short_hash: String,
    pub parent_hashes: Vec<String>,
    pub branch: String,
    pub date: String,
    pub message: String,
    pub author: String,
    pub author_email: String,
    pub tag: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitVisBranchEdge {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitVisBranchGraph {
    pub nodes: Vec<GitVisBranchNode>,
    pub edges: Vec<GitVisBranchEdge>,
    pub branches: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitVisSunburstNode {
    pub name: String,
    #[serde(rename = "type")]
    pub node_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<GitVisSunburstNode>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitVisFileSunburst {
    pub tree: GitVisSunburstNode,
}
