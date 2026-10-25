import test from "node:test";
import assert from "node:assert/strict";
import { waitForOwnDevServer } from "./run-project-surface.mjs";

const noSleep = async () => {};

function response(body, ok = true) {
  return { ok, text: async () => body };
}

// 令牌握手的核心契约：只有「本工作树自己的 vite」应答才算就绪；
// 同端口上别人的 dev server 必须被拒绝（这正是 2026-10-25「窗口渲染别人前端」的防线）。
test("resolves once the served token matches ours", async () => {
  const vite = { exitCode: null, signalCode: null };
  let firstAttempt = true;
  await waitForOwnDevServer("http://127.0.0.1:5174", "tok-1", vite, 30_000, {
    fetchImpl: async () => {
      if (firstAttempt) {
        firstAttempt = false;
        throw new Error("ECONNREFUSED");
      }
      return response("tok-1");
    },
    sleep: noSleep,
  });

});

test("rejects a different dev server on the same port", async () => {
  const vite = { exitCode: null, signalCode: null };
  await assert.rejects(
    waitForOwnDevServer("http://127.0.0.1:5174", "tok-1", vite, 30_000, {
      fetchImpl: async () => response("tok-other"),
      sleep: noSleep,
    }),
    /different dev server \(instance token mismatch\)/,
  );
});

test("rejects as soon as our vite exits", async () => {
  const vite = { exitCode: 1, signalCode: null };
  await assert.rejects(
    waitForOwnDevServer("http://127.0.0.1:5174", "tok-1", vite, 30_000, {
      fetchImpl: async () => {
        throw new Error("should not be called");
      },
      sleep: noSleep,
    }),
    /exited \(code 1\)/,
  );
});

test("rejects when our vite is killed by a signal", async () => {
  const vite = { exitCode: null, signalCode: "SIGTERM" };
  await assert.rejects(
    waitForOwnDevServer("http://127.0.0.1:5174", "tok-1", vite, 30_000, {
      fetchImpl: async () => {
        throw new Error("should not be called");
      },
      sleep: noSleep,
    }),
    /signal SIGTERM/,
  );
});

test("times out when nothing ever answers", async () => {
  const vite = { exitCode: null, signalCode: null };
  let clock = 0;
  await assert.rejects(
    waitForOwnDevServer("http://127.0.0.1:5174", "tok-1", vite, 500, {
      fetchImpl: async () => {
        throw new Error("ECONNREFUSED");
      },
      now: () => {
        clock += 400;
        return clock;
      },
      sleep: noSleep,
    }),
    /Timed out waiting/,
  );
});
