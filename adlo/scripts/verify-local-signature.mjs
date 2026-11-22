#!/usr/bin/env node
/**
 * 本地验证 Tauri 更新签名（不发布、不读线上清单）。
 *
 * 用安装包字节 + `tauri.conf.json` 内置公钥 + `.sig` 做三方校验，算法与
 * `tauri-plugin-updater` 下载后一致。输出大小、SHA-256、keyId、trusted comment
 * 与 `SIGNATURE_OK=true|false`，失败退出 1。
 *
 * 用法：
 *   node adlo/scripts/verify-local-signature.mjs [版本]
 *   # 版本缺省取 tauri.conf.json 的 version
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ADLO_ROOT = path.resolve(HERE, "..");
const TAURI_CONF = path.join(ADLO_ROOT, "src-tauri", "tauri.conf.json");

function fail(message) {
  console.error(`[verify-local-signature] ${message}`);
  process.exit(1);
}

const conf = JSON.parse(fs.readFileSync(TAURI_CONF, "utf8"));
const version = process.argv[2] ?? conf.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  fail(`invalid version: ${version}`);
}

const exe = path.join(
  ADLO_ROOT,
  "target",
  "release",
  "bundle",
  "nsis",
  `Adlo_${version}_x64-setup.exe`,
);
const sigPath = `${exe}.sig`;
if (!fs.existsSync(exe)) {
  fail(`installer not found: ${path.relative(process.cwd(), exe)}`);
}
if (!fs.existsSync(sigPath)) {
  fail(`signature not found: ${path.relative(process.cwd(), sigPath)}`);
}

const pubkey = conf.plugins?.updater?.pubkey;
if (!pubkey) {
  fail("plugins.updater.pubkey missing in tauri.conf.json");
}

const pubBytes = Buffer.from(
  Buffer.from(pubkey, "base64").toString("utf8").trim().split(/\r?\n/)[1],
  "base64",
);
const block = Buffer.from(fs.readFileSync(sigPath, "utf8").trim(), "base64")
  .toString("utf8")
  .split(/\r?\n/);
const sig = Buffer.from(block[1] ?? "", "base64");
if (sig.length < 10) {
  fail("malformed .sig payload");
}
const alg = sig.subarray(0, 2).toString();
const keyId = (buffer) => buffer.subarray(2, 10).toString("hex");
if (keyId(sig) !== keyId(pubBytes)) {
  fail("key id mismatch: signature private key and built-in public key are not a pair");
}

const bytes = fs.readFileSync(exe);
const data = alg === "ED" ? crypto.createHash("blake2b512").update(bytes).digest() : bytes;
const der = Buffer.concat([
  Buffer.from("302a300506032b6570032100", "hex"),
  pubBytes.subarray(10, 42),
]);
const key = crypto.createPublicKey({ key: der, format: "der", type: "spki" });
const ok = crypto.verify(null, data, key, sig.subarray(10));

console.log(`file: ${path.relative(process.cwd(), exe)}`);
console.log(`bytes: ${bytes.length}`);
console.log(`sha256: ${crypto.createHash("sha256").update(bytes).digest("hex")}`);
console.log(`alg: ${alg}`);
console.log(`keyId: ${keyId(sig)}`);
console.log(`trusted: ${block[2] ?? ""}`);
console.log(`SIGNATURE_OK= ${ok}`);
if (!ok) {
  process.exit(1);
}
