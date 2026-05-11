# Standard Scrollbar Decoupling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple the app-owned standard scrollbar from minimap geometry and menu semantics so standard mode behaves like a modern proportional scrollbar without changing minimap behavior.

**Architecture:** Keep the existing `MinimapPlugin` as the shared integration point, but split internal geometry, rendering, and menu branches into minimap-specific and standard-specific paths. Remove ordinary scrollbar exposure to legacy slider-behavior settings while preserving storage compatibility for existing users.

**Tech Stack:** TypeScript, CodeMirror 6 view plugins, Vitest, product CSS in `regions.css`

---

### Task 1: Lock the new standard scrollbar contract in tests

**Files:**
- Modify: `ai-digital-life/frontend/src/app/regions/right-panel/cmMinimap.test.ts`

- [ ] Add failing assertions that ordinary mode no longer exposes `滑块: 按比例 / 固定`.
- [ ] Add failing assertions that the plugin contains dedicated standard/minimap track helpers and that standard mode forces proportional slider behavior.
- [ ] Run `npm --prefix ai-digital-life/frontend test -- --run src/app/regions/right-panel/cmMinimap.test.ts` and verify red.

### Task 2: Split standard and minimap runtime geometry

**Files:**
- Modify: `ai-digital-life/frontend/src/app/regions/right-panel/cmMinimap.ts`

- [ ] Remove runtime dependence on persisted `sliderBehavior` from `MinimapSettings`, while keeping legacy parse compatibility.
- [ ] Add a dedicated standard-track helper that uses viewport-height geometry only.
- [ ] Rename and preserve the existing minimap track helper for content-track geometry.
- [ ] Route `getTrackMetrics()` by `scrollbarType` so ordinary mode never enters minimap content-track calculations.
- [ ] Force ordinary mode to return proportional slider behavior.
- [ ] Skip minimap canvas rendering work in ordinary mode so standard mode no longer participates in thumbnail rendering logic.

### Task 3: Simplify the standard scrollbar menu

**Files:**
- Modify: `ai-digital-life/frontend/src/app/regions/right-panel/cmMinimap.ts`

- [ ] Remove `滑块: 按比例 / 固定` from the ordinary mode menu branch.
- [ ] Keep the minimap-only controls under minimap mode.
- [ ] Keep shared controls limited to `滑块样式` and `设置: 全局 / 独立`.

### Task 4: Restyle ordinary mode as a modern narrow scrollbar

**Files:**
- Modify: `ai-digital-life/frontend/src/styles/regions.css`
- Test: `ai-digital-life/frontend/src/app/regions/right-panel/cmPreviewStyling.test.ts`

- [ ] Keep the standard rail narrow and app-owned.
- [ ] Tune the ordinary slider inset, opacity, and hover/active states so it reads as a modern scrollbar instead of a hidden minimap.
- [ ] Preserve the hidden thumbnail canvas in standard mode.

### Task 5: Verify and sync docs

**Files:**
- Modify: `UIOperationManual/rightpanel/tools/files.md`
- Modify: `UIOperationManual/rightpanel/tools/changes.md`

- [ ] Update the manual so ordinary mode no longer documents `滑块: 按比例 / 固定`.
- [ ] Clarify that ordinary mode uses a modern proportional scrollbar and does not inherit minimap zoom/track behavior.
- [ ] Run:

```bash
npm --prefix ai-digital-life/frontend test -- --run \
  src/app/regions/right-panel/cmMinimap.test.ts \
  src/app/regions/right-panel/cmPreviewStyling.test.ts \
  src/app/regions/right-panel/filesEditorOptions.test.ts \
  src/app/regions/right-panel/changesEditorOptions.test.ts
```

- [ ] Run `git -C ai-digital-life diff --check` and confirm there are no new format errors.
