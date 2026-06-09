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
} as const;
