---
name: refactoring-insight
description: Systematically analyze a codebase for architecture issues, performance bottlenecks, and maintainability problems. Generates a prioritized insight report with risk assessment. Invoke when user asks for refactoring analysis, code quality review, or architecture health check.
---

# Refactoring Insight

Systematically analyze any codebase to produce a **prioritized insight report** covering architecture, performance, code structure, and hygiene. This skill focuses on **analysis and insight generation** — execution of fixes is delegated to downstream skills.

**Core principle:** Insight before action. Understand the full picture before proposing changes.

---

## When to Use

- User asks for code quality analysis, refactoring insight, or architecture review
- Project needs a systematic health check before major feature work
- Signs of technical debt: slow builds, frequent bugs in same areas, hard-to-extend modules
- After significant code accumulation without review
- Onboarding to a new or unfamiliar codebase

---

## Flow

```
Discovery → Baseline → Survey → Scan → Risk Assessment → Report → Quality Self-Check
```

This skill stops at the **insight report**. For execution, see [Next Steps](#next-steps).

---

## 0. Discovery — Project Context

Before any analysis, gather project metadata to calibrate thresholds and tooling:

### 0.1 Language & Framework Detection

Scan the project root for config files to identify the tech stack. Common indicators:

| Indicator | Likely Stack |
|-----------|-------------|
| `package.json` | Node.js / TypeScript / JavaScript |
| `Cargo.toml` | Rust |
| `pyproject.toml` / `setup.py` | Python |
| `go.mod` | Go |
| `pom.xml` / `build.gradle` | Java / Kotlin |
| `CMakeLists.txt` | C / C++ |
| `Gemfile` | Ruby |
| `mix.exs` | Elixir |
| `*.csproj` / `*.sln` | C# / .NET |

### 0.2 Tooling Detection

Identify the project's existing quality tooling. Use what's already configured — don't impose external tools:

- **Build system**: npm/pnpm/yarn, cargo, gradle, make, cmake, etc.
- **Linter/formatter**: ESLint, Prettier, rustfmt, clippy, ruff, black, gofmt, etc.
- **Test framework**: Vitest, Jest, pytest, cargo test, go test, JUnit, etc.
- **Type checker**: TypeScript, mypy, pyright, etc.
- **Monorepo tools**: nx, turborepo, lerna, cargo workspace, etc.

### 0.3 Structure Discovery

- Monorepo or single-package?
- How are modules/packages organized?
- Where is the entry point?
- Any existing architecture docs, style guides, or prior refactoring reports?

### 0.4 Threshold Calibration

Adapt scanning thresholds to the project's language and conventions. **No fixed numbers** — derive from context:

| Factor | How to calibrate |
|--------|-----------------|
| File size threshold | Check typical file sizes in the project; flag outliers (>2x median or >3x 75th percentile) |
| Function length threshold | Language-dependent: Go/Rust tend toward shorter functions; Python/JS may have longer ones. Flag the top 5-10% |
| Nesting depth | Language convention matters. Callback-heavy JS may have deeper nesting than early-return Rust |
| Cyclomatic complexity | If a tool (e.g. `radon` for Python, `cognitive-complexity` ESLint rule) is available, use it. Otherwise, do a manual read of the largest functions |

> **Rule of thumb**: Don't apply a single number to all languages. A 200-line React component may be fine; a 200-line Rust function is likely a problem.

---

## 1. Baseline — Pre-Refactoring Metrics

Before proposing changes, capture the current state so improvement can be measured:

### 1.1 Quantitative Baselines

Collect what's measurable with available tooling:

| Metric | How to measure |
|--------|---------------|
| Build time | `time <build command>` (2-3 runs, take median) |
| Test suite runtime | `time <test command>` (full suite) |
| Test count | Parse test runner output |
| Bundle/artifact size | `ls -lh` or `du -sh` on build output |
| Lint warning count | Run linter, count output lines |
| Dependency count | Count entries in dependency manifest |

### 1.2 Qualitative Baselines

Note subjective observations that may improve after refactoring:

- Developer onboarding time (anecdotal)
- Frequency of "I don't know why this broke" moments
- Areas developers avoid touching
- Test flakiness rate

### 1.3 Baseline Snapshot

Record baselines at the top of the insight report so post-refactoring comparison is possible:

```markdown
## Baseline Metrics (pre-refactoring)
| Metric | Value |
|--------|-------|
| Build time | Xs |
| Test suite runtime | Xs |
| Test count | N |
| Lint warnings | N |
| ... | ... |
```

---

## 2. Survey — Project Overview

Establish a global view before diving into details.

### 2.1 Architecture Understanding

- Read top-level documentation (README, ARCHITECTURE.md, CONTRIBUTING.md, etc.)
- Trace the module dependency graph at a high level
- Identify the primary architectural pattern (MVC, layered, hexagonal, feature-based, etc.)
- Note any existing coding standards or architectural constraints

### 2.2 Macro Statistics

- File count and size distribution (histogram or quartiles)
- Directory/module size distribution
- Test file distribution (which directories have tests, which don't)
- Recent change hotspots (files modified most frequently in recent git history)

### 2.3 Context Gathering

- Check the issue tracker for recurring pain points
- Review recent commits for hot-fix patterns (indicates fragile areas)
- Note recently added modules (may be less mature)

---

## 3. Systematic Scanning

Scan across four independent dimensions. Use `dispatching-parallel-agents` if available to parallelize.

### 3.1 Code Structure

| Scan Item | What to look for |
|-----------|-----------------|
| Outlier files | Files significantly larger than project median |
| Outlier functions | Functions significantly longer than project norm |
| Deep nesting | >4 levels of indentation, callback hell, nested conditionals |
| High complexity | Functions with many branches/paths — use project's linter complexity rules if available |
| Duplicate code | Blocks of >10 similar lines across files; same logic with different variable names |
| Dead code | Unused exports, imports, functions, variables |

### 3.2 Architecture & Design

| Scan Item | What to look for |
|-----------|-----------------|
| Circular dependencies | A imports B, B imports A (or longer cycles) |
| Tight coupling | Modules that import from many others or are imported by many others |
| God modules | A single file/module handling too many unrelated concerns |
| Layer violations | Low-level code depending on high-level code; UI touching data access directly |
| Inconsistent patterns | Same concern (e.g., error handling, logging, state management) handled differently across the codebase |
| Premature abstraction | Abstractions that serve only one consumer; interfaces with single implementations without clear future need |

### 3.3 Performance & Resource

| Scan Item | What to look for |
|-----------|-----------------|
| N+1 patterns | Queries or API calls inside loops |
| Unnecessary allocations | Objects created in hot paths; large copies instead of references |
| Blocking in async contexts | Synchronous I/O calls inside async functions |
| Repeated computation | Values computed multiple times that could be cached or memoized |
| Heavy imports | Importing entire libraries when only a subset is needed |
| Resource management | Unclosed handles, connections, file descriptors, event listeners |

### 3.4 Hygiene & Quality

| Scan Item | What to look for |
|-----------|-----------------|
| Debug artifacts | `console.log`, `print()`, `dbg!()`, `var_dump()` left in non-test code |
| Hardcoded values | URLs, credentials, magic numbers, locale strings, API keys |
| Error handling consistency | Mixed patterns: throw vs return null vs Result/Either vs panic |
| Input validation gaps | User/external input used without sanitization or boundary checks |
| Deferred debt markers | `TODO`, `FIXME`, `HACK`, `XXX` comments at scale |
| Configuration sprawl | Settings scattered across multiple files, env vars, and hardcoded defaults |

> **Large project strategy**: If the codebase is too large for a single scan pass, batch by top-level directory or module, then merge findings. Prioritize directories with the most recent changes or highest bug frequency.

---

## 4. Risk Assessment

Before finalizing the report, assess the risk profile of each finding:

### 4.1 Risk Dimensions

For each identified issue, evaluate:

| Dimension | Question |
|-----------|---------|
| **Impact** | If unfixed, what breaks? How many users/features are affected? |
| **Likelihood** | How likely is this to cause a real problem? |
| **Fix complexity** | How many files/modules need to change? Are there test gaps? |
| **Ripple risk** | Could fixing this cascade into other issues? |

### 4.2 Risk Matrix

Map each issue onto a 2x2:

```
Impact
  ^
  │  High Impact        High Impact
  │  Low Likelihood     High Likelihood
  │  (Plan carefully)   (Fix first)
  │
  │  Low Impact         Low Impact
  │  Low Likelihood     High Likelihood
  │  (Defer)            (Fix if easy)
  │
  └──────────────────────────→ Likelihood
```

### 4.3 Execution Ordering

Recommend an execution order based on risk:

1. **High Impact + High Likelihood** — Fix first, these are active problems
2. **High Impact + Low Likelihood** — Plan for, but don't rush; add tests as safety net
3. **Low Impact + High Likelihood** — Quick wins if low fix complexity; otherwise batch
4. **Low Impact + Low Likelihood** — Document and defer; revisit in next review cycle

---

## 5. Generate Insight Report

### 5.1 Output Location

Ask the user where to place the report. If they don't have a preference, suggest a reasonable location based on the project structure (e.g., a `docs/` directory if one exists, or the project root). Use a naming convention like `refactor-insight-YYYY-MM-DD.md`.

### 5.2 Report Structure

```markdown
# Refactoring Insight Report

**Generated**: YYYY-MM-DD
**Project**: <name>
**Tech Stack**: <languages, frameworks, build tools>
**Scope**: <directories/modules analyzed>

---

## Baseline Metrics

| Metric | Value |
|--------|-------|
| Build time | Xs |
| Test suite runtime | Xs |
| Test count | N |
| ... | ... |

---

## Risk Summary

| Risk Level | Count | Description |
|------------|-------|-------------|
| Critical (fix first) | N | High impact + high likelihood |
| High (plan) | N | High impact + low likelihood |
| Medium (quick wins) | N | Low impact + high likelihood |
| Low (defer) | N | Low impact + low likelihood |

---

## Findings

### 1. Architecture & Design

| Location | Issue | Impact | Suggestion | Risk |
|----------|-------|--------|------------|------|
| `path/file:line` | Description of the problem and why it matters | What breaks if unfixed | Concrete, actionable fix | Critical/High/Medium/Low |

### 2. Performance

| Location | Issue | Impact | Suggestion | Risk |
|----------|-------|--------|------------|------|

### 3. Code Structure

| Location | Issue | Impact | Suggestion | Risk |
|----------|-------|--------|------------|------|

### 4. Hygiene & Quality

| Location | Issue | Impact | Suggestion | Risk |
|----------|-------|--------|------------|------|

---

## Statistics

| Metric | Count |
|--------|-------|
| Total findings | N |
| Critical | N |
| High | N |
| Medium | N |
| Low | N |
| Files affected | N |
| Estimated effort | Small / Medium / Large |

---

## Recommended Execution Order

1. [Critical] <finding summary> — <reason>
2. [Critical] <finding summary> — <reason>
3. [High] <finding summary> — <reason>
...
```

### 5.3 Priority Criteria

| Level | Criteria |
|-------|---------|
| **Critical** | Correctness bug, security vulnerability, data loss risk, severe architecture violation blocking feature work |
| **High** | Significant maintainability burden, large duplication, module exceeding project norms by >3x |
| **Medium** | Files/functions somewhat exceeding norms, inconsistent patterns, non-critical optimization |
| **Low** | Minor style inconsistency, small cleanup, nice-to-have improvements |

---

## 6. Report Quality Self-Check

Before presenting the report to the user, verify it meets these standards:

### Completeness

- [ ] All four scanning dimensions (structure, architecture, performance, hygiene) are covered
- [ ] Every finding has a specific file/function location
- [ ] Every finding has a concrete, actionable suggestion (not "improve this")
- [ ] Every finding has a risk level with justification
- [ ] Baseline metrics are recorded

### Accuracy

- [ ] Thresholds were calibrated to this project's norms, not arbitrary numbers
- [ ] Priority assignments are consistent (two similar issues should have similar priorities)
- [ ] No finding is based on personal preference without objective justification

### Actionability

- [ ] Each suggestion can be implemented without guessing (the "what" is clear)
- [ ] Execution order is risk-based, not arbitrary
- [ ] The report enables the user to make an informed decision about what to fix and when

### Honesty

- [ ] If a dimension had no findings, it's noted as "No issues found" rather than omitted
- [ ] If a dimension could not be fully scanned (e.g., no test framework available), the limitation is documented
- [ ] Estimated effort is honest — not minimized to make the report look good

---

## Next Steps

This skill produces the **insight report**. After the report is reviewed and approved by the user, the following downstream skills handle execution:

| Step | Skill | Purpose |
|------|-------|---------|
| Plan | `writing-plans` | Convert prioritized findings into a structured implementation plan |
| Execute | `executing-plans` or `subagent-driven-development` | Implement changes in order |
| Verify | `verification-before-completion` | Run tests, linters, type checks to confirm nothing broke |

**Important**: Do not start execution without user approval of the insight report. The report is a decision-making tool — the user decides which findings to act on, in what order, and when.

---

## Constraints

| Constraint | Description |
|------------|-------------|
| Insight only | This skill analyzes and reports. It does not modify code. |
| No fixed thresholds | All size/complexity thresholds are calibrated per-project in the Discovery phase |
| Language agnostic | Scanning dimensions work for any language; tooling adapts to what the project already uses |
| Objective | Findings are based on observable code properties, not personal style preferences |
| Honest | Report limitations honestly; don't fabricate findings to make the report seem more thorough |