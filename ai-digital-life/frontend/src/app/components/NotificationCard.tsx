import { useTCopy } from '@i18n/useTCopy';
import { IconAlertTriangle, IconClose } from '@icons';
import { CopyButton } from './CopyButton';
import type { NotificationData } from '@stores/slices/notificationSlice';

interface NotificationCardProps {
  notification: NotificationData;
  onClose: (id: string) => void;
  showCopy?: boolean;
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return `${Math.floor(days / 30)} 个月前`;
}

export function NotificationCard({ notification, onClose, showCopy = true }: NotificationCardProps) {
  const { t } = useTCopy();

  return (
    <div className="adl-notif-card" role="alert">
      <div className="adl-notif-card__header">
        <IconAlertTriangle className="adl-notif-card__icon" size={16} />
        <span className="adl-notif-card__title">{notification.title}</span>
        <button
          type="button"
          className="adl-notif-card__close"
          onClick={() => onClose(notification.id)}
          aria-label="Close"
        >
          <IconClose size={14} />
        </button>
      </div>
      <div className="adl-notif-card__body">{notification.summary}</div>
      <div className="adl-notif-card__footer">
        {showCopy && (
          <span className="adl-notif-card__copy-btn">
            <CopyButton text={notification.fullInfo} size={12} tooltip="复制完整冲突信息" tooltipCopied="已复制" />
          </span>
        )}
        <span className="adl-notif-card__time">{formatRelativeTime(notification.timestamp)}</span>
      </div>
    </div>
  );
}
