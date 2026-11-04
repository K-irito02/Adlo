# Preview fixtures

Stable, tiny samples for verifying the file-preview surfaces (file panel + changes panel) without shipping user documents.

| File | Purpose |
|------|---------|
| `frontmatter.md` | Generic frontmatter property table: scalar, long value, inline list, block list, booleans, custom key. |
| `sample.docx` | Minimal OOXML document (12 paragraphs) — docx rendering, paper sweep, persistent classic scrollbar. |
| `sample.pdf` | Two-page handcrafted PDF (Helvetica text) — capsule nav, double-click / keyboard / touch page jump, cache re-open. |

Regenerate all three:

```bash
pnpm --dir adlo run fixtures:preview
```

The generator (`adlo/scripts/make-preview-fixtures.mjs`) writes the docx as a stored (uncompressed) ZIP and the PDF with hand-computed xref offsets — no third-party dependencies.

Notes:

- These files are excluded from vitest coverage (`src/test-fixtures/**`).
- They are inputs for manual verification and for the Playwright preview harness; no test imports them yet.
- Put them in a throwaway workspace when opening them in the app; do not add them to `references/`.
