# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root, or
- **`GLOSSARY-MAP.md`** at the repo root if it exists: it points at one `GLOSSARY.md` per context. Read each one relevant to the topic.
- **`docs/adr/`**: 先读 [`docs/adr/README.md`](../adr/README.md)（按域索引）定位涉及领域的 ADR，再读具体文件。In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

`GLOSSARY.md` shape is machine-checked by `pnpm --dir adlo/frontend check:glossary`: every term needs an `_Avoid_` line, and implementation tokens (paths, file names) or numeric counts are rejected. The same check rejects Markdown emphasis corruption in glossary bodies (`HTTP*PROXY`, `\_Avoid_`) — always wrap environment-variable names in backticks, otherwise Prettier turns bare underscores into emphasis and silently changes the definition.

Backticked entries inside an `_Avoid_` line are **enforced**: `check:glossary` fails if they appear in `frontend/src/app/i18n/zh-CN/**`, `docs/operations/**`, or `docs/architecture/**`（以 `adlo/frontend/scripts/check-glossary.ts` 的 `ENFORCED_SOURCES` 为准）. Put a `glossary-allow` marker on a line for an intentional exception (for example, quoting a historical UI string). Plain `_Avoid_` entries are advisory only.

## 收尾时的词表核对

新增 UI 表面概念（覆盖层、面板、行、组）时先查词表是否已有条目。代码或文档里出现**被反复引用却未定义**的概念、或既有条目被放错分区时，收尾阶段跑一次 `domain-modeling` 技能补齐（词条 + `_Avoid_` + 必要时升级为强制词）。`check:glossary` 只能校验"已有词条格式正确"，发现不了"概念缺失"——2026-11-13 的「设置行/设置组」与放错段的「设置块」就是这样漏掉的。

## File structure

Single-context repo (most repos):

```
/
├── GLOSSARY.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

Multi-context repo (presence of `GLOSSARY-MAP.md` at the root):

```
/
├── GLOSSARY-MAP.md
├── docs/adr/                          ← system-wide decisions
└── src/
    ├── ordering/
    │   ├── GLOSSARY.md
    │   └── docs/adr/                  ← context-specific decisions
    └── billing/
        ├── GLOSSARY.md
        └── docs/adr/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
