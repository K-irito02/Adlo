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
} as const;
