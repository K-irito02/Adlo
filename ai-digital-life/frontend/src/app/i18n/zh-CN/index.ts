import { menuZh } from './menu';
import { workspaceZh } from './workspace';
import { fileZh } from './file';
import { changesZh } from './changes';
import { terminalZh } from './terminal';
import { browserZh } from './browser';
import { approvalZh } from './approval';
import { modelsZh } from './models';
import { commonZh } from './common';
import { mcpZh } from './mcp';
import { webSearchZh } from './webSearch';
import { lspZh } from './lsp';
import { referenceZh } from './reference';
import { customAgentZh } from './customAgent';
import { durableZh } from './durable';
import { dshZh } from './dsh';
import { opencodeZh } from './opencode';
import { environmentZh } from './environment';
import { networkZh } from './network';
import { settingsZh } from './settings';
import { notificationZh } from './notification';
import { errorsZh } from './errors';
import { utilitiesZh } from './utilities';
export const zhCN = {
  ...menuZh,
  ...workspaceZh,
  ...fileZh,
  ...changesZh,
  ...terminalZh,
  ...browserZh,
  ...approvalZh,
  ...modelsZh,
  ...commonZh,
  ...mcpZh,
  ...webSearchZh,
  ...lspZh,
  ...referenceZh,
  ...customAgentZh,
  ...durableZh,
  ...dshZh,
  ...opencodeZh,
  ...environmentZh,
  ...networkZh,
  ...settingsZh,
  ...notificationZh,
  ...errorsZh,
  ...utilitiesZh,
} as const;
