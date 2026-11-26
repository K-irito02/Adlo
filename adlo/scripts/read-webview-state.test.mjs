#!/usr/bin/env node
/**
 * `read-webview-state.mjs` 的纯函数单测（pre-commit 会跑 `node --test scripts/*.test.mjs`）。
 * 只覆盖解码与参数解析，不读真实 WebView2 目录。
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decodeLogRecords,
  decodeSstable,
  decodeStorageKey,
  decodeStorageValue,
  decodeWriteBatch,
  parseArgs,
  parseBlockEntries,
  resolveLeveldbDir,
  snappyDecompress,
} from "./read-webview-state.mjs";

/** 构造一个只含 prefix-compressed 条目的 LevelDB block（shared 恒为 0）。 */
function buildBlock(entries) {
  const parts = [];
  for (const { key, value } of entries) {
    parts.push(Buffer.from([0, key.length, value.length]), key, value);
  }
  const restarts = Buffer.alloc(8);
  restarts.writeUInt32LE(0, 0);
  restarts.writeUInt32LE(1, 4);
  return Buffer.concat([...parts, restarts]);
}

function buildLogRecord(payload, type = 1) {
  const header = Buffer.alloc(7);
  header.writeUInt16LE(payload.length, 4);
  header[6] = type;
  return Buffer.concat([header, payload]);
}

describe("snappyDecompress", () => {
  it("decompresses a literal-only stream", () => {
    const payload = Buffer.from("hello");
    const stream = Buffer.concat([
      Buffer.from([payload.length, (payload.length - 1) << 2]),
      payload,
    ]);
    assert.equal(snappyDecompress(stream).toString("utf8"), "hello");
  });
});

describe("parseBlockEntries", () => {
  it("reads keys and values from a block with a restart array", () => {
    const block = buildBlock([{ key: Buffer.from("alpha"), value: Buffer.from("1") }]);
    const entries = parseBlockEntries(block);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].key.toString(), "alpha");
    assert.equal(entries[0].value.toString(), "1");
  });

  it("returns nothing for a truncated block", () => {
    assert.deepEqual(parseBlockEntries(Buffer.from([1, 2])), []);
  });
});

describe("decodeStorageKey", () => {
  it("splits origin and key at the NUL separator", () => {
    assert.deepEqual(
      decodeStorageKey("_http://127.0.0.1:5175\u0000adl:changes.activeWorkspaceTab"),
      {
        origin: "http://127.0.0.1:5175",
        key: "adl:changes.activeWorkspaceTab",
      },
    );
  });

  it("drops the version byte Chromium writes after the separator", () => {
    assert.deepEqual(decodeStorageKey("_http://127.0.0.1:5175\u0000\u0001adl-git-vis:time-range"), {
      origin: "http://127.0.0.1:5175",
      key: "adl-git-vis:time-range",
    });
  });

  it("ignores metadata and malformed keys", () => {
    assert.equal(decodeStorageKey("META:http://127.0.0.1:5175"), null);
    assert.equal(decodeStorageKey("adl:changes.showGitVisualization"), null);
  });
});

describe("decodeStorageValue", () => {
  it("decodes UTF-16LE and Latin-1 encoded values", () => {
    const utf16 = Buffer.concat([Buffer.from([0]), Buffer.from('"dark"', "utf16le")]);
    assert.equal(decodeStorageValue(utf16), '"dark"');
    const latin1 = Buffer.concat([Buffer.from([1]), Buffer.from('"light"', "latin1")]);
    assert.equal(decodeStorageValue(latin1), '"light"');
  });
});

describe("decodeWriteBatch", () => {
  it("reads put and delete entries with increasing sequence numbers", () => {
    const key = Buffer.from("_http://x\u0000adl:a");
    const batch = Buffer.alloc(12);
    batch.writeBigUInt64LE(7n, 0);
    batch.writeUInt32LE(2, 8);
    const record = Buffer.concat([
      batch,
      Buffer.from([1, key.length]),
      key,
      Buffer.from([1, 0x79]), // value length 1, "y"
      Buffer.from([0, key.length]),
      key,
    ]);
    const entries = decodeWriteBatch(record);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].seq, 7);
    assert.equal(entries[0].value.toString(), "y");
    assert.equal(entries[1].seq, 8);
    assert.equal(entries[1].value, null);
  });
});

describe("decodeLogRecords", () => {
  it("returns a FULL record payload", () => {
    const payload = Buffer.from("batch-bytes");
    const records = decodeLogRecords(buildLogRecord(payload));
    assert.equal(records.length, 1);
    assert.equal(records[0].toString(), "batch-bytes");
  });

  it("stops cleanly on a truncated header", () => {
    assert.deepEqual(decodeLogRecords(Buffer.alloc(3)), []);
  });
});

describe("decodeSstable", () => {
  it("returns nothing for a file shorter than the footer", () => {
    assert.deepEqual(decodeSstable(Buffer.alloc(10)), []);
  });
});

describe("parseArgs / resolveLeveldbDir", () => {
  it("collects repeated --key filters and flags", () => {
    const options = parseArgs([
      "--list",
      "--key",
      "a",
      "--key",
      "b",
      "--identifier",
      "com.adlo.app.x",
    ]);
    assert.deepEqual(options.keys, ["a", "b"]);
    assert.equal(options.list, true);
    assert.equal(options.identifier, "com.adlo.app.x");
  });

  it("rejects unknown flags", () => {
    assert.throws(() => parseArgs(["--nope"]), /unknown argument/);
  });

  it("appends the Default\\Local Storage\\leveldb path for a WebView2 root", () => {
    const resolved = resolveLeveldbDir({ profile: "/tmp/profile/EBWebView", identifier: "x" });
    assert.match(resolved, /EBWebView[\\/]Default[\\/]Local Storage[\\/]leveldb$/);
  });

  it("accepts a leveldb directory as-is", () => {
    const resolved = resolveLeveldbDir({ profile: "/tmp/profile/leveldb", identifier: "x" });
    assert.equal(resolved.split(/[\\/]/).pop(), "leveldb");
    assert.ok(!resolved.includes("Default"));
  });
});
