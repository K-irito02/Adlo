import { menuEn } from './menu';
import { workspaceEn } from './workspace';
import { conversationEn } from './conversation';
import { fileEn } from './file';
import { changesEn } from './changes';
import { terminalEn } from './terminal';
import { browserEn } from './browser';
import { approvalEn } from './approval';
import { modelsEn } from './models';
import { commonEn } from './common';
import { ciEn } from './ci';
import { communicateEn } from './communicate';
import { agentEn } from './agent';
import { mcpEn } from './mcp';
import { providerEn } from './provider';
import { commandsEn } from './commands';
import { permissionEn } from './permission';
import { webSearchEn } from './webSearch';
import { sessionForkEn } from './sessionFork';
import { lspEn } from './lsp';
import { referenceEn } from './reference';
import { customAgentEn } from './customAgent';
import { durableEn } from './durable';
import { settingsEn } from './settings';
import { notificationEn } from './notification';

export const enUS = {
  ...menuEn,
  ...workspaceEn,
  ...conversationEn,
  ...fileEn,
  ...changesEn,
  ...terminalEn,
  ...browserEn,
  ...approvalEn,
  ...modelsEn,
  ...commonEn,
  ...ciEn,
  ...communicateEn,
  ...agentEn,
  ...mcpEn,
  ...providerEn,
  ...commandsEn,
  ...permissionEn,
  ...webSearchEn,
  ...sessionForkEn,
  ...lspEn,
  ...referenceEn,
  ...customAgentEn,
  ...durableEn,
  ...settingsEn,
  ...notificationEn,
} as const;
