import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { IconChevronDown, IconChevronUp, IconClose } from '@icons';
import { CustomScrollArea } from '@features/file-tree/CustomScrollArea';

/**
 * 「应用通知」面板里的更新卡片（ADR-0027）。
 *
 * 布局约定（用户 2026-11-18 定稿）：
 * - 说明文案**常驻**，任何状态都不隐藏；右下角一个单折角用来展开/收起，
 *   展开后容器可滚动（全局细滚动条），避免长文案把卡片撑成一面墙。
 * - 动作行只有右端「跳过此版本」+「下载 / 安装」（跳过在左、主操作在最右）；
 *   说明页入口只在「关于」页提供，卡片里不再重复。
 * - 主按钮是灰底无边框，只靠字重区分层级；不再使用蓝色。
 */
export function UpdateNotificationCard({ onClose }: { onClose: () => void }) {
  const { t } = useTCopy();
  const { status, version, notes, progress } = useAppStore(
    useShallow((state) => ({
      status: state.appUpdateStatus,
      version: state.appUpdateVersion,
      notes: state.appUpdateNotes,
      progress: state.appUpdateProgress,
    })),
  );
  const downloadAppUpdate = useAppStore((s) => s.downloadAppUpdate);
  const installAppUpdate = useAppStore((s) => s.installAppUpdate);
  const skipAppUpdateVersion = useAppStore((s) => s.skipAppUpdateVersion);

  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const notesRef = useRef<HTMLParagraphElement>(null);

  const percent =
    progress?.total && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null;

  const cleanNotes = notes ? notes.replace(/[\u3002.\s]+$/u, '') : '';
  const notesText = cleanNotes || t.updateNoNotes;

  // 换版本时回到收起态，避免上一张卡的展开状态串到新版本上。
  useEffect(() => {
    setExpanded(false);
  }, [version]);

  // 只有真的被截断时才显示折角：一行文案配一个折角是纯噪音。
  useEffect(() => {
    if (expanded) {
      return;
    }
    const element = notesRef.current;
    if (!element) {
      setOverflowing(false);
      return;
    }
    setOverflowing(element.scrollHeight > element.clientHeight + 1);
  }, [notesText, expanded]);

  const showActions = status !== 'installing';

  return (
    <div className="adl-notif-card adl-update-card">
      <div className="adl-update-card__head">
        <span className="adl-update-card__title">{t.updateAvailableShort}</span>
        <span className="adl-update-card__pill">v{version ?? '—'}</span>
        <button
          type="button"
          className="adl-update-card__close"
          onClick={onClose}
          aria-label={t.notifClose}
        >
          <IconClose size={12} />
        </button>
      </div>

      <div
        className={`adl-update-card__notes${
          overflowing || expanded ? ' adl-update-card__notes--overflowing' : ''
        }`}
      >
        {expanded ? (
          <CustomScrollArea
            shellClassName="adl-update-card__notes-shell"
            scrollClassName="adl-update-card__notes-scroll"
            scrollbarClassName="adl-update-card__notes-scrollbar"
            thumbClassName="adl-update-card__notes-scrollbar-thumb"
          >
            <p className="adl-update-card__notes-text adl-update-card__notes-text--expanded">
              {notesText}
            </p>
          </CustomScrollArea>
        ) : (
          <p ref={notesRef} className="adl-update-card__notes-text">
            {notesText}
          </p>
        )}
        {overflowing || expanded ? (
          <button
            type="button"
            className="adl-update-card__toggle"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-label={t.updateExpandNotes}
          >
            {expanded ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />}
          </button>
        ) : null}
      </div>

      {status === 'downloading' ? (
        <div className="adl-update-card__progress">
          <span className="adl-update-card__progress-track">
            <span
              className="adl-update-card__progress-fill"
              style={{ width: `${percent ?? 5}%` }}
            />
          </span>
          <span className="adl-update-card__progress-value">{percent ?? '…'}%</span>
        </div>
      ) : null}

      {status === 'installing' ? (
        <p className="adl-update-card__line adl-loading-row__text--shimmer">{t.updateInstalling}</p>
      ) : null}

      {status === 'error' ? <p className="adl-update-card__line">{t.updateCheckFailed}</p> : null}

      {showActions ? (
        <div className="adl-update-card__actions">
          <div className="adl-update-card__actions-right">
            {status === 'error' && version ? (
              <button
                type="button"
                className="adl-update-card__btn adl-update-card__btn--primary"
                onClick={() => void downloadAppUpdate()}
              >
                {t.aboutUpdateRetry}
              </button>
            ) : null}
            {status === 'available' ? (
              <button type="button" className="adl-update-card__btn" onClick={skipAppUpdateVersion}>
                {t.updateSkipVersion}
              </button>
            ) : null}
            {status === 'available' ? (
              <button
                type="button"
                className="adl-update-card__btn adl-update-card__btn--primary"
                onClick={() => void downloadAppUpdate()}
              >
                {t.updateDownload}
              </button>
            ) : null}
            {status === 'downloaded' ? (
              <button
                type="button"
                className="adl-update-card__btn adl-update-card__btn--primary"
                onClick={() => void installAppUpdate()}
              >
                {t.updateInstallNow}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
