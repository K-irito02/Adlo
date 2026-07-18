---
name: refactoring-insight
description: Analyze codebase for architecture, performance, and maintainability issues. Produces prioritized report with risk assessment. Invoke for refactoring analysis, code quality review, or architecture health check.
---

# Refactoring Insight

Systematically analyze any codebase to produce a **prioritized insight report** covering architecture, performance, code structure, security, and hygiene. This skill focuses on **analysis and insight generation** — execution of fixes is delegated to downstream skills.

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
Scope Definition → Discovery → Baseline → Survey → Scan (5 dimensions) → Risk Assessment → Collaborative Report (via Brainstorming) → Next Steps
```

This skill stops at the **insight report**. For execution, see [Next Steps](#next-steps).

---

## 0. Scope Definition

**Before any analysis, ask the user to define the scope.** Do not assume "the whole project."

Ask the user (via `AskUserQuestion`):

| Question | Options |
|----------|---------|
| What scope to analyze? | Entire project / Specific directories / Specific modules / Files changed in last N days |
| Depth preference? | Quick scan (top 10 issues) / Standard (all dimensions) / Deep dive (full detail) |
| Compare with previous report? | Yes (provide path) / No |
| Output format preference? | Interactive (step-by-step approval) / Direct (write full report at once) |

- If the user specifies a directory, verify it exists with `LS` before proceeding
- If the project is very large (>500 files), suggest narrowing scope or using the [multi-agent dispatch strategy](#multi-agent-parallel-scan)
- Record the agreed scope at the top of the final report

---

## 1. Discovery — Project Context

### 1.1 Language & Framework Detection

Scan the project root for config files:

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

### 1.2 Tooling Detection

Identify existing quality tooling (use what's configured, don't impose external tools):

| Category | Common tools |
|----------|-------------|
| **Build system** | npm/pnpm/yarn, cargo, gradle, make, cmake |
| **Linter/formatter** | ESLint, Prettier, rustfmt, clippy, ruff, black, gofmt |
| **Test framework** | Vitest, Jest, pytest, cargo test, go test, JUnit |
| **Type checker** | TypeScript, mypy, pyright |
| **Monorepo tools** | nx, turborepo, lerna, cargo workspace |
| **Dependency graph** | madge, dpdm (JS/TS), cargo-modules (Rust), pydeps (Python) |

### 1.3 Structure Discovery

- Monorepo or single-package?
- How are modules/packages organized?
- Where is the entry point?
- Any existing architecture docs, style guides, or prior refactoring reports?

### 1.4 Existing Known Issues

Review previous reports and issue trackers for context, but **independently verify** — past reports may be outdated, inaccurate, or describe issues since resolved:

- Check the issue tracker for technical debt tickets → verify each claimed issue still exists in current code
- Review past refactoring reports → spot-check 2-3 claimed findings against current code
- Review recent hot-fix commits: `git log --oneline -30 | grep -iE "fix|hotfix|quick"` → check if the patched code has regressed
- If a previous report exists, compare its metrics with current baselines to detect drift

### 1.5 Threshold Calibration

Adapt scanning thresholds to the project's language and conventions. **No fixed numbers** — derive from context.

Compute file size distribution to calibrate:

```bash
Get-ChildItem -Recurse -Include *.ts,*.tsx,*.rs,*.py | ForEach-Object {
  [PSCustomObject]@{ File=$_.FullName; Lines=(Get-Content $_.FullName | Measure-Object -Line).Lines }
} | Sort-Object Lines -Descending | Select-Object -First 200
```

| Factor | How to calibrate |
|--------|-----------------|
| File size threshold | Flag outliers: >2x median OR >3x 75th percentile |
| Function length threshold | Flag the top 5-10% longest functions; language-dependent |
| Nesting depth | >4 levels is a warning; >6 is a problem in any language |
| Cyclomatic complexity | Use project's linter complexity rules if available; otherwise manual review of largest functions |

> **Rule of thumb**: A 200-line React component may be fine; a 200-line Rust function is likely a problem.

---

## 2. Baseline — Pre-Refactoring Metrics

### 2.1 Quantitative Baselines

Run these in **parallel** where possible:

| Metric | How to measure | Parallel? |
|--------|---------------|-----------|
| Build time | Run build command 2-3 times, take median | Yes (with test) |
| Test suite runtime | Run full test suite once | Yes (with build) |
| Test count | Parse test runner output | From test run |
| Bundle/artifact size | `ls -lh` or `du -sh` on build output | After build |
| Lint warning count | `<lint-cmd> 2>&1 \| Measure-Object -Line` | Yes (independent) |
| Dependency count | Count entries in dependency manifest | Yes (independent) |
| File count | `Get-ChildItem -Recurse -File \| Measure-Object \| Select-Object Count` | Yes (independent) |

### 2.2 Qualitative Baselines

- Which areas have few contributors? → `git log --format='%an' --follow <file> | Sort-Object -Unique`
- Test flakiness: any `.skip` or `.only` modifiers?

### 2.3 Baseline Snapshot

Record in the report:

```markdown
## Baseline Metrics
| Metric | Value |
|--------|-------|
| Build time | Xs |
| Test suite runtime | Xs |
| Test count | N |
| Lint warnings | N |
| File count | N |
```

---

## 3. Survey — Project Overview

### 3.1 Architecture Understanding

- Read top-level docs (README, ARCHITECTURE.md, CONTRIBUTING.md)
- Trace the dependency graph:
  - JS/TS: `npx madge --circular --image graph.png src/` or `npx dpdm --circular src/index.ts`
  - Rust: `cargo modules structure --lib`
  - Python: `pydeps --show-deps src/`
- Identify the primary architectural pattern (MVC, layered, hexagonal, feature-based, etc.)

### 3.2 Macro Statistics

```bash
# Directory-level size distribution
Get-ChildItem -Recurse -File -Include *.ts,*.tsx,*.rs |
  ForEach-Object { [PSCustomObject]@{ Dir=$_.DirectoryName; Lines=(Get-Content $_.FullName | Measure-Object -Line).Lines } } |
  Group-Object Dir | ForEach-Object { [PSCustomObject]@{ Directory=$_.Name; Files=$_.Count; TotalLines=($_.Group | Measure-Object Lines -Sum).Sum } } |
  Sort-Object TotalLines -Descending

