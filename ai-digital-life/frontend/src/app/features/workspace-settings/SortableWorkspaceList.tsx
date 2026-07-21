import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconMenu, IconClose } from '../../icons';
import { IconAlertTriangle } from '../../icons/status';
import { TooltipSimple } from '../../components/Tooltip';
import type { ContainerId, DraggableWorkspace } from './WorkspaceSettingsTypes';

interface SortableItemProps {
  workspace: DraggableWorkspace;
  showActions: boolean;
  onRemove?: (id: string) => void;
  removeLabel: string;
}

function SortableItem({ workspace, showActions, onRemove, removeLabel }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: workspace.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0 : 1,
    transition: isDragging ? undefined : transition,
    pointerEvents: isDragging ? ('none' as const) : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="adl-sortable-item"
      data-sortable-id={workspace.id}
      {...attributes}
      {...listeners}
    >
      <span className="adl-sortable-handle" aria-hidden="true">
        <IconMenu size={14} />
      </span>
      <span className="adl-sortable-label" title={workspace.name}>{workspace.name}</span>
      {showActions && (
        <div className="adl-sortable-actions">
          <button
            type="button"
            className="adl-sortable-remove"
            onClick={(e) => {
              e.stopPropagation();
              onRemove?.(workspace.id);
            }}
            aria-label={removeLabel.replace('{name}', workspace.name)}
          >
            <IconClose size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

export interface SortableWorkspaceListProps {
  kind: ContainerId;
  title: string;
  desc: string;
  tooltipContent: string;
  items: DraggableWorkspace[];
  emptyText: string;
  onRemove?: (id: string) => void;
  /** i18n labels passed from parent to avoid duplicate useTCopy calls */
  removeLabel: string;
}

export function SortableWorkspaceList({
  kind,
  title,
  desc,
  tooltipContent,
  items,
  emptyText,
  onRemove,
  removeLabel,
}: SortableWorkspaceListProps) {
  const { setNodeRef } = useDroppable({ id: `list-${kind}` });

  const itemIds = items.map((w) => w.id);
  const showActions = kind !== 'natural';

  return (
    <div className="adl-sortable-section">
      <h4 className="adl-sortable-section-title">
        <span className="adl-sortable-section-title-text">{title}</span>
        <TooltipSimple content={tooltipContent} sideOffset={4} dismissible maxWidth={320}>
          <button
            type="button"
            className="adl-icon-button adl-icon-button--info"
            tabIndex={-1}
            aria-label=""
          >
            <IconAlertTriangle size={16} />
          </button>
        </TooltipSimple>
        <span className="adl-sortable-section-desc">{desc}</span>
      </h4>
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="adl-sortable-list" data-droppable={kind}>
          {items.length === 0 ? (
            <div className="adl-sortable-empty">{emptyText}</div>
          ) : (
            items.map((w) => (
              <SortableItem
                key={w.id}
                workspace={w}
                showActions={showActions}
                onRemove={onRemove}
                removeLabel={removeLabel}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}
