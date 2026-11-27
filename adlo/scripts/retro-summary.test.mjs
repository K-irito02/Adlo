import test from "node:test";
import assert from "node:assert/strict";
import { parseSessionExport, summarizeSession } from "./retro-summary.mjs";

const tool = (id, name, created, ran, completed, status = "completed") => ({
  type: "tool",
  id,
  name,
  state: { status, time: { ran, completed } },
});

const fixture = {
  info: { id: "session" },
  messages: [
    { id: "u1", type: "user", time: { created: 100 } },
    {
      id: "a1",
      type: "assistant",
      time: { created: 200 },
      tokens: { input: 500, output: 20, reasoning: 5, cache: { read: 10 } },
      content: [
        tool("t1", "shell", 200, 200, 1_200),
        tool("t2", "read", 200, 1_200, 1_700, "error"),
      ],
    },
    {
      id: "a2",
      type: "assistant",
      time: { created: 300 },
      tokens: { input: 1_500, output: 30, reasoning: 10, cache: { read: 20 } },
      content: [tool("t3", "read", 300, 1_700, 2_000), tool("t4", "read", 300, 2_000, 2_300)],
    },
    {
      id: "a3",
      type: "assistant",
      time: { created: 400 },
      content: [tool("t5", "read", 400, 2_300, 2_600)],
    },
    { id: "s1", type: "synthetic", time: { created: 500 } },
  ],
};

test("parses an export with a leading session-id line", () => {
  const raw = `session-1\n${JSON.stringify(fixture)}`;
  assert.deepEqual(parseSessionExport(raw), fixture);
  assert.deepEqual(parseSessionExport(JSON.stringify(fixture)), fixture);
  assert.throws(() => parseSessionExport("not json"), /invalid session export/);
});

test("summarizes messages, tools, durations, errors and token peaks", () => {
  const result = summarizeSession(fixture);
  assert.equal(result.messages, 5);
  assert.equal(result.tools, 5);
  assert.deepEqual(result.byType, { user: 1, assistant: 3, synthetic: 1 });
  assert.deepEqual(result.byName, { shell: 1, read: 4 });
  assert.deepEqual(result.byStatus, { completed: 4, error: 1 });
  assert.equal(result.toolMs, 2_400);
  assert.equal(result.toolMinutes, 0);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].id, "t2");
  assert.equal(result.tokenPeaks[0].input, 1_500);
  assert.equal(result.slowest[0].id, "t1");
});

test("detects repeated same-tool runs", () => {
  const result = summarizeSession(fixture);
  assert.ok(result.repeats.some((entry) => entry.name === "read" && entry.count === 4));
});

test("filters messages and tools by epoch milliseconds", () => {
  const result = summarizeSession(fixture, { since: 300 });
  assert.equal(result.segmentStart, 300);
  assert.equal(result.messages, 3);
  assert.equal(result.tools, 3);
  assert.equal(result.byName.shell, undefined);
  assert.equal(result.byName.read, 3);
  assert.equal(result.errors.length, 0);
});
