import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

const stateCache = new Map<string, { state: EditorState; timestamp: number }>();
const STATE_CACHE_MAX_SIZE = 20;
const STATE_CACHE_TTL = 5 * 60 * 1000;

function pruneStateCache() {
  const now = Date.now();
  for (const [key, entry] of stateCache) {
    if (now - entry.timestamp > STATE_CACHE_TTL) {
      stateCache.delete(key);
    }
  }
  if (stateCache.size > STATE_CACHE_MAX_SIZE) {
    const entries = [...stateCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = entries.slice(0, entries.length - STATE_CACHE_MAX_SIZE);
    for (const [key] of toRemove) {
      stateCache.delete(key);
    }
  }
}

export function saveEditorState(filePath: string, view: EditorView | null) {
  if (!view || !filePath) return;
  pruneStateCache();
  stateCache.set(filePath, { state: view.state, timestamp: Date.now() });
}

export function getSavedEditorState(filePath: string): EditorState | null {
  const entry = stateCache.get(filePath);
  if (!entry) return null;
  entry.timestamp = Date.now();
  return entry.state;
}

export function clearEditorStateCache(filePath?: string) {
  if (filePath) {
    stateCache.delete(filePath);
  } else {
    stateCache.clear();
  }
}
