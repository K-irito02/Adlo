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
  onMoveUp?: (id: string) => void;
  onMoveDown?: (id: string) => void;
  isFirst: boolean;
  isLast: boolean;
  moveUpLabel: string;
  moveDownLabel: string;
  removeLabel: string;
}

function SortableItem({
  workspace,
  showActions,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  moveUpLabel,
  moveDownLabel,
  removeLabel,
}: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: workspace.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="adl-sortable-item">
      <button type="button" className="adl-sortable-handle" {...attributes} {...listeners}>
        <IconMenu size={14} />
      </button>
      <span className="adl-sortable-label">{workspace.name}</span>
      {showActions && (
        <div className="adl-sortable-actions">
          <button
            type="button"
            className="adl-sortable-move"
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp?.(workspace.id);
            }}
            disabled={isFirst}
            aria-label={moveUpLabel}
          >
            ↑
          </button>
          <button
            type="button"
            className="adl-sortable-move"
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown?.(workspace.id);
            }}
            disabled={isLast}
            aria-label={moveDownLabel}
          >
            ↓
          </button>
          <button
            type="button"
            className="adl-sortable-remove"
            onClick={() => onRemove?.(workspace.id)}
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
  onMoveUp?: (id: string) => void;
  onMoveDown?: (id: string) => void;
  /** i18n labels passed from parent to avoid duplicate useTCopy calls */
  moveUpLabel: string;
  moveDownLabel: string;
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
  onMoveUp,
  onMoveDown,
  moveUpLabel,
  moveDownLabel,
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
            items.map((w, i) => (
              <SortableItem
                key={w.id}
                workspace={w}
                showActions={showActions}
                onRemove={onRemove}
                onMoveUp={onMoveUp}
                onMoveDown={onMoveDown}
                isFirst={i === 0}
                isLast={i === items.length - 1}
                moveUpLabel={moveUpLabel}
                moveDownLabel={moveDownLabel}
                removeLabel={removeLabel}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}
