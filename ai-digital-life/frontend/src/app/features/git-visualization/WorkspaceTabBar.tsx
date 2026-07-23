import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import { mockWorkspaceTabs } from './data/gitVisMockData';

const TAB_WIDTH = 120;
const TAB_GAP = 4;

interface WorkspaceTabBarProps {
  rightExtra?: React.ReactNode;
}

export const WorkspaceTabBar = React.memo(function WorkspaceTabBar({
  rightExtra,
}: WorkspaceTabBarProps) {
  const { activeWorkspaceTab, setActiveWorkspaceTab } = useAppStore(
    useShallow((s) => ({
      activeWorkspaceTab: s.activeWorkspaceTab,
      setActiveWorkspaceTab: s.setActiveWorkspaceTab,
    })),
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [visibleTabs, setVisibleTabs] = useState(mockWorkspaceTabs.length);

  const recalc = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const containerWidth = container.getBoundingClientRect().width;
    if (containerWidth === 0) {
      setVisibleTabs(mockWorkspaceTabs.length);
      setTotalPages(1);
      return;
    }
    const perPage = Math.max(1, Math.floor((containerWidth + TAB_GAP) / (TAB_WIDTH + TAB_GAP)));
    setVisibleTabs(perPage);
    setTotalPages(Math.max(1, Math.ceil(mockWorkspaceTabs.length / perPage)));
  }, []);

  useEffect(() => {
    recalc();
    const ro = new ResizeObserver(recalc);
    if (containerRef.current) {
      ro.observe(containerRef.current);
    }
    return () => ro.disconnect();
  }, [recalc]);

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages - 1));
  }, [totalPages]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (totalPages > 1) {
        const delta = e.deltaY > 0 ? 1 : -1;
        setPage((p) => Math.min(totalPages - 1, Math.max(0, p + delta)));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [totalPages]);

  const isOverflowed = totalPages > 1;

  const handlePrev = useCallback(() => {
    setPage((p) => Math.max(p - 1, 0));
  }, []);

  const handleNext = useCallback(() => {
    setPage((p) => Math.min(p + 1, totalPages - 1));
  }, [totalPages]);

  const currentTabs = React.useMemo(() => {
    const start = page * visibleTabs;
    return mockWorkspaceTabs.slice(start, start + visibleTabs);
  }, [page, visibleTabs]);

  return (
    <div className="adl-workspace-tab__container" ref={containerRef}>
      <div className="adl-workspace-tab__row">
        {isOverflowed && (
          <button
            type="button"
            className="adl-workspace-tab__arrow"
            onClick={handlePrev}
            disabled={page === 0}
            aria-label="Previous page"
          >
            ◀
          </button>
        )}

        <div
          ref={scrollRef}
          className="adl-workspace-tab__scroll-container"
          data-overflowed={isOverflowed ? 'true' : 'false'}
        >
          <div className="adl-workspace-tab__track">
            {currentTabs.map((item) => {
              const isActive = item.id === activeWorkspaceTab;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`adl-workspace-tab__tab${isActive ? ' adl-workspace-tab__tab--active' : ''}`}
                  onClick={() => setActiveWorkspaceTab(item.id)}
                  title={item.label}
                  aria-pressed={isActive ? 'true' : 'false'}
                >
                  <span className="adl-workspace-tab__tab-text">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {isOverflowed && (
          <button
            type="button"
            className="adl-workspace-tab__arrow"
            onClick={handleNext}
            disabled={page === totalPages - 1}
            aria-label="Next page"
          >
            ▶
          </button>
        )}
        {rightExtra}
      </div>

      {isOverflowed && (
        <div className="adl-workspace-tab__dots">
          {Array.from({ length: totalPages }).map((_, idx) => (
            <span
              key={idx}
              className={`adl-workspace-tab__dot${idx === page ? ' adl-workspace-tab__dot--active' : ''}`}
              onClick={() => setPage(idx)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setPage(idx);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`Page ${idx + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
});
