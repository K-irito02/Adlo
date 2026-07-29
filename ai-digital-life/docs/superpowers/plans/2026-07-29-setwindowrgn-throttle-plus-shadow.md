# SetWindowRgn Throttle + Shadow Enable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix progressive message pump degradation on `decorations: false` Windows by throttling `SetWindowRgn` calls in `tauri-runtime-wry`, and add window shadow for PR #12817 optimization benefit.

**Architecture:** Solution A throttles `set_drag_hwnd_rgn()` calls in the `WM_SIZE` handler of `tauri-runtime-wry`'s undecorated resizing module (every 5th call instead of every frame), proven effective in tauri#15569. Solution B enables `shadow: true` which triggers a simplified resize cutout path (PR #12817) that performs fewer GDI operations. Both changes combined address the root cause at the OS message pump level rather than JS workarounds.

**Tech Stack:** Rust, `tauri-runtime-wry` v2.11.4 (transitive dep), Windows Win32 API (`SetWindowRgn`, `CreateRectRgn`, `CombineRgn`), Tauri 2.11.5.

## Global Constraints

- Must preserve `decorations: false` and existing custom titlebar (`TitleBar.tsx`) — no layout changes.
- Throttle ratio: `SetWindowRgn` called every 5th `WM_SIZE` (rate 1:5).
- Patch must be local (crates/ directory) via `[patch.crates-io]` in workspace `Cargo.toml`.
- `shadow: true` config must coexist with `decorations: false` (Windows 11 gets rounded corners + 1px border).
- Only modify Windows-specific code (`#[cfg(windows)]` module). Linux/macOS unaffected.
- All existing tests must still pass after changes.

---
### Task 1: Create patched local copy of `tauri-runtime-wry`

**Files:**
- Create: `crates/tauri-runtime-wry-patched/Cargo.toml`
- Create: `crates/tauri-runtime-wry-patched/build.rs`
- Create: `crates/tauri-runtime-wry-patched/src/lib.rs`
- Create: `crates/tauri-runtime-wry-patched/src/undecorated_resizing.rs`
- Create: `crates/tauri-runtime-wry-patched/src/util.rs`
- Create: `crates/tauri-runtime-wry-patched/src/webview.rs`
- Create: `crates/tauri-runtime-wry-patched/src/window/mod.rs`
- Create: `crates/tauri-runtime-wry-patched/src/window/windows.rs`
- Create: `crates/tauri-runtime-wry-patched/src/window/linux.rs`
- Create: `crates/tauri-runtime-wry-patched/src/window/macos.rs`
- Create: `crates/tauri-runtime-wry-patched/src/dialog/mod.rs`
- Create: `crates/tauri-runtime-wry-patched/src/dialog/windows.rs`
- Create: `crates/tauri-runtime-wry-patched/src/monitor/mod.rs`
- Create: `crates/tauri-runtime-wry-patched/src/monitor/windows.rs`
- Create: `crates/tauri-runtime-wry-patched/src/monitor/linux.rs`
- Create: `crates/tauri-runtime-wry-patched/src/monitor/macos.rs`

**Interfaces:**
- Consumes: Exact source of `tauri-runtime-wry` v2.11.4 from cargo registry
- Produces: A local crate `tauri-runtime-wry-patched` at `crates/tauri-runtime-wry-patched/` that is byte-for-byte identical to the upstream except for `undecorated_resizing.rs`

**Note:** Task 1 is pure scaffolding — copy the upstream crate verbatim. The actual logic change happens in Task 2.

- [ ] **Step 1: Create directory structure**

```powershell
New-Item -ItemType Directory -Path "crates/tauri-runtime-wry-patched\src\dialog" -Force
New-Item -ItemType Directory -Path "crates/tauri-runtime-wry-patched\src\monitor" -Force
New-Item -ItemType Directory -Path "crates/tauri-runtime-wry-patched\src\window" -Force
```

- [ ] **Step 2: Copy Cargo.toml**

