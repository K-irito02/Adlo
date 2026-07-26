export interface MappingRule {
  path: string;
  module: string;
  type: 'glob';
  override?: boolean;
}

export interface ModuleMappingOptions {
  enableOtherBucket: boolean;
  unmappedStrategy: 'keep_original';
}

export interface ModuleMappingConfig {
  version: number;
  rules: MappingRule[];
  options: ModuleMappingOptions;
}

export interface DirectoryEntry {
  path: string;
  depth: number;
  commitCount: number;
}

export const DEFAULT_MAPPING_OPTIONS: ModuleMappingOptions = {
  enableOtherBucket: false,
  unmappedStrategy: 'keep_original',
};

export const MODULE_MAPPING_FILENAME = 'module-mapping.json';
