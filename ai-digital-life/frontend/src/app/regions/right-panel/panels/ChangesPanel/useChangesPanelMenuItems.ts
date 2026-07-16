import { useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { CopyDict } from '@app/i18n';
import type { ChangesMenuItem } from '../ChangesTopToolbar';
import { computeChangesMenuItems } from './useChangesPanelStateUtils';

export interface UseChangesPanelMenuItemsInput {
  t: CopyDict;
  lineNumbersEnabled: boolean;
  wordWrapEnabled: boolean;
  setLineNumbersEnabled: Dispatch<SetStateAction<boolean>>;
  setWordWrapEnabled: Dispatch<SetStateAction<boolean>>;
  navigatorRelativePath: string | undefined;
  navigatorAbsolutePath: string | undefined;
  copyToClipboard: (text: string) => Promise<void>;
}

export function useChangesPanelMenuItems({
  t,
  lineNumbersEnabled,
  wordWrapEnabled,
  setLineNumbersEnabled,
  setWordWrapEnabled,
  navigatorRelativePath,
  navigatorAbsolutePath,
  copyToClipboard,
}: UseChangesPanelMenuItemsInput): {
  baseMenuItems: ChangesMenuItem[];
  changesMenuItems: ChangesMenuItem[];
} {
  const baseMenuItems = useMemo(
    () =>
      computeChangesMenuItems(
        t,
        lineNumbersEnabled,
        wordWrapEnabled,
        () => setLineNumbersEnabled((v) => !v),
        () => setWordWrapEnabled((v) => !v)
      ),
    [t, lineNumbersEnabled, wordWrapEnabled]
  );

  const changesMenuItems = useMemo(() => {
    if (!navigatorRelativePath) {
      return baseMenuItems;
    }
    const copyItems: ChangesMenuItem[] = [
      {
        id: 'copy-relative',
        label: t.fileCopyRelativePath,
        disabled: false,
        action: () => void copyToClipboard(navigatorRelativePath),
      },
      {
        id: 'copy-full',
        label: t.fileCopyFullPath,
        disabled: !navigatorAbsolutePath,
        action: () =>
          navigatorAbsolutePath ? void copyToClipboard(navigatorAbsolutePath) : undefined,
      },
      { id: 'sep-path', separator: true },
    ];
    return [...copyItems, ...baseMenuItems];
  }, [baseMenuItems, t, navigatorRelativePath, navigatorAbsolutePath, copyToClipboard]);

  return { baseMenuItems, changesMenuItems };
}
