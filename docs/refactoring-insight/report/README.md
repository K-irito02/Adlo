# 重构洞察

重构进度追踪、每日洞察记录与实施计划。

## 目录结构

```
report/
├── README.md                        # 本文件：总索引
├── daily-insights/                  # 每日洞察报告
│   ├── 2026-06/                     # 2026年6月
│   └── 2026-07/                     # 2026年7月
├── phase-reports/                   # 分阶段实施计划
│   └── README.md                    # Phase 执行序索引（源自 README-07-15.md）
├── progress/                        # 进度总览与摘要
│   ├── REFACTORING_PROGRESS_REPORT.md
│   └── REFACTOR_INSIGHTS_SUMMARY.md
├── regression-guides/               # 回归测试指南
└── audit/                           # 审计报告
```

## Progress Reports

| File | Description |
|------|-------------|
| [progress/REFACTORING_PROGRESS_REPORT.md](./progress/REFACTORING_PROGRESS_REPORT.md) | Full refactoring progress report (93 rounds, updated to 2026-07-15) |
| [progress/REFACTOR_INSIGHTS_SUMMARY.md](./progress/REFACTOR_INSIGHTS_SUMMARY.md) | Insights summary (2026-05-21 ~ 2026-06-19) |

## Daily Insights

### 2026-06

| File | Date |
|------|------|
| [daily-insights/2026-06/refactor-insight-2026-06-20.md](./daily-insights/2026-06/refactor-insight-2026-06-20.md) | 2026-06-20 |
| [daily-insights/2026-06/refactor-insight-2026-06-21.md](./daily-insights/2026-06/refactor-insight-2026-06-21.md) | 2026-06-21 |
| [daily-insights/2026-06/refactor-insight-2026-06-22.md](./daily-insights/2026-06/refactor-insight-2026-06-22.md) | 2026-06-22 |
| [daily-insights/2026-06/refactor-insight-2026-06-23.md](./daily-insights/2026-06/refactor-insight-2026-06-23.md) | 2026-06-23 |
| [daily-insights/2026-06/refactor-insight-2026-06-27.md](./daily-insights/2026-06/refactor-insight-2026-06-27.md) | 2026-06-27 |
| [daily-insights/2026-06/refactor-insight-2026-06-29.md](./daily-insights/2026-06/refactor-insight-2026-06-29.md) | 2026-06-29 |
| [daily-insights/2026-06/refactor-insight-2026-06-30.md](./daily-insights/2026-06/refactor-insight-2026-06-30.md) | 2026-06-30 |

### 2026-07

| File | Date |
|------|------|
| [daily-insights/2026-07/refactor-insight-2026-07-01.md](./daily-insights/2026-07/refactor-insight-2026-07-01.md) | 2026-07-01 |
| [daily-insights/2026-07/refactor-insight-2026-07-02.md](./daily-insights/2026-07/refactor-insight-2026-07-02.md) | 2026-07-02 |
| [daily-insights/2026-07/refactor-insight-2026-07-03.md](./daily-insights/2026-07/refactor-insight-2026-07-03.md) | 2026-07-03 |
| [daily-insights/2026-07/refactor-insight-2026-07-04.md](./daily-insights/2026-07/refactor-insight-2026-07-04.md) | 2026-07-04 |
| [daily-insights/2026-07/refactor-insight-2026-07-10.md](./daily-insights/2026-07/refactor-insight-2026-07-10.md) | 2026-07-10 |
| [daily-insights/2026-07/refactor-insight-2026-07-11.md](./daily-insights/2026-07/refactor-insight-2026-07-11.md) | 2026-07-11 |
| [daily-insights/2026-07/refactor-insight-2026-07-14.md](./daily-insights/2026-07/refactor-insight-2026-07-14.md) | 2026-07-14 |
| [daily-insights/2026-07/refactor-insight-2026-07-14-systematic.md](./daily-insights/2026-07/refactor-insight-2026-07-14-systematic.md) | 2026-07-14 (Systematic) |
| [daily-insights/2026-07/refactor-insight-2026-07-15.md](./daily-insights/2026-07/refactor-insight-2026-07-15.md) | 2026-07-15 |

## Phase Execution Plans

| File | Phase | Priority |
|------|-------|----------|
| [phase-reports/README.md](./phase-reports/README.md) | Execution index (A→G) | — |
| [phase-reports/2026-07-15-phase-a-tauri-async-commands.md](./phase-reports/2026-07-15-phase-a-tauri-async-commands.md) | A: Tauri Async Commands | Critical |
| [phase-reports/2026-07-15-phase-b-architecture-bleeding-stop.md](./phase-reports/2026-07-15-phase-b-architecture-bleeding-stop.md) | B: Architecture Bleeding Stop | Critical |
| [phase-reports/2026-07-15-phase-c-latent-bugs-safety.md](./phase-reports/2026-07-15-phase-c-latent-bugs-safety.md) | C: Latent Bugs & Safety | High |
| [phase-reports/2026-07-15-phase-d-perf-render-fixes.md](./phase-reports/2026-07-15-phase-d-perf-render-fixes.md) | D: Performance & Rendering | High |
| [phase-reports/2026-07-15-phase-e-quick-wins.md](./phase-reports/2026-07-15-phase-e-quick-wins.md) | E: Quick Wins | Medium |
| [phase-reports/2026-07-15-phase-f-large-refactors.md](./phase-reports/2026-07-15-phase-f-large-refactors.md) | F: Large Refactors | Medium |
| [phase-reports/2026-07-15-phase-g-polish.md](./phase-reports/2026-07-15-phase-g-polish.md) | G: Polish | Low |

## Standalone Reports

| File | Date |
|------|------|
| [refactor-insight-2026-07-16.md](./refactor-insight-2026-07-16.md) | 2026-07-16 |
| [refactor-insight-2026-07-17.md](./refactor-insight-2026-07-17.md) | 2026-07-17 |
| [refactor-insight-2026-07-18.md](./refactor-insight-2026-07-18.md) | 2026-07-18 |

## Audit Reports

| File | Date |
|------|------|
| [audit/opencode-audit-2026-07-07.md](./audit/opencode-audit-2026-07-07.md) | 2026-07-07 |

## Regression Test Guides

| File | Date |
|------|------|
| [regression-guides/regression-test-guide-2026-07-04.md](./regression-guides/regression-test-guide-2026-07-04.md) | 2026-07-04 |
| [regression-guides/regression-test-guide-2026-07-07.md](./regression-guides/regression-test-guide-2026-07-07.md) | 2026-07-07 |

## Notes

- Implementation plans prior to 2026-06-30 have been migrated to [docs/plans/](../../plans/).
- New insight reports generated by the `refactoring-insight` skill are written to this `report/` directory and should be organized into the appropriate subdirectory.
