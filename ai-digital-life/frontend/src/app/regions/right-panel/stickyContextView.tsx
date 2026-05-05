import React, { useEffect, useState, useRef, useCallback } from "react";
import { IconArrowUp } from "../../icons";
import type { StickyContextEntry, StickyContextModel } from "./stickyContext";
import type { CopyDict } from "../../copy";

const AUTO_HIDE_DELAY_MS = 1800;

type StickyContextProps = {
  model: StickyContextModel;
  "data-testid"?: string;
  onScroll?: () => void;
  t: CopyDict;
};

function buildStickyAriaLabel(entry: StickyContextEntry): string {
  if (entry.kind === "top") {
    return entry.label;
  }
  return `${entry.label} ${entry.detail ?? `L${entry.line}`}`.trim();
}

function resolveKindLabel(kind: string, t: CopyDict): string {
  switch (kind) {
    case "heading":
      return t.stickyContextKindHeading;
    case "line":
      return t.stickyContextKindLine;
    case "function":
      return t.stickyContextKindFunction;
    case "variable":
      return t.stickyContextKindVariable;
    case "class":
      return t.stickyContextKindClass;
    case "interface":
      return t.stickyContextKindInterface;
    default:
      return kind.slice(0, 1).toUpperCase();
  }
}

export function StickyContext(props: StickyContextProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isHovering, setIsHovering] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const startHideTimer = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      setIsVisible(false);
      hideTimerRef.current = null;
    }, AUTO_HIDE_DELAY_MS);
  }, [clearHideTimer]);

  useEffect(() => {
    setIsVisible(true);
    startHideTimer();

    return clearHideTimer;
  }, [props.model.activeEntryId, props.model.contextEntries.length, startHideTimer, clearHideTimer]);

  useEffect(() => {
    if (!isHovering && isVisible) {
      startHideTimer();
    }
  }, [isHovering, isVisible, startHideTimer]);

  const handleMouseEnter = useCallback(() => {
    setIsHovering(true);
    clearHideTimer();
  }, [clearHideTimer]);

  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
    if (isVisible) {
      startHideTimer();
    }
  }, [isVisible, startHideTimer]);

  const entries = props.model.showTopEntry
    ? [props.model.topEntry, ...props.model.contextEntries]
    : props.model.contextEntries;

  if (entries.length === 0) {
    return null;
  }

  return (
    <div
      className={`adl-sticky-context${isVisible ? "" : " is-hidden"}`}
      data-testid={props["data-testid"]}
      data-rows={props.model.rowCount}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {entries.map((entry) => {
        const isTop = entry.kind === "top";
        const isActive = props.model.activeEntryId === entry.id;
        const lineDetail = entry.detail?.replace(/^L(\d+)$/, (_, num) => `${props.t.stickyContextKindLine} ${num}`);
        return (
          <button
            key={entry.id}
            type="button"
            className={[
              "adl-sticky-context__row",
              `adl-sticky-context__row--${entry.tone}`,
              isTop ? "adl-sticky-context__row--top" : "",
              isTop && !props.model.canScrollToTop ? "is-at-top" : ""
            ].filter(Boolean).join(" ")}
            aria-current={isActive ? "true" : undefined}
            aria-label={buildStickyAriaLabel(entry)}
            onClick={isTop ? props.model.scrollToTop : () => props.model.scrollToEntry(entry.id)}
          >
            <span className="adl-sticky-context__rail" aria-hidden="true" />
            <span className="adl-sticky-context__copy">
              <strong className="adl-sticky-context__label">
                {isTop ? <IconArrowUp size={12} decorative className="adl-sticky-context__arrow" /> : null}
                {entry.label}
              </strong>
              {!isTop && lineDetail ? <span className="adl-sticky-context__detail">{lineDetail}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default StickyContext;