Copy `C:\Users\31432\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\tauri-runtime-wry-2.11.4\Cargo.toml` to `crates/tauri-runtime-wry-patched\Cargo.toml`. The normalized registry Cargo.toml can be used directly; no changes needed yet.

- [ ] **Step 3: Copy build.rs, src/lib.rs, src/util.rs, src/webview.rs**

```powershell
$src = "C:\Users\31432\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\tauri-runtime-wry-2.11.4"
$dst = "crates/tauri-runtime-wry-patched"
Copy-Item "$src\build.rs" "$dst\build.rs"
Copy-Item "$src\src\lib.rs" "$dst\src\lib.rs"
Copy-Item "$src\src\util.rs" "$dst\src\util.rs"
Copy-Item "$src\src\webview.rs" "$dst\src\webview.rs"
```

- [ ] **Step 4: Copy window module, dialog module, monitor module**

```powershell
$src = "C:\Users\31432\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\tauri-runtime-wry-2.11.4"
$dst = "crates/tauri-runtime-wry-patched"
Copy-Item "$src\src\undecorated_resizing.rs" "$dst\src\undecorated_resizing.rs"  # will modify in Task 2
Copy-Item "$src\src\window\mod.rs" "$dst\src\window\mod.rs"
Copy-Item "$src\src\window\windows.rs" "$dst\src\window\windows.rs"
Copy-Item "$src\src\window\linux.rs" "$dst\src\window\linux.rs"
Copy-Item "$src\src\window\macos.rs" "$dst\src\window\macos.rs"
Copy-Item "$src\src\dialog\mod.rs" "$dst\src\dialog\mod.rs"
Copy-Item "$src\src\dialog\windows.rs" "$dst\src\dialog\windows.rs"
Copy-Item "$src\src\monitor\mod.rs" "$dst\src\monitor\mod.rs"
Copy-Item "$src\src\monitor\windows.rs" "$dst\src\monitor\windows.rs"
Copy-Item "$src\src\monitor\linux.rs" "$dst\src\monitor\linux.rs"
Copy-Item "$src\src\monitor\macos.rs" "$dst\src\monitor\macos.rs"
```

- [ ] **Step 5: Verify crate compiles standalone (before patch)**

```powershell
cd crates/tauri-runtime-wry-patched
cargo check
```

Expected: compilation succeeds (may have warnings, should have no errors). In practice this might fail because of implicit workspace dependencies; if so, the crate will compile correctly once wired via `[patch]` in Task 3.

- [ ] **Step 6: Commit scaffold**

```powershell
git add crates/tauri-runtime-wry-patched/
git commit -m "chore: scaffold tauri-runtime-wry v2.11.4 local copy for patching"
```

---
### Task 2: Add SetWindowRgn throttling to `undecorated_resizing.rs`

**Files:**
- Modify: `crates/tauri-runtime-wry-patched/src/undecorated_resizing.rs:198-243`

**Interfaces:**
- Consumes: The `windows` module in `undecorated_resizing.rs` from Task 1
- Produces: Modified `subclass_parent` fn that only calls `set_drag_hwnd_rgn()` every 5th `WM_SIZE`

**Logic:** The `subclass_parent` function's `WM_SIZE` arm (line 207) calls `set_drag_hwnd_rgn()` on every resize frame. We add a `thread_local!` counter for `SetWindowRgn` calls. Each `WM_SIZE` increments the counter; only when `counter % 5 == 0` do we actually call `set_drag_hwnd_rgn()`. On other frames, we still do `SetWindowPos` (which is cheap and not the source of degradation per issue #15569).

- [ ] **Step 1: Modify `undecorated_resizing.rs` to add throttling**

Apply this edit to `subclass_parent` — replace the `WM_SIZE => {` block (line 207-244) to throttle `set_drag_hwnd_rgn`:

