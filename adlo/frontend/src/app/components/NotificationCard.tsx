import { useTCopy } from '@i18n/useTCopy';
import { IconAlertTriangle, IconClose } from '@icons';
import { formatRelativeTime } from '@utils/relativeTime';
import { CopyButton } from './CopyButton';
import type { NotificationData } from '@stores/slices/notificationSlice';
import { UpdateNotificationCard } from '@features/update/UpdateNotificationCard';

interface NotificationCardProps {
  notification: NotificationData;
  onClose: (id: string) => void;
  showCopy?: boolean;
}

export function NotificationCard({
  notification,
  onClose,
  showCopy = true,
}: NotificationCardProps) {
  const { t } = useTCopy();
  if (notification.type === 'update') {
    return <UpdateNotificationCard onClose={() => onClose(notification.id)} />;
  }
  const displayTitle =
    notification.type === 'conflict' ? (t.notifConflictTitle as string) : notification.title;

  return (
    <div className="adl-notif-card" role="alert">
      <div className="adl-notif-card__header">
        <IconAlertTriangle className="adl-notif-card__icon" size={16} />
        <span className="adl-notif-card__title">{displayTitle}</span>
        <button
          type="button"
          className="adl-notif-card__close"
          onClick={() => onClose(notification.id)}
          aria-label={t.notifClose}
        >
          <IconClose size={14} />
        </button>
      </div>
      <div className="adl-notif-card__body">{notification.summary}</div>
      <div className="adl-notif-card__footer">
        <div className="adl-notif-card__footer-left">
          {showCopy && (
            <>
              <span className="adl-notif-card__copy-btn">
                <CopyButton
                  text={notification.fullInfo}
                  size={12}
                  tooltip={t.notifCopyFullInfo as string}
                />
              </span>
              <span className="adl-notif-card__copy-hint">{t.notifCopyHint as string}</span>
            </>
          )}
        </div>
        <span className="adl-notif-card__time">
          {formatRelativeTime(notification.timestamp, t)}
        </span>
      </div>
    </div>
  );
}
