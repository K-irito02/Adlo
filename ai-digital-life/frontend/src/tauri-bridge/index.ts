import { invoke } from '@tauri-apps/api/core';
import type { DigitalLifeBridge, PtyOutputEvent } from '../shared/ipc';
import type {
  DigitalLifeModelStreamEventV1,
  DigitalLifeRunActivityEventV1,
  DigitalLifeTerminalStreamEventV1,
} from '@ai-digital-life/kernel';
import { EventBuffer } from '../shared/eventBuffer';
import { subscribeChannel } from './shared';
import { createTauriWorkspaceBridge } from './workspace';
import { createTauriBrowserBridge } from './browser';
import { createTauriConversationBridge } from './conversation';
import { createTauriAgentBridge, createTauriSubagentBridge } from './agent';
import { createTauriCiBridge, createTauriGithubBridge } from './ci-github';
import { createTauriProviderBridge } from './provider';
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
} from './misc';
import { createTauriCompactionBridge } from './compaction';
import { createTauriDurableBridge } from './durable';
import { createTauriLspBridge } from './lsp';
import { createTauriPermissionBridge } from './permission';
import { createTauriPluginBridge } from './plugin';
import { createTauriPtyBridge } from './pty';
import { createTauriReferenceBridge } from './reference';
import { createTauriSnapshotBridge } from './snapshot';
import { createTauriWebToolsBridge } from './web-tools';

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
    plugin: createTauriPluginBridge(),
    reference: createTauriReferenceBridge(),
    durable: createTauriDurableBridge(),
    reserved: createTauriReservedBridge(),
    customAgent: createTauriCustomAgentBridge(),
  };
}

export { isTauriShell } from './shared';
