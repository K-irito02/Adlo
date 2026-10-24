import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const glossaryPath = path.resolve(here, '../../../GLOSSARY.md');

const IMPLEMENTATION_TOKEN = /`[^`]*(\/|\\|::|\.(?:rs|ts|tsx|js|jsx|css|json|toml|sql)\b)[^`]*`/;
const NUMERIC_COUNT = /\d+\s*个/;

function fail(messages: string[]): never {
  console.log(`GLOSSARY.md check failed (${messages.length} problem(s)):`);
  for (const message of messages) {
    console.log(`  - ${message}`);
  }
  process.exit(1);
}

if (!fs.existsSync(glossaryPath)) {
  fail([`missing file: ${glossaryPath}`]);
}

const lines = fs.readFileSync(glossaryPath, 'utf8').split(/\r?\n/);
const problems: string[] = [];
let termCount = 0;

lines.forEach((line, index) => {
  if (!/^\*\*[^*]+\*\*:/.test(line)) {
    return;
  }
  termCount += 1;
  const term = line.replace(/^\*\*([^*]+)\*\*:.*$/, '$1');

  let hasAvoid = false;
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const entryLine = lines[cursor];
    if (entryLine.trim() === '') {
      break;
    }
    if (entryLine.startsWith('_Avoid_:')) {
      hasAvoid = true;
      break;
    }
  }
  if (!hasAvoid) {
    problems.push(`line ${index + 1} "${term}": missing _Avoid_ line`);
  }
});

lines.forEach((line, index) => {
  if (IMPLEMENTATION_TOKEN.test(line)) {
    problems.push(`line ${index + 1}: implementation detail (path/file token) in glossary`);
  }
  if (NUMERIC_COUNT.test(line)) {
    problems.push(`line ${index + 1}: stale-prone numeric count in glossary`);
  }
});

if (termCount === 0) {
  problems.push('no term entries found');
}

if (problems.length > 0) {
  fail(problems);
}

console.log(`GLOSSARY.md OK (${termCount} terms, all with _Avoid_)`);