# Test file distribution (identify directories with no tests)
Get-ChildItem -Recurse -File -Include *.test.*,*.spec.* | Group-Object DirectoryName | Sort-Object Count -Descending

# Recent change hotspots (last 30 days)
git log --since="30 days ago" --name-only --format="" | Sort-Object | Group-Object | Sort-Object Count -Descending | Select-Object -First 20

# Recently added modules (last 3 months, may be less mature)
git log --diff-filter=A --name-only --format="" --since="3 months ago" | Sort-Object -Unique
```

---

## 4. Systematic Scanning

Scan across **five** independent dimensions. For large projects, use the [multi-agent dispatch strategy](#multi-agent-parallel-scan).

### 4.1 Code Structure

| Scan Item | What to look for | How to detect |
|-----------|-----------------|---------------|
| Outlier files | Files significantly larger than project median | Use file size distribution from 1.5 |
| Outlier functions | Functions significantly longer than project norm | Grep for `function` / `fn` / `def`, count lines between definitions |
| Deep nesting | >4 levels of indentation, callback hell, nested conditionals | Manual review of largest files; ESLint `max-depth` rule if available |
| High complexity | Functions with many branches/paths | Use project's linter complexity rules; `radon cc` for Python |
| Duplicate code | Blocks of >10 similar lines across files | `npx jscpd src/` (JS/TS); manual diff for Rust |
| Dead code | Unused exports, imports, functions, variables | ESLint `no-unused-vars`; `cargo check --warnings`; `vulture` for Python |

### 4.2 Architecture & Design

| Scan Item | What to look for | How to detect |
|-----------|-----------------|---------------|
| Circular dependencies | A imports B, B imports A (or longer cycles) | `npx madge --circular src/` (JS/TS); `cargo modules structure --lib` (Rust) |
| Tight coupling | Modules imported by many others | `npx madge --image graph.png src/`; `cargo modules structure --lib` |
| God modules | File handling too many unrelated concerns | Manual review of largest files; count distinct concerns per file |
| Layer violations | Low-level code depending on high-level; UI touching data access | Manual review of import graphs |
| Inconsistent patterns | Same concern handled differently across codebase | Grep for error handling, state management, logging patterns |
| Premature abstraction | Abstractions with only one consumer | Grep for `interface` / `trait` and count implementations |

### 4.3 Performance & Resource

| Scan Item | What to look for | How to detect |
|-----------|-----------------|---------------|
| N+1 patterns | Queries/API calls inside loops | Grep for `await` inside `for`/`while`; manual review |
| Unnecessary allocations | Objects created in hot paths | Rust: `cargo clippy`; JS: `{...spread}` in loops |
| Blocking in async | Synchronous I/O in async functions | Rust: `cargo clippy`; JS: grep for `readFileSync` in async |
| Repeated computation | Values computed multiple times without caching | Manual review of hot paths |
| Heavy imports | Importing entire libraries when subset needed | JS: `import * from`; Python: `from module import *` |
| Resource management | Unclosed handles, connections, listeners | Manual review; Rust: `cargo clippy`; JS: missing `removeEventListener` |

### 4.4 Security

| Scan Item | What to look for | How to detect |
|-----------|-----------------|---------------|
| Secret exposure | Hardcoded API keys, tokens, passwords | Grep for `api_key`, `secret`, `password`, `token`, `-----BEGIN` |
| Dependency vulnerabilities | Known CVEs | `npm audit` / `pnpm audit`; `cargo audit`; `pip-audit` |
| Injection risks | Unsanitized input in shell/SQL/HTML | Grep for `exec(`, `spawn(`, `eval(`, `innerHTML` |
| Insecure defaults | Debug mode, open CORS, HTTP | Check config files; grep for `DEBUG=true`, `CORS_ORIGIN=*` |
| Missing input validation | Unvalidated user/external input | Manual review of API handlers and command endpoints |

### 4.5 Hygiene & Quality

| Scan Item | What to look for | How to detect |
|-----------|-----------------|---------------|
| Debug artifacts | `console.log`, `print()`, `dbg!()` in non-test code | Grep, exclude test files |
| Hardcoded values | URLs, magic numbers, locale strings | Grep for URL patterns, bare numbers in logic |
| Error handling | Mixed patterns: throw vs null vs Result vs panic | Manual review across modules |
| Deferred debt | `TODO`, `FIXME`, `HACK`, `XXX` comments | `grep -r "TODO\|FIXME\|HACK\|XXX" --include="*.ts" --include="*.rs"` |
| Configuration sprawl | Settings scattered across files, env vars, defaults | Count distinct config sources |
| Test gaps | Directories with no corresponding test files | Compare file lists from 3.2; identify modules with 0 tests |

### Multi-Agent Parallel Scan

For large projects (>500 files) or when the user wants fast results, dispatch parallel sub-agents using the `Task` tool:

```
1. Split the scan into independent sub-agent tasks:
   - Agent A: Code Structure scan (4.1) on directories X, Y
   - Agent B: Architecture & Design scan (4.2) on all directories
   - Agent C: Performance & Security scans (4.3 + 4.4) on all directories
   - Agent D: Hygiene & Quality scan (4.5) on all directories

2. Dispatch all 4 agents in parallel using multiple Task tool calls in a single message

3. Each agent returns its findings. Merge, de-duplicate, and resolve conflicts in the main session.

4. If project is extremely large (>2000 files), split each dimension by subdirectory:
   - Agent A1: Code Structure on frontend/
   - Agent A2: Code Structure on backend/
   - etc.
```

If `Task` tool is unavailable, scan sequentially and note the limitation.

---

## 5. Risk Assessment

### 5.1 Risk Dimensions

For each finding, evaluate:

| Dimension | Question |
|-----------|---------|
| **Impact** | If unfixed, what breaks? How many users/features affected? |
| **Likelihood** | How likely to cause a real problem? (check git history for hot-fix frequency) |
| **Fix complexity** | How many files/modules need to change? |
| **Ripple risk** | Could fixing this cascade into other issues? |

### 5.2 Confidence Levels

Every finding must include a confidence level:

| Confidence | Meaning | When to use |
|------------|---------|-------------|
| **High** | Confirmed by tool output or multiple indicators | Linter errors, CVE alerts, measurable metrics |
| **Medium** | Strong pattern but not tool-verified | Duplicate code, inconsistent patterns |
| **Low** | Based on heuristics or single indicator | Suspected N+1, possible dead code |

### 5.3 Risk Matrix

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

### 5.4 Execution Ordering

1. **High Impact + High Likelihood** — Fix first
2. **High Impact + Low Likelihood** — Plan, add tests as safety net
3. **Low Impact + High Likelihood** — Quick wins if low fix complexity
4. **Low Impact + Low Likelihood** — Defer

### 5.5 Priority Criteria

| Level | Criteria |
|-------|---------|
| **Critical** | Correctness bug, security vulnerability, data loss risk, severe architecture violation |
| **High** | Significant maintainability burden, large duplication, module exceeding norms by >3x |
| **Medium** | Files/functions somewhat exceeding norms, inconsistent patterns, non-critical optimization |
| **Low** | Minor style inconsistency, small cleanup, nice-to-have |

---

## 6. Collaborative Report Writing

Load the `brainstorming` skill and follow its **Spec Writing** workflow to produce the insight report. The brainstorming skill handles: asking clarifying questions, proposing approaches, presenting sections incrementally, writing the design doc, spec self-review, and the user review gate.

> If `brainstorming` is not available, write the report directly using the template below and present for review.

### 6.1 Refactoring-Specific Adaptations

When using brainstorming's workflow, adapt it as follows:

- **"Explore project context"** → Already done (sections 0-5). Present findings as the context.
- **"Ask clarifying questions"** → Focus on: which areas to emphasize, whether findings seem accurate, preferred detail level.
- **"Propose 2-3 approaches"** → Use these report styles:

| Approach | Style | When to use |
|----------|-------|-------------|
| **Executive first** | Risk summary + detailed appendix | Quick decision-making |
| **Deep dive** | Full findings with code references, impact | User plans to fix |
| **Focused scope** | Drill into specific modules/dimensions | Specific concern, limited time |

- **"Present design sections"** → Present: (1) Baseline & Risk Summary, (2) Findings by dimension, (3) Statistics & Execution Order.
- **Offer dry-run**: Before writing the full report, offer a summary of top findings for early feedback.

### 6.2 Output Location

Write to `docs/superpowers/specs/YYYY-MM-DD-refactoring-insight-<topic>-design.md`. Auto-create the directory if needed.

### 6.3 Report Template

```markdown
# Refactoring Insight Report

**Generated**: YYYY-MM-DD
**Project**: <name>
**Tech Stack**: <languages, frameworks, build tools>
**Scope**: <directories/modules analyzed>
**Previous Report**: <path or "None">

---

## Baseline Metrics

| Metric | Value |
|--------|-------|
| Build time | Xs |
| Test suite runtime | Xs |
| Test count | N |
| Lint warnings | N |
| File count | N |
| Dependencies | N |

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

| Location | Issue | Impact | Suggestion | Risk | Confidence |
|----------|-------|--------|------------|------|------------|
| `path/file:line` | Problem and why it matters | What breaks if unfixed | Concrete, actionable fix | Critical/High/Medium/Low | High/Medium/Low |

### 2. Performance

| Location | Issue | Impact | Suggestion | Risk | Confidence |
|----------|-------|--------|------------|------|------------|

### 3. Code Structure

| Location | Issue | Impact | Suggestion | Risk | Confidence |
|----------|-------|--------|------------|------|------------|

### 4. Security

| Location | Issue | Impact | Suggestion | Risk | Confidence |
|----------|-------|--------|------------|------|------------|

### 5. Hygiene & Quality

| Location | Issue | Impact | Suggestion | Risk | Confidence |
|----------|-------|--------|------------|------|------------|

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

## Trend Comparison (if previous report exists)

| Metric | Previous | Current | Delta |
|--------|----------|---------|-------|
| Total findings | N | N | +/-N |
| Critical | N | N | +/-N |
| Lint warnings | N | N | +/-N |

---

## Recommended Execution Order

1. [Critical] <finding summary> — <reason> (confidence: <level>)
2. [Critical] <finding summary> — <reason> (confidence: <level>)
3. [High] <finding summary> — <reason> (confidence: <level>)
...

---

## Limitations

- <Dimensions that could not be fully scanned and why>
- <Unavailable tools and the impact on findings>
```

### 6.4 Report Quality Checklist

After writing the report (via brainstorming's spec self-review), verify these refactoring-specific checks:

- [ ] All five dimensions covered; "No issues found" where applicable
- [ ] Every finding has: location, risk level, confidence level, actionable suggestion
- [ ] No "TBD" or "TODO" placeholders; all metrics populated with actual values
- [ ] Previous report findings are verified, not blindly copied
- [ ] Limitations section documents any gaps
- [ ] Low-confidence findings are clearly marked

---

## Next Steps

After the user approves the report (following brainstorming's user review gate):

| Step | Skill | Purpose |
|------|-------|---------|
| Plan | `writing-plans` | Convert prioritized findings into a structured implementation plan |
| Execute | `executing-plans` or `subagent-driven-development` | Implement changes in order |
| Verify | `verification-before-completion` | Run tests, linters, type checks to confirm nothing broke |

**Important**: Do not start execution without user approval.

---

## Constraints

| Constraint | Description |
|------------|-------------|
| Insight only | Analyzes and reports. Does not modify code. |
| No fixed thresholds | Thresholds calibrated per-project in Discovery |
| Language agnostic | Dimensions work for any language; tooling adapts to existing project tools |
| Objective | Findings based on observable code properties, not style preferences |
| Honest | Report limitations honestly; don't fabricate findings |
| Confidence required | Every finding includes a confidence level (High/Medium/Low) |
| Scope first | Always confirm analysis scope with the user before starting |
| Verify, don't trust | Past reports/issues are independently verified, not blindly accepted |