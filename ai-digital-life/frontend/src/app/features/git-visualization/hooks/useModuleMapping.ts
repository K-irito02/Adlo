import { useCallback, useEffect, useState } from 'react';
import type { MappingRule, ModuleMappingConfig } from '../types/module-mapping';
import { DEFAULT_MAPPING_OPTIONS, MODULE_MAPPING_FILENAME } from '../types/module-mapping';

interface UseModuleMappingResult {
  rules: MappingRule[];
  saveRules: (rules: MappingRule[]) => Promise<void>;
  resetToDefault: () => Promise<void>;
  isLoading: boolean;
  error: Error | null;
}

const MAPPING_RELATIVE_PATH = `.git-vis/${MODULE_MAPPING_FILENAME}`;

async function readMappingConfig(activeWorkspaceTab: string): Promise<ModuleMappingConfig | null> {
  try {
    const workspace = window.digitalLife?.workspace;
    if (!workspace) return null;
    const result = await workspace.readFileForWorkspace(activeWorkspaceTab, MAPPING_RELATIVE_PATH);
    if (!result.ok || !result.data?.content) return null;
    return JSON.parse(result.data.content);
  } catch {
    return null;
  }
}

async function writeMappingConfig(activeWorkspaceTab: string, config: ModuleMappingConfig): Promise<void> {
  const content = JSON.stringify(config, null, 2);
  const workspace = window.digitalLife?.workspace;
  if (!workspace) return;
  await workspace.writeFile(MAPPING_RELATIVE_PATH, content);
}

export function useModuleMapping(activeWorkspaceTab: string): UseModuleMappingResult {
  const [rules, setRules] = useState<MappingRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setIsLoading(true);
        setError(null);
        const config = await readMappingConfig(activeWorkspaceTab);
        if (!cancelled) {
          setRules(config?.rules ?? []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error(String(e)));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [activeWorkspaceTab]);

  const saveRules = useCallback(async (newRules: MappingRule[]) => {
    const config: ModuleMappingConfig = {
      version: 1,
      rules: newRules,
      options: DEFAULT_MAPPING_OPTIONS,
    };
    await writeMappingConfig(activeWorkspaceTab, config);
    setRules(newRules);
  }, [activeWorkspaceTab]);

  const resetToDefault = useCallback(async () => {
    setRules([]);
  }, []);

  return { rules, saveRules, resetToDefault, isLoading, error };
}
