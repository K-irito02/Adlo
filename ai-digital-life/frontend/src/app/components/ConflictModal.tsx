import { createPortal } from 'react-dom';
import { NotificationCard } from './NotificationCard';
import type { NotificationData } from '@stores/slices/notificationSlice';

interface ConflictModalProps {
  notification: NotificationData;
  onDismiss: (id: string) => void;
}

export function ConflictModal({ notification, onDismiss }: ConflictModalProps) {
  return createPortal(
    <div className="adl-conflict-modal-overlay" onClick={(e) => e.stopPropagation()}>
      <div className="adl-conflict-modal" role="dialog" aria-modal="true">
        <NotificationCard notification={notification} onClose={onDismiss} />
      </div>
    </div>,
    document.body
  );
}
