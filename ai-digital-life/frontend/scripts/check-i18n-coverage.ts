import { zhCN } from '../src/app/i18n/zh-CN/index';
import { enUS } from '../src/app/i18n/en-US/index';

function flattenKeys(obj: object, prefix = ''): Set<string> {
  const keys = new Set<string>();
  for (const [key, value] of Object.entries(obj)) {
    const dottedKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const nested = flattenKeys(value, dottedKey);
      for (const k of nested) {
        keys.add(k);
      }
    } else {
      keys.add(dottedKey);
    }
  }
  return keys;
}

const zhKeys = flattenKeys(zhCN);
const enKeys = flattenKeys(enUS);

const missingInEn = [...zhKeys].filter((k) => !enKeys.has(k));
const missingInZh = [...enKeys].filter((k) => !zhKeys.has(k));

const exitCode = missingInEn.length === 0 && missingInZh.length === 0 ? 0 : 1;

if (exitCode === 0) {
  console.log(`✅ zh-CN (${zhKeys.size} keys) 与 en-US (${enKeys.size} keys) 完全一致`);
} else {
  console.log(`❌ zh-CN (${zhKeys.size} keys) 与 en-US (${enKeys.size} keys) 存在差异`);
  if (missingInEn.length > 0) {
    console.log(`\n缺失于 en-US (${missingInEn.length}):`);
    for (const key of missingInEn) {
      console.log(`  - ${key}`);
    }
  }
  if (missingInZh.length > 0) {
    console.log(`\n缺失于 zh-CN (${missingInZh.length}):`);
    for (const key of missingInZh) {
      console.log(`  - ${key}`);
    }
  }
}

process.exit(exitCode);
