import React from "react";
import { IconArrowUp } from "../../icons";
import type { StickyContextEntry, StickyContextModel } from "./stickyContext";

type StickyContextProps = {
  model: StickyContextModel;
  "data-testid"?: string;
};

function buildStickyAriaLabel(entry: StickyContextEntry): string {
  if (entry.kind === "top") {
    return entry.label;
  }
  return `${entry.label} ${entry.detail ?? `L${entry.line}`}`.trim();
}

export function StickyContext(props: StickyContextProps) {
  const entries = props.model.showTopEntry
    ? [props.model.topEntry, ...props.model.contextEntries]
    : props.model.contextEntries;

  if (entries.length === 0) {
    return null;
  }

  return (
    <div
      className="adl-sticky-context"
      data-testid={props["data-testid"]}
      data-rows={props.model.rowCount}
    >
      {entries.map((entry) => {
        const isTop = entry.kind === "top";
        const isActive = props.model.activeEntryId === entry.id;
        return (
          <button
            key={entry.id}
            type="button"
            className={[
              "adl-sticky-context__row",
              `adl-sticky-context__row--${entry.tone}`,
              isTop ? "adl-sticky-context__row--top" : "",
              isActive ? "is-active" : "",
              isTop && !props.model.canScrollToTop ? "is-at-top" : ""
            ].filter(Boolean).join(" ")}
            aria-current={isActive ? "true" : undefined}
            aria-label={buildStickyAriaLabel(entry)}
            onClick={isTop ? props.model.scrollToTop : () => props.model.scrollToEntry(entry.id)}
          >
            <span className="adl-sticky-context__rail" aria-hidden="true" />
            <span className="adl-sticky-context__kind" aria-hidden="true">
              {isTop ? <IconArrowUp size={12} decorative /> : entry.kind === "heading" ? "#" : entry.kind === "line" ? "L" : entry.kind.slice(0, 1).toUpperCase()}
            </span>
            <span className="adl-sticky-context__copy">
              <strong className="adl-sticky-context__label">{entry.label}</strong>
              {!isTop && entry.detail ? <span className="adl-sticky-context__detail">{entry.detail}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default StickyContext;
