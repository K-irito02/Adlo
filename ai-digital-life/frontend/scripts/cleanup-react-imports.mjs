import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const srcDir = join(import.meta.dirname, '..', 'src');

function findTsxFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTsxFiles(full));
    } else if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) {
      results.push(full);
    }
  }
  return results;
}

const files = findTsxFiles(srcDir);

const REACT_APIS = [
  'React.useState',
  'React.useEffect',
  'React.useRef',
  'React.useCallback',
  'React.useMemo',
  'React.useReducer',
  'React.useContext',
  'React.useLayoutEffect',
  'React.useDebugValue',
  'React.useImperativeHandle',
  'React.useId',
  'React.useTransition',
  'React.useDeferredValue',
  'React.useSyncExternalStore',
  'React.useInsertionEffect',
  'React.memo',
  'React.Fragment',
  'React.forwardRef',
  'React.lazy',
  'React.Suspense',
  'React.StrictMode',
  'React.Component',
  'React.PureComponent',
  'React.createElement',
  'React.createRef',
  'React.createContext',
  'React.Children',
  'React.cloneElement',
  'React.isValidElement',
  'React.startTransition',
  'React.cache',
  'React.Profiler',
  'React.unstable_',
  'React.version',
  'React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED',
  'ReactNode',
  'ReactElement',
  'ReactPortal',
  'ReactFragment',
  'React.ReactNode',
  'React.ReactElement',
  'React.FC',
  'React.ReactPortal',
];

const importOnlyReact = /^import\s+React\s+from\s+['"]react['"];?\s*$/m;
const importTypeOnlyReact = /^import\s+type\s+React\s+from\s+['"]react['"];?\s*$/m;
const importReactWithNamed = /^import\s+React\s*,\s*\{/m;

function usesReactAPI(content) {
  for (const api of REACT_APIS) {
    if (content.includes(api)) return true;
  }
  return false;
}

let removed = 0;
const affected = [];

for (const file of files) {
  const original = readFileSync(file, 'utf-8');
  let content = original;
  const rel = relative(srcDir, file);

  if (importOnlyReact.test(content) && !usesReactAPI(content)) {
    content = content.replace(importOnlyReact, '');
  } else if (importTypeOnlyReact.test(content) && !usesReactAPI(content)) {
    content = content.replace(importTypeOnlyReact, '');
  } else if (importReactWithNamed.test(content) && !usesReactAPI(content)) {
    content = content.replace(/^import\s+React\s*,\s*/m, 'import ');
  } else {
    continue;
  }

  if (content !== original) {
    const cleaned = content.replace(/^\s*[\r\n]+/gm, '\n').replace(/^\n+/, '');
    writeFileSync(file, cleaned, 'utf-8');
    removed++;
    affected.push(rel);
    console.log(`  ${rel}`);
  }
}

console.log(`\nTotal: ${removed} files cleaned.`);
