import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useClickOutside } from '../hooks/useClickOutside';
import { IconBell } from '../icons';
import { useAppStore } from '../stores/slicedStore';
import { TooltipSimple } from '../components/Tooltip';
import { NotificationCard } from '../components/NotificationCard';
import type { CopyDict } from '../i18n';

interface TitleBarNotificationsProps {
  t: CopyDict;
}

const TitleBarNotifications = React.memo(function TitleBarNotifications({
  t,
}: TitleBarNotificationsProps) {
  const notifications = useAppStore((s) => s.notifications);
  const removeNotification = useAppStore((s) => s.removeNotification);
  const markAllAsRead = useAppStore((s) => s.markAllAsRead);
  const clearAll = useAppStore((s) => s.clearAll);
  const setReadByVisibility = useAppStore((s) => s.setReadByVisibility);
  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const notifListRef = useRef<HTMLDivElement>(null);

  const toggleNotifDropdown = useCallback(() => {
    setNotifOpen((v) => !v);
  }, []);

  useClickOutside(notifRef, notifOpen, {
    onOutsideClick: () => setNotifOpen(false),
    onEscape: () => setNotifOpen(false),
  });

  // Read tracking: collect seen IDs during session, flush to store only when dropdown closes
  const seenDuringSessionRef = useRef(new Set<string>());
  useEffect(() => {
    if (!notifOpen || !notifListRef.current) {
      return;
    }
    const container = notifListRef.current;
    const cards = container.querySelectorAll('[data-notif-id]');
    if (cards.length === 0) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) {
            continue;
          }
          const id = (e.target as HTMLElement).getAttribute('data-notif-id');
          if (id) {
            seenDuringSessionRef.current.add(id);
          }
        }
      },
      { root: container, threshold: 0.5 }
    );
    cards.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [notifOpen]);

  // Flush seen IDs to store when dropdown closes
  useEffect(() => {
    if (!notifOpen && seenDuringSessionRef.current.size > 0) {
      setReadByVisibility([...seenDuringSessionRef.current]);
      seenDuringSessionRef.current.clear();
    }
  }, [notifOpen, setReadByVisibility]);

  // Drag-to-scroll on notification body
  const dragRef = useRef<{ startY: number; startScroll: number; dragging: boolean } | null>(null);
  const handleBodyMouseDown = useCallback((e: React.MouseEvent) => {
    if (!notifListRef.current) {
      return;
    }
    dragRef.current = {
      startY: e.clientY,
      startScroll: notifListRef.current.scrollTop,
      dragging: false,
    };
  }, []);
  useEffect(() => {
    if (!notifOpen) {
      return;
    }
    const el = notifListRef.current;
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current || !el) {
        return;
      }
      const dy = e.clientY - dragRef.current.startY;
      if (Math.abs(dy) > 3) {
        dragRef.current.dragging = true;
      }
      if (dragRef.current.dragging) {
        el.scrollTop = dragRef.current.startScroll - dy;
      }
    };
    const onUp = () => {
      dragRef.current = null;
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [notifOpen]);

  return (
    <div className="adl-notif-wrapper" style={{ position: 'relative', display: 'inline-flex' }}>
      <TooltipSimple content={t.notifButtonTooltip as string} placement="bottom">
        <button
          type="button"
          className="adl-icon-btn adl-iconstrip__button"
          onClick={toggleNotifDropdown}
          aria-label={t.notifTitle as string}
          style={{ position: 'relative' }}
        >
          <IconBell size={16} decorative />
          {unreadCount > 0 && (
            <span className="adl-notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
          )}
        </button>
      </TooltipSimple>
      {notifOpen && (
        <div className="adl-notif-dropdown">
          <div className="adl-notif-dropdown__header">
            <span className="adl-notif-dropdown__title">{t.notifTitle}</span>
            <div className="adl-notif-dropdown__actions">
              <button
                type="button"
                className="adl-notif-dropdown__action-btn"
                onClick={() => {
                  markAllAsRead();
                  setNotifOpen(false);
                }}
              >
                {t.notifMarkAllRead}
              </button>
              <button
                type="button"
                className="adl-notif-dropdown__action-btn"
                onClick={() => {
                  clearAll();
                  setNotifOpen(false);
                }}
              >
                {t.notifClearAll}
              </button>
            </div>
          </div>
          <div
            className="adl-notif-dropdown__body"
            ref={notifListRef}
            onMouseDown={handleBodyMouseDown}
            tabIndex={-1}
          >
            {notifications.length === 0 ? (
              <div className="adl-notif-dropdown__empty">{t.notifEmpty}</div>
            ) : (
              notifications.map((n) => (
                <div key={n.id} data-notif-id={n.id}>
                  <NotificationCard
                    notification={n}
                    onClose={(id) => {
                      removeNotification(id);
                    }}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export { TitleBarNotifications };
