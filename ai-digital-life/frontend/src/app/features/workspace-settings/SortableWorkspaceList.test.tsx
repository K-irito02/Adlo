import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
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
        moveUpLabel="Move up"
        moveDownLabel="Move down"
        removeLabel="Remove {name}"
      />
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
        moveUpLabel="Move up"
        moveDownLabel="Move down"
        removeLabel="Remove {name}"
      />
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
        moveUpLabel="Move up"
        moveDownLabel="Move down"
        removeLabel="Remove {name}"
      />
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
        moveUpLabel="Move up"
        moveDownLabel="Move down"
        removeLabel="Remove {name}"
      />
    );
    const infoButton = screen.getByRole('button', { name: '' });
    expect(infoButton).toBeInTheDocument();
    expect(infoButton.className).toContain('adl-icon-button--info');
  });

  it('renders action buttons (up/down/remove) for priority list', () => {
    renderInDnd(
      <SortableWorkspaceList
        kind="priority"
        title="P"
        desc="d"
        tooltipContent="t"
        items={makeItems(['a'])}
        emptyText="Empty"
        onMoveUp={() => {}}
        onMoveDown={() => {}}
        onRemove={() => {}}
        moveUpLabel="Move up"
        moveDownLabel="Move down"
        removeLabel="Remove {name}"
      />
    );
    expect(screen.getByLabelText('Move up')).toBeInTheDocument();
    expect(screen.getByLabelText('Move down')).toBeInTheDocument();
    expect(screen.getByLabelText('Remove A')).toBeInTheDocument();
  });

  it('does not render action buttons for natural list', () => {
    renderInDnd(
      <SortableWorkspaceList
        kind="natural"
        title="N"
        desc="d"
        tooltipContent="t"
        items={makeItems(['a'])}
        emptyText="Empty"
        onMoveUp={() => {}}
        onMoveDown={() => {}}
        onRemove={() => {}}
        moveUpLabel="Move up"
        moveDownLabel="Move down"
        removeLabel="Remove {name}"
      />
    );
    expect(screen.queryByLabelText('Move up')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Move down')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Remove A')).not.toBeInTheDocument();
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
        moveUpLabel="Move up"
        moveDownLabel="Move down"
        removeLabel="Remove {name}"
      />
    );
    // The droppable list container should be marked
    const droppable = container.querySelector('[data-droppable="priority"]');
    expect(droppable).not.toBeNull();
  });

  it('disables move up button for first item', () => {
    renderInDnd(
      <SortableWorkspaceList
        kind="priority"
        title="P"
        desc="d"
        tooltipContent="t"
        items={makeItems(['a', 'b'])}
        emptyText="Empty"
        onMoveUp={() => {}}
        onMoveDown={() => {}}
        onRemove={() => {}}
        moveUpLabel="Move up"
        moveDownLabel="Move down"
        removeLabel="Remove {name}"
      />
    );
    const buttons = screen.getAllByLabelText('Move up');
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).not.toBeDisabled();
  });

  it('disables move down button for last item', () => {
    renderInDnd(
      <SortableWorkspaceList
        kind="priority"
        title="P"
        desc="d"
        tooltipContent="t"
        items={makeItems(['a', 'b'])}
        emptyText="Empty"
        onMoveUp={() => {}}
        onMoveDown={() => {}}
        onRemove={() => {}}
        moveUpLabel="Move up"
        moveDownLabel="Move down"
        removeLabel="Remove {name}"
      />
    );
    const buttons = screen.getAllByLabelText('Move down');
    expect(buttons[0]).not.toBeDisabled();
    expect(buttons[1]).toBeDisabled();
  });
});
