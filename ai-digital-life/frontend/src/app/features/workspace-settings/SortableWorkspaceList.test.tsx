import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableWorkspaceList } from './SortableWorkspaceList';
import type { DraggableWorkspace } from './WorkspaceSettingsTypes';

afterEach(cleanup);

function makeItems(ids: string[]): DraggableWorkspace[] {
  return ids.map((id) => ({ id, name: id.toUpperCase() }));
}

function renderInDnd(ui: React.ReactNode) {
  return render(<DndContext>{ui}</DndContext>);
}

describe('SortableWorkspaceList', () => {
  it('renders title and description text', () => {
    renderInDnd(
      <SortableWorkspaceList
        kind="priority"
        title="Priority"
        desc="Loaded first"
        tooltipContent="Tooltip text"
        items={makeItems(['a'])}
        emptyText="Empty"
        removeLabel="Remove {name}"
      />,
    );
    expect(screen.getByText('Priority')).toBeInTheDocument();
    expect(screen.getByText('Loaded first')).toBeInTheDocument();
  });

  it('renders all item names when items are non-empty', () => {
    renderInDnd(
      <SortableWorkspaceList
        kind="priority"
        title="P"
        desc="d"
        tooltipContent="t"
        items={makeItems(['a', 'b', 'c'])}
        emptyText="Empty"
        removeLabel="Remove {name}"
      />,
    );
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('renders empty text when items list is empty', () => {
    renderInDnd(
      <SortableWorkspaceList
        kind="deferred"
        title="D"
        desc="d"
        tooltipContent="t"
        items={[]}
        emptyText="Drag here"
        removeLabel="Remove {name}"
      />,
    );
    expect(screen.getByText('Drag here')).toBeInTheDocument();
  });

  it('renders the "!" info button next to the title', () => {
    renderInDnd(
      <SortableWorkspaceList
        kind="priority"
        title="P"
        desc="d"
        tooltipContent="t"
        items={[]}
        emptyText="Empty"
        removeLabel="Remove {name}"
      />,
    );
    const infoButton = screen.getByRole('button', { name: '' });
    expect(infoButton).toBeInTheDocument();
    expect(infoButton.className).toContain('adl-icon-button--info');
  });

  it('renders remove button for priority list', () => {
    renderInDnd(
      <SortableWorkspaceList
        kind="priority"
        title="P"
        desc="d"
        tooltipContent="t"
        items={makeItems(['a'])}
        emptyText="Empty"
        onRemove={() => {}}
        removeLabel="Remove {name}"
      />,
    );
    expect(screen.getByLabelText('Remove A')).toBeInTheDocument();
  });

  it('does not render remove button for natural list', () => {
    renderInDnd(
      <SortableWorkspaceList
        kind="natural"
        title="N"
        desc="d"
        tooltipContent="t"
        items={makeItems(['a'])}
        emptyText="Empty"
        onRemove={() => {}}
        removeLabel="Remove {name}"
      />,
    );
    expect(screen.queryByLabelText('Remove A')).not.toBeInTheDocument();
  });

  it('sets title attribute on label for native tooltip', () => {
    renderInDnd(
      <SortableWorkspaceList
        kind="priority"
        title="P"
        desc="d"
        tooltipContent="t"
        items={makeItems(['my-long-workspace-name'])}
        emptyText="Empty"
        removeLabel="Remove {name}"
      />,
    );
    const label = screen.getByText('MY-LONG-WORKSPACE-NAME');
    expect(label.getAttribute('title')).toBe('MY-LONG-WORKSPACE-NAME');
  });

  it('registers the list container as droppable with data-droppable attribute', () => {
    const { container } = renderInDnd(
      <SortableWorkspaceList
        kind="priority"
        title="P"
        desc="d"
        tooltipContent="t"
        items={[]}
        emptyText="Empty"
        removeLabel="Remove {name}"
      />,
    );
    const droppable = container.querySelector('[data-droppable="priority"]');
    expect(droppable).not.toBeNull();
  });
});
