import { useMemo } from 'react';
import type { BrowserPanelProps } from '../types';
import type { RightPanelProps } from '@regions/RightPanel';

export function useBrowserPanelProps(
  _panelProps: RightPanelProps,
  isVisible: boolean
): BrowserPanelProps {
  return useMemo(() => ({ isVisible }), [isVisible]);
}
