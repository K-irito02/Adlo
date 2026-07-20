import type { CommandConfig, CommandHint } from '@shared/ipc';
import type { StoreState } from '../StoreState';

export interface CustomCommandSlice {
  builtinCommands: CommandConfig[];
  customCommands: CommandConfig[];
  isFetchingCommands: boolean;

  setCustomCommands: (commands: CommandConfig[]) => void;
  setFetchingCommands: (fetching: boolean) => void;
}

export const initialBuiltinCommands: CommandConfig[] = [
  {
    name: 'plan',
    description: 'Plan mode (read-only analysis)',
    agent: 'plan',
    model: null,
    template: '$ARGUMENTS',
    subtask: false,
    hints: [] as CommandHint[],
  },
  {
    name: 'edit',
    description: 'Edit code',
    agent: 'build',
    model: null,
    template: '$ARGUMENTS',
    subtask: false,
    hints: [] as CommandHint[],
  },
  {
    name: 'fix',
    description: 'Fix a bug',
    agent: 'build',
    model: null,
    template: 'Fix the following bug: $ARGUMENTS',
    subtask: false,
    hints: [] as CommandHint[],
  },
  {
    name: 'explain',
    description: 'Explain code',
    agent: 'build',
    model: null,
    template: 'Explain the following: $ARGUMENTS',
    subtask: false,
    hints: [] as CommandHint[],
  },
  {
    name: 'test',
    description: 'Write tests',
    agent: 'build',
    model: null,
    template: 'Write tests for: $ARGUMENTS',
    subtask: false,
    hints: [] as CommandHint[],
  },
  {
    name: 'review',
    description: 'Code review',
    agent: 'build',
    model: null,
    template: 'Review the following: $ARGUMENTS',
    subtask: false,
    hints: [] as CommandHint[],
  },
];

export const createCustomCommandSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): CustomCommandSlice => ({
  builtinCommands: initialBuiltinCommands,
  customCommands: [],
  isFetchingCommands: false,

  setCustomCommands: (commands) => set({ customCommands: commands }),
  setFetchingCommands: (fetching) => set({ isFetchingCommands: fetching }),
});
