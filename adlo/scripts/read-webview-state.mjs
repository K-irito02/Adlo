#!/usr/bin/env node
/**
 * 只读读取桌面壳 WebView2 的 localStorage（LevelDB + Snappy）。
 *
 * 为什么需要：UI 偏好与按工作区隔离的视图状态（`adl:*` 键）只存在 WebView2 的
 * localStorage 里；排障时靠肉眼翻 `leveldb` 二进制代价很高。本脚本直接解码
 * `Default/Local Storage/leveldb` 下的 `.ldb`（SSTable）与 `.log`（WAL）记录。
 *
 * 用法：
 *   node adlo/scripts/read-webview-state.mjs --list
 *   node adlo/scripts/read-webview-state.mjs --key adl:changes.activeWorkspaceTab
 *   node adlo/scripts/read-webview-state.mjs --identifier com.adlo.app.slot-2 --key adl-git-vis:time-range
 *   node adlo/scripts/read-webview-state.mjs --profile "%LOCALAPPDATA%\com.adlo.app\EBWebView" --list
 *
 * 只读：脚本不写任何文件，也不启动应用。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_IDENTIFIER = "com.adlo.app";

/** Snappy 解压（块内压缩；LevelDB 数据块 type=1 使用）。 */
export function snappyDecompress(input) {
  let pos = 0;
  let uncompressedLength = 0;
  let shift = 0;
  while (pos < input.length) {
    const byte = input[pos++];
    uncompressedLength |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      break;
    }
    shift += 7;
  }
  const out = Buffer.alloc(uncompressedLength);
  let outPos = 0;
  while (pos < input.length) {
    const tag = input[pos++];
    const type = tag & 3;
    if (type === 0) {
      let length = tag >> 2;
      if (length < 60) {
        length += 1;
      } else {
        const extraBytes = length - 59;
        let value = 0;
        for (let i = 0; i < extraBytes; i += 1) {
          value |= input[pos + i] << (8 * i);
        }
        pos += extraBytes;
        length = value + 1;
      }
      input.copy(out, outPos, pos, pos + length);
      pos += length;
      outPos += length;
    } else if (type === 1) {
      const length = ((tag >> 2) & 0x7) + 4;
      const offset = ((tag & 0xe0) << 3) | input[pos++];
      for (let i = 0; i < length; i += 1) {
        out[outPos + i] = out[outPos - offset + i];
      }
      outPos += length;
    } else if (type === 2) {
      const length = (tag >> 2) + 1;
      const offset = input[pos] | (input[pos + 1] << 8);
      pos += 2;
      for (let i = 0; i < length; i += 1) {
        out[outPos + i] = out[outPos - offset + i];
      }
      outPos += length;
    } else {
      const length = (tag >> 2) + 1;
      const offset =
        input[pos] | (input[pos + 1] << 8) | (input[pos + 2] << 16) | (input[pos + 3] << 24);
      pos += 4;
      for (let i = 0; i < length; i += 1) {
        out[outPos + i] = out[outPos - offset + i];
      }
      outPos += length;
    }
  }
  return out.subarray(0, outPos);
}

function readVarint(buffer, cursor) {
  let result = 0n;
  let shift = 0n;
  while (cursor.pos < buffer.length) {
    const byte = buffer[cursor.pos++];
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      break;
    }
    shift += 7n;
  }
  return Number(result);
}

/** 解析一个 LevelDB block 的 prefix-compressed 条目（不含 restart 数组）。 */
export function parseBlockEntries(block) {
  const entries = [];
  if (block.length < 4) {
    return entries;
  }
  const cursor = { pos: 0 };
  const restartCount = block.readUInt32LE(block.length - 4);
  const restartsStart = block.length - 4 - restartCount * 4;
  if (restartsStart < 0) {
    return entries;
  }
  let previousKey = Buffer.alloc(0);
  while (cursor.pos < restartsStart) {
    const shared = readVarint(block, cursor);
    const nonShared = readVarint(block, cursor);
    const valueLength = readVarint(block, cursor);
    const keyDelta = block.subarray(cursor.pos, cursor.pos + nonShared);
    cursor.pos += nonShared;
    const key = Buffer.concat([previousKey.subarray(0, shared), keyDelta]);
    const value = block.subarray(cursor.pos, cursor.pos + valueLength);
    cursor.pos += valueLength;
    previousKey = key;
    entries.push({ key, value });
  }
  return entries;
}