```rust
// Edit the WM_SIZE arm (lines 206-244) to add throttling:

      WM_SIZE => {
        thread_local! {
          static SET_WINDOW_RGN_SKIP_COUNTER: std::cell::Cell<u32> = const { std::cell::Cell::new(0) };
        }

        let data = data as *mut UndecoratedResizingData;
        let data = &*data;
        let child = data.child;
        let has_undecorated_shadows = data.has_undecorated_shadows;

        // when parent is maximized, remove the undecorated window drag resize region
        if is_maximized(parent).unwrap_or(false) {
          let _ = SetWindowPos(
            child,
            Some(HWND_TOP),
            0,
            0,
            0,
            0,
            SWP_ASYNCWINDOWPOS | SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_NOMOVE,
          );
        } else {
          // otherwise updat the cutout region
          let mut rect = RECT::default();
          if GetClientRect(parent, &mut rect).is_ok() {
            let width = rect.right - rect.left;
            let height = rect.bottom - rect.top;

            let _ = SetWindowPos(
              child,
              Some(HWND_TOP),
              0,
              0,
              width,
              height,
              SWP_ASYNCWINDOWPOS | SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_NOMOVE,
            );

            // Throttle SetWindowRgn: only execute every 5th call to prevent
            // progressive message pump degradation (tauri#15569).
            // SetWindowRgn with CombineRgn triggers extra WM_NCCALCSIZE/WM_NCPAINT
            // messages that compound through Tauri's heavier event loop pipeline.
            // SetWindowPos alone is cheap and not the source of degradation.
            SET_WINDOW_RGN_SKIP_COUNTER.with(|counter| {
              let current = counter.get();
              counter.set(current.wrapping_add(1));
              if current % 5 == 0 {
                set_drag_hwnd_rgn(child, width, height, has_undecorated_shadows);
              }
            });
          }
        }
      }
```

- [ ] **Step 2: Verify the file still compiles**

```powershell
cd crates/tauri-runtime-wry-patched
cargo check 2>&1
```

Expected: no errors. The `thread_local!` macro is in `std::cell` and available in `no_std` context, and `Cell<u32>` is `Sync` so it works in unsafe FFI context.

- [ ] **Step 3: Commit**

```powershell
git add crates/tauri-runtime-wry-patched/src/undecorated_resizing.rs
git commit -m "fix: throttle SetWindowRgn to every 5th WM_SIZE call
        
        Add thread_local skip counter to subclass_parent's WM_SIZE handler.
        Only execute the expensive set_drag_hwnd_rgn() (CreateRectRgn +
        CombineRgn + SetWindowRgn) on every 5th message. SetWindowPos is
        called every frame and is not the source of degradation.
        
        Proven effective in tauri#15569: throttling to 1:5 ratio eliminates
        the progressive WM_SIZE throughput degradation (40/s -> 19/s over
        35s of dragging)."
```

---
### Task 3: Wire patched crate via `[patch.crates-io]`

**Files:**
- Modify: `Cargo.toml` (workspace root at `ai-digital-life/Cargo.toml`)

**Interfaces:**
- Consumes: `crates/tauri-runtime-wry-patched/` from Task 1-2
- Produces: Workspace `Cargo.toml` with `[patch.crates-io]` section that replaces upstream `tauri-runtime-wry` with local patched copy

- [ ] **Step 1: Add `[patch.crates-io]` section**

Append to the end of `Cargo.toml` (after the `[profile]` section):

```toml
[patch.crates-io]
tauri-runtime-wry = { path = "crates/tauri-runtime-wry-patched" }
```

- [ ] **Step 2: Verify the patch resolves correctly**

```powershell
cargo metadata --format-version 1 | ConvertFrom-Json | Select-Object -ExpandProperty packages | Where-Object { $_.name -eq "tauri-runtime-wry" } | Select-Object version, manifest_path
```

Expected: `manifest_path` should point to `crates/tauri-runtime-wry-patched/Cargo.toml`, version `2.11.4`.

- [ ] **Step 3: Build to confirm full compilation with patch**

```powershell
cargo build --package ai-digital-life
```

Expected: compilation succeeds. This may take a while as it rebuilds `tauri-runtime-wry` from local source.

- [ ] **Step 4: Run Rust tests to verify nothing broken**

```powershell
cargo test --workspace
```

