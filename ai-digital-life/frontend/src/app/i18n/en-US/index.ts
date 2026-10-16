import { menuEn } from './menu';
import { workspaceEn } from './workspace';
import { fileEn } from './file';
import { changesEn } from './changes';
import { terminalEn } from './terminal';
import { browserEn } from './browser';
import { approvalEn } from './approval';
import { modelsEn } from './models';
import { commonEn } from './common';
import { mcpEn } from './mcp';
import { webSearchEn } from './webSearch';
import { lspEn } from './lsp';
import { referenceEn } from './reference';
import { customAgentEn } from './customAgent';
import { durableEn } from './durable';
import { dshEn } from './dsh';
import { settingsEn } from './settings';
import { notificationEn } from './notification';
import { errorsEn } from './errors';
import { utilitiesEn } from './utilities';
export const enUS = {
  ...menuEn,
  ...workspaceEn,
  ...fileEn,
  ...changesEn,
  ...terminalEn,
  ...browserEn,
  ...approvalEn,
  ...modelsEn,
  ...commonEn,
  ...mcpEn,
  ...webSearchEn,
  ...lspEn,
  ...referenceEn,
  ...customAgentEn,
  ...durableEn,
  ...dshEn,
  ...settingsEn,
  ...notificationEn,
  ...errorsEn,
  ...utilitiesEn,
} as const;