/**
 * localStorage 内部键：`_<origin>\x00[<版本字节>]<key>`；元数据键（`META:`）返回 null。
 * 当前 Chromium 会在分隔符后写一个版本字节（实测为 0x01），需剥掉。
 */
export function decodeStorageKey(rawKey) {
  if (rawKey.startsWith("META:")) {
    return null;
  }
  const separator = rawKey.indexOf("\u0000");
  if (!rawKey.startsWith("_") || separator === -1) {
    return null;
  }
  const rest = rawKey.slice(separator + 1);
  const versioned = rest.startsWith("\u0000") || rest.startsWith("\u0001");
  return { origin: rawKey.slice(1, separator), key: versioned ? rest.slice(1) : rest };
}

/** localStorage 值编码：首字节 0x00 = UTF-16LE，0x01 = Latin-1。 */
export function decodeStorageValue(value) {
  if (value.length === 0) {
    return "";
  }
  if (value[0] === 0) {
    return Buffer.from(value.subarray(1)).toString("utf16le");
  }
  if (value[0] === 1) {
    return value.subarray(1).toString("latin1");
  }
  return value.toString("latin1");
}

const LOG_BLOCK_SIZE = 32768;
const LOG_HEADER_SIZE = 7;

/** 组装 LevelDB WAL 的逻辑记录（跨块的 FIRST/MIDDLE/LAST 片段）。 */
export function decodeLogRecords(buffer) {
  const records = [];
  let pending = [];
  let offset = 0;
  while (offset + LOG_HEADER_SIZE <= buffer.length) {
    const blockRemainder = LOG_BLOCK_SIZE - (offset % LOG_BLOCK_SIZE);
    if (blockRemainder < LOG_HEADER_SIZE) {
      offset += blockRemainder;
      continue;
    }
    const recordLength = buffer.readUInt16LE(offset + 4);
    const recordType = buffer[offset + 6];
    // type 0 为块尾补齐（全是零），整段跳过。
    if (recordType === 0) {
      offset += blockRemainder;
      continue;
    }
    const dataStart = offset + LOG_HEADER_SIZE;
    const dataEnd = dataStart + recordLength;
    if (recordLength === 0 || dataEnd > buffer.length) {
      break;
    }
    const fragment = buffer.subarray(dataStart, dataEnd);
    if (recordType === 1) {
      records.push(fragment);
      pending = [];
    } else if (recordType === 2) {
      pending = [fragment];
    } else if (recordType === 3) {
      pending.push(fragment);
    } else if (recordType === 4) {
      pending.push(fragment);
      records.push(Buffer.concat(pending));
      pending = [];
    }
    offset = dataEnd;
  }
  return records;
}

/** 解码 WAL 里的 WriteBatch：返回 [{ seq, key, value }]（删除的 value 为 null）。 */
export function decodeWriteBatch(record) {
  if (record.length < 12) {
    return [];
  }
  const sequence = Number(record.readBigUInt64LE(0));
  const count = record.readUInt32LE(8);
  const cursor = { pos: 12 };
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    if (cursor.pos >= record.length) {
      break;
    }
    const tag = record[cursor.pos++];
    const keyLength = readVarint(record, cursor);
    const key = record.subarray(cursor.pos, cursor.pos + keyLength);
    cursor.pos += keyLength;
    if (tag === 1) {
      const valueLength = readVarint(record, cursor);
      const value = record.subarray(cursor.pos, cursor.pos + valueLength);
      cursor.pos += valueLength;
      entries.push({ seq: sequence + index, key, value });
    } else {
      entries.push({ seq: sequence + index, key, value: null });
    }
  }
  return entries;
}

function readBlock(fileBuffer, handle) {
  const slice = fileBuffer.subarray(handle.offset, handle.offset + handle.size);
  const compression = fileBuffer[handle.offset + handle.size];
  return compression === 1 ? snappyDecompress(slice) : slice;
}