Expected: all tests pass (currently 534 tests as of last check). If any test that depends on window sizing behavior fails, investigate whether the throttle ratio affects it (unlikely since throttle preserves every 5th `SetWindowRgn` call).

- [ ] **Step 5: Commit**

```powershell
git add Cargo.toml
git commit -m "fix: wire patched tauri-runtime-wry via [patch.crates-io]
        
        Replace upstream tauri-runtime-wry v2.11.4 with local patched copy
        at crates/tauri-runtime-wry-patched/ that throttles SetWindowRgn
        calls to prevent progressive message pump degradation."
```

---
### Task 4: Enable `shadow: true` in window config

**Files:**
- Modify: `src-tauri/tauri.conf.json:20` (add `"shadow": true`)

**Interfaces:**
- Consumes: Window config for `"main"` window
- Produces: Window with `decorations: false` + `shadow: true` — on Windows 11 this gives rounded corners + 1px white border, and triggers the simplified resize cutout path from PR #12817

- [ ] **Step 1: Add `"shadow": true` to window config**

In `tauri.conf.json`, modify the `"main"` window entry (line 12-24) to add `"shadow": true`:

```json
    "windows": [
      {
        "label": "main",
        "title": "AI Digital Life",
        "width": 1280,
        "height": 800,
        "minWidth": 640,
        "minHeight": 480,
        "decorations": false,
        "shadow": true,
        "resizable": true,
        "fullscreen": false,
        "visible": false
      }
    ],
```

- [ ] **Step 2: Build to verify config is valid**

```powershell
cargo build --package ai-digital-life
```

Expected: compilation succeeds. Config validation is done at compile time by Tauri's build script.

- [ ] **Step 3: Run frontend tests (optional safety check)**

```powershell
pnpm --dir frontend run test
```

Expected: all 594+ frontend tests pass (window config change should not affect frontend tests, but verify).

- [ ] **Step 4: Commit**

```powershell
git add src-tauri/tauri.conf.json
git commit -m "feat: enable shadow on undecorated window
        
        Adding shadow: true to the undecorated (decorations: false) window
        triggers the optimized resize path from tauri PR #12817 — simplified
        cutout region (only top border) reducing GDI operations per resize
        frame. On Windows 11 this also adds rounded corners and native shadow.
        On Windows 10 this has no visual effect but still activates the
        optimized code path."
```

---
### Task 5: Verify full build and run

**Files:** (no new files)
**Interfaces:** End-to-end verification

- [ ] **Step 1: Full workspace build + lint**

```powershell
cargo build --workspace
cargo clippy --workspace --all-targets -- -D warnings
```

Expected: build succeeds, clippy reports 0 warnings (currently enforced).

- [ ] **Step 2: Run all workspace tests**

```powershell
cargo test --workspace
```

Expected: all tests pass.

- [ ] **Step 3: Run frontend tests and lint**

```powershell
pnpm --dir frontend run test
pnpm --dir frontend run lint
```

Expected: all tests pass, lint has no new warnings (pre-existing warnings re: react-refresh/only-export-components and react-hooks/exhaustive-deps are acceptable).

- [ ] **Step 4: Launch app and verify manually**

```powershell
cargo tauri dev
```

Manual verification checklist:
1. Window appears with custom titlebar and no native chrome
2. Window has rounded corners + shadow on Windows 11
3. Drag the window titlebar — smooth, no stutter
4. Resize from edges — no progressive lag
5. Load many commits in branch graph — tag label drag should not stutter
6. All window controls (minimize/maximize/close) work correctly

- [ ] **Step 5: Commit final state**

```powershell
git add -A
git commit -m "chore: verify full build and tests pass after SetWindowRgn throttle + shadow enable"
```

---
## Rollback Plan

If the patch causes issues:
1. Remove `[patch.crates-io]` section from workspace `Cargo.toml` to revert to upstream `tauri-runtime-wry`
2. Remove `"shadow": true` from `tauri.conf.json`
3. Run `cargo update` to clear patch resolver state
