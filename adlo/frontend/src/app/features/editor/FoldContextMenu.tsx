import React from 'react';
import { ContextMenu, type ContextMenuItem } from '@components/ContextMenu';

interface FoldContextMenuProps {
  visible: boolean;
  position: { x: number; y: number };
  menuItems: ContextMenuItem[];
  onClose: () => void;
}

export const FoldContextMenu = React.memo(function FoldContextMenu({
  visible,
  position,
  menuItems,
  onClose,
}: FoldContextMenuProps) {
  if (!visible || menuItems.length === 0) {
    return null;
  }
  return <ContextMenu items={menuItems} position={position} onClose={onClose} />;
});
