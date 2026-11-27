import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyOverlayText, parseOverlay } from "./skills-sync.mjs";

const overlayDir = fileURLToPath(new URL("../skills-overlays/domain-modeling/", import.meta.url));

const pristineGlossaryFormat = `# GLOSSARY.md Format

**Invoice**:
A request for payment for an Order, sent to its Customer after delivery.
_Avoid_: Bill, payment request

**Customer**:
A person or organization that places an **Order**.
_Avoid_: Client, buyer, account

## Rules

- **Be opinionated.** When multiple words exist for the same concept, pick the best one and list the others under _Avoid_.
- **Keep definitions tight.** One or two sentences max. Define what it IS, not what it does.
- **Bold other glossary terms inside a definition.** When a definition mentions another term, write it as \`**Order**\`, and let the sentence around it say how the two relate.
- **Only include terms specific to this project's context.**
- **Group terms under subheadings** when natural clusters emerge. If all terms belong to a single cohesive area, a flat list is fine.

## Single vs multi-context repos
`;

test("domain-modeling overlays apply independently to pristine upstream content", () => {
  const overlays = readdirSync(overlayDir)
    .filter((name) => name.endsWith(".overlay"))
    .sort()
    .map((name) => ({ name, ...parseOverlay(readFileSync(join(overlayDir, name), "utf8")) }))
    .filter((overlay) => overlay.target === "GLOSSARY-FORMAT.md");
  assert.ok(overlays.length >= 3, "expected separate example, rule, and insertion overlays");

  let text = pristineGlossaryFormat;
  for (const overlay of overlays) {
    assert.ok(overlay.find.length <= 300, `${overlay.name} anchor spans too much upstream text`);
    text = applyOverlayText(text, overlay, overlay.name);
    assert.equal(
      applyOverlayText(text, overlay, overlay.name),
      text,
      `${overlay.name} must be idempotent`,
    );
  }

  assert.match(text, /A person or organization that places an Order\./);
  assert.doesNotMatch(text, /places an \*\*Order\*\*/);
  assert.match(text, /Reference other glossary terms in plain text or with Markdown links\./);
  assert.match(text, /No emphasis in definitions\./);
});
