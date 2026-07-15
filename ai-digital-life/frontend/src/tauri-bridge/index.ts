import { invoke } from '@tauri-apps/api/core';
import type { DigitalLifeBridge, PtyOutputEvent } from '../shared/ipc';
import type {
  DigitalLifeModelStreamEventV1,
  DigitalLifeRunActivityEventV1,
  DigitalLifeTerminalStreamEventV1,
} from '@ai-digital-life/kernel';
import { EventBuffer } from '../shared/eventBuffer';
import { subscribeChannel } from './tauri-shared';
import { createTauriWorkspaceBridge } from './tauri-workspace';
import { createTauriBrowserBridge } from './tauri-browser';
import { createTauriConversationBridge } from './tauri-conversation';
import { createTauriAgentBridge, createTauriSubagentBridge } from './tauri-agent';
import { createTauriCiBridge, createTauriGithubBridge } from './tauri-ci-github';
import { createTauriProviderBridge } from './tauri-provider';
import {
  createTauriAppBridge,
  createTauriCommandBridge,
  createTauriCommandsConfigBridge,
  createTauriCustomAgentBridge,
  createTauriMcpBridge,
  createTauriPatchBridge,
  createTauriReservedBridge,
  createTauriRetrievalBridge,
  createTauriRunActivityBridge,
  createTauriTaskBridge,
  createTauriWindowBridge,
  createTauriSessionForkBridge,
} from './tauri-misc';
import { createTauriCompactionBridge } from './tauri-compaction';
import { createTauriDurableBridge } from './tauri-durable';
import { createTauriLspBridge } from './tauri-lsp';
import { createTauriPermissionBridge } from './tauri-permission';
import { createTauriPtyBridge } from './tauri-pty';
import { createTauriReferenceBridge } from './tauri-reference';
import { createTauriSnapshotBridge } from './tauri-snapshot';
import { createTauriWebToolsBridge } from './tauri-web-tools';

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
    ci: createTauriCiBridge(),
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
