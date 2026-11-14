import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { useClampedMenuPosition, type MenuViewportPosition } from '../treeEntryMenus';

interface RenderRecord {
  position: MenuViewportPosition | null;
  adjusted: MenuViewportPosition | null;
}

function Probe({
  position,
  records,
}: {
  position: MenuViewportPosition | null;
  records: RenderRecord[];
}) {
  const { menuRef, adjusted } = useClampedMenuPosition(position);
  records.push({ position, adjusted });
  if (!position) {
    return null;
  }
  return (
    <div
      ref={menuRef}
      data-testid="menu"
      style={{
        position: 'fixed',
        top: adjusted?.top ?? position.top,
        left: adjusted?.left ?? position.left,
      }}
    />
  );
}

describe('useClampedMenuPosition', () => {
  it('重新打开菜单时不会先按上一次菜单的坐标渲染（无位移）', () => {
    const records: RenderRecord[] = [];
    const { rerender } = render(<Probe position={{ top: 120, left: 160 }} records={records} />);

    // 关闭菜单 → 再次在另一处打开
    rerender(<Probe position={null} records={records} />);
    records.length = 0;
    rerender(<Probe position={{ top: 320, left: 420 }} records={records} />);

    const firstOpenRender = records.find((record) => record.position?.top === 320);
    expect(firstOpenRender).toBeDefined();
    // 首次渲染只能用本次坐标或等待量测（null），绝不能复用上一次的坐标
    expect(firstOpenRender?.adjusted).toBeNull();
  });
});
