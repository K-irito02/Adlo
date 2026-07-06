import { menuZh } from './menu';
import { workspaceZh } from './workspace';
import { conversationZh } from './conversation';
import { fileZh } from './file';
import { changesZh } from './changes';
import { terminalZh } from './terminal';
import { browserZh } from './browser';
import { approvalZh } from './approval';
import { modelsZh } from './models';
import { commonZh } from './common';
import { ciZh } from './ci';
import { communicateZh } from './communicate';
import { agentZh } from './agent';
import { mcpZh } from './mcp';
import { providerZh } from './provider';
import { commandsZh } from './commands';
import { permissionZh } from './permission';
import { webSearchZh } from './webSearch';
import { sessionForkZh } from './sessionFork';
import { lspZh } from './lsp';
import { pluginZh } from './plugin';
import { referenceZh } from './reference';
import { customAgentZh } from './customAgent';
import { durableZh } from './durable';
import { settingsZh } from './settings';

export const zhCN = {
  ...menuZh,
  ...workspaceZh,
  ...conversationZh,
  ...fileZh,
  ...changesZh,
  ...terminalZh,
  ...browserZh,
  ...approvalZh,
  ...modelsZh,
  ...commonZh,
  ...ciZh,
  ...communicateZh,
  ...agentZh,
  ...mcpZh,
  ...providerZh,
  ...commandsZh,
  ...permissionZh,
  ...webSearchZh,
  ...sessionForkZh,
  ...lspZh,
  ...pluginZh,
  ...referenceZh,
  ...customAgentZh,
  ...durableZh,
  ...settingsZh,
} as const;