/** 解析一个 `.ldb`（SSTable），返回 [{ seq, key, value }]。 */
export function decodeSstable(fileBuffer) {
  if (fileBuffer.length < 48) {
    return [];
  }
  const footer = fileBuffer.subarray(fileBuffer.length - 48);
  const cursor = { pos: 0 };
  readVarint(footer, cursor); // metaindex offset
  readVarint(footer, cursor); // metaindex size
  const indexHandle = { offset: readVarint(footer, cursor), size: 0 };
  indexHandle.size = readVarint(footer, cursor);

  const entries = [];
  for (const indexEntry of parseBlockEntries(readBlock(fileBuffer, indexHandle))) {
    const handleCursor = { pos: 0 };
    const handle = { offset: readVarint(indexEntry.value, handleCursor), size: 0 };
    handle.size = readVarint(indexEntry.value, handleCursor);
    for (const entry of parseBlockEntries(readBlock(fileBuffer, handle))) {
      // 内部键末尾 8 字节是 (seq << 8 | type)
      const seq = Number(entry.key.readBigUInt64LE(entry.key.length - 8) >> 8n);
      entries.push({ seq, key: entry.key.subarray(0, entry.key.length - 8), value: entry.value });
    }
  }
  return entries;
}

/** 读取一个 leveldb 目录，返回按写入顺序去重后的 localStorage 条目。 */
export function readLocalStorage(leveldbDir) {
  const latest = new Map();
  const files = fs
    .readdirSync(leveldbDir)
    .filter((name) => name.endsWith(".ldb") || name.endsWith(".log"))
    .sort();

  for (const name of files) {
    const fileBuffer = fs.readFileSync(path.join(leveldbDir, name));
    const rawEntries = name.endsWith(".ldb")
      ? decodeSstable(fileBuffer)
      : decodeLogRecords(fileBuffer).flatMap((record) => decodeWriteBatch(record));
    for (const entry of rawEntries) {
      const storageKey = decodeStorageKey(entry.key.toString("latin1"));
      if (!storageKey) {
        continue;
      }
      const id = `${storageKey.origin}\u0000${storageKey.key}`;
      const previous = latest.get(id);
      if (!previous || previous.seq <= entry.seq) {
        latest.set(id, {
          seq: entry.seq,
          origin: storageKey.origin,
          key: storageKey.key,
          value: entry.value === null ? null : decodeStorageValue(entry.value),
        });
      }
    }
  }

  return [...latest.values()]
    .sort((a, b) => a.origin.localeCompare(b.origin) || a.key.localeCompare(b.key))
    .map(({ origin, key, value }) => ({ origin, key, value }));
}

/** 解析 CLI 参数；纯函数，供单测覆盖。 */
export function parseArgs(argv) {
  const options = {
    identifier: DEFAULT_IDENTIFIER,
    profile: "",
    keys: [],
    origin: "",
    list: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) {
        throw new Error(`missing value for ${arg}`);
      }
      return argv[index];
    };
    if (arg === "--identifier") {
      options.identifier = next();
    } else if (arg === "--profile") {
      options.profile = next();
    } else if (arg === "--key") {
      options.keys.push(next());
    } else if (arg === "--origin") {
      options.origin = next();
    } else if (arg === "--list") {
      options.list = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

/** `--profile` 可指向 WebView2 用户数据目录或其中的 `leveldb` 目录。 */
export function resolveLeveldbDir({ profile, identifier }) {
  const base =
    profile ||
    path.join(
      process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
      identifier,
      "EBWebView",
    );
  return path.basename(base) === "leveldb"
    ? base
    : path.join(base, "Default", "Local Storage", "leveldb");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const leveldbDir = resolveLeveldbDir(options);
  if (!fs.existsSync(leveldbDir)) {
    console.error(`[webview-state] leveldb not found: ${leveldbDir}`);
    console.error(
      "提示：--identifier 用应用标识（如 com.adlo.app.slot-2），或 --profile 指向 EBWebView",
    );
    process.exit(2);
  }

  let entries = readLocalStorage(leveldbDir);
  if (options.origin) {
    entries = entries.filter((entry) => entry.origin === options.origin);
  }
  if (options.keys.length > 0) {
    entries = entries.filter((entry) => options.keys.includes(entry.key));
  }

  const output = {
    leveldb: leveldbDir,
    entries: options.list ? entries.map(({ origin, key }) => ({ origin, key })) : entries,
  };
  console.log(JSON.stringify(output, null, 2));
  if (!options.list && options.keys.length > 0) {
    const found = new Set(entries.map((entry) => entry.key));
    const missing = options.keys.filter((key) => !found.has(key));
    if (missing.length > 0) {
      console.error(`[webview-state] missing keys: ${missing.join(", ")}`);
      process.exit(1);
    }
  }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(`[webview-state] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
