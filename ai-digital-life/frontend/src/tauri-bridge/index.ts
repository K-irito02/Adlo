import { invoke } from '@tauri-apps/api/core';
import type { DigitalLifeBridge, PtyOutputEvent } from '../shared/ipc';
import type {
  DigitalLifeModelStreamEventV1,
  DigitalLifeRunActivityEventV1,
  DigitalLifeTerminalStreamEventV1,
} from '@ai-digital-life/kernel';
import { EventBuffer } from '../shared/eventBuffer';
import { subscribeChannel } from './tauri-shared';
import { createTauriAppBridge } from './tauri-app';
import { createTauriBrowserBridge } from './tauri-browser';
import { createTauriCommandBridge } from './tauri-command';
import { createTauriCommandsConfigBridge } from './tauri-commands-config';
import { createTauriCompactionBridge } from './tauri-compaction';
import { createTauriConversationBridge } from './tauri-conversation';
import { createTauriCustomAgentBridge } from './tauri-custom-agent';
import { createTauriDurableBridge } from './tauri-durable';
import { createTauriLspBridge } from './tauri-lsp';
import { createTauriMcpBridge } from './tauri-mcp';
import { createTauriPatchBridge } from './tauri-patch';
import { createTauriPermissionBridge } from './tauri-permission';
import { createTauriProviderBridge } from './tauri-provider';
import { createTauriPtyBridge } from './tauri-pty';
import { createTauriReferenceBridge } from './tauri-reference';
import { createTauriReservedBridge } from './tauri-reserved';
import { createTauriRetrievalBridge } from './tauri-retrieval';
import { createTauriRunActivityBridge } from './tauri-run-activity';
import { createTauriSessionForkBridge } from './tauri-session-fork';
import { createTauriSnapshotBridge } from './tauri-snapshot';
import { createTauriTaskBridge } from './tauri-task';
import { createTauriWebToolsBridge } from './tauri-web-tools';
import { createTauriWindowBridge } from './tauri-window';
import { createTauriWorkspaceBridge } from './tauri-workspace';
import { createTauriAgentBridge, createTauriSubagentBridge } from './tauri-agent';
import { createTauriGithubBridge } from './tauri-ci-github';

export function createTauriBridge(): DigitalLifeBridge {
  return {
    subscribeModelStream: (listener: (event: DigitalLifeModelStreamEventV1) => void) => {
      const buf = new EventBuffer<DigitalLifeModelStreamEventV1>();
      const channelSub = subscribeChannel<DigitalLifeModelStreamEventV1>(
        'digital-life://model-stream',
        (payload) => {
          buf.push(payload);
          buf.scheduleFlush((events) => {
            for (const event of events) {
              listener(event);
            }
          });
        }
      );
      return channelSub;
    },

    subscribeRunActivity: (listener: (event: DigitalLifeRunActivityEventV1) => void) =>
      subscribeChannel<DigitalLifeRunActivityEventV1>('digital-life://run-activity', listener),

    subscribeTerminalStream: (listener: (event: DigitalLifeTerminalStreamEventV1) => void) =>
      subscribeChannel<DigitalLifeTerminalStreamEventV1>(
        'digital-life://terminal-stream',
        listener
      ),

    subscribePtyOutput: (listener: (event: PtyOutputEvent) => void) =>
      subscribeChannel<PtyOutputEvent>('digital-life://pty-output', listener),

    setLogMode: async (target: 'terminal' | 'debug', mode: 'overwrite' | 'append' | 'multi') => {
      await invoke('app_set_log_mode', { target, mode });
    },

    window: createTauriWindowBridge(),
    app: createTauriAppBridge(),
    workspace: createTauriWorkspaceBridge(),
    retrieval: createTauriRetrievalBridge(),
    conversation: createTauriConversationBridge(),
    agent: createTauriAgentBridge(),
    subagent: createTauriSubagentBridge(),
    patch: createTauriPatchBridge(),
    command: createTauriCommandBridge(),
    pty: createTauriPtyBridge(),
    task: createTauriTaskBridge(),
    runActivity: createTauriRunActivityBridge(),
    browser: createTauriBrowserBridge(),
    github: createTauriGithubBridge(),
    mcp: createTauriMcpBridge(),
    provider: createTauriProviderBridge(),
    snapshot: createTauriSnapshotBridge(),
    webTools: createTauriWebToolsBridge(),
    commandsConfig: createTauriCommandsConfigBridge(),
    permission: createTauriPermissionBridge(),
    compaction: createTauriCompactionBridge(),
    sessionFork: createTauriSessionForkBridge(),
    lsp: createTauriLspBridge(),
    reference: createTauriReferenceBridge(),
    durable: createTauriDurableBridge(),
    reserved: createTauriReservedBridge(),
    customAgent: createTauriCustomAgentBridge(),
  };
}

export { isTauriShell } from './tauri-shared';
