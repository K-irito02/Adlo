import React, { useCallback, useMemo } from "react";
import { renderIcon, type IconName } from "../../design-system/icons";

interface ActionButtonProps {
  state: "idle" | "generating" | "error" | "waiting";
  hasContent: boolean;
  onSend: () => void;
  onStop: () => void;
  onRetry: () => void;
}

interface ButtonAppearance {
  icon: IconName;
  label: string;
  className: string;
  isDisabled: boolean;
  onClick: () => void;
}

function Icon({ name, size = "md" }: { name: IconName; size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl" }) {
  return (
    <span dangerouslySetInnerHTML={{ __html: renderIcon(name, { size, decorative: true }).value }} />
  );
}

const APPEARANCE_MAP: Record<
  "idle-empty" | "idle-ready" | "generating" | "error" | "waiting",
  (props: ActionButtonProps) => ButtonAppearance
> = {
  "idle-empty": () => ({
    icon: "arrow-up",
    label: "发送",
    className: "action-btn action-btn--idle action-btn--empty",
    isDisabled: true,
    onClick: () => {}
  }),
  "idle-ready": ({ onSend }) => ({
    icon: "arrow-up",
    label: "发送消息",
    className: "action-btn action-btn--idle action-btn--ready",
    isDisabled: false,
    onClick: onSend
  }),
  generating: ({ onStop }) => ({
    icon: "stop-circle",
    label: "停止生成",
    className: "action-btn action-btn--generating",
    isDisabled: false,
    onClick: onStop
  }),
  error: ({ onRetry }) => ({
    icon: "rotate-ccw",
    label: "重试",
    className: "action-btn action-btn--error",
    isDisabled: false,
    onClick: onRetry
  }),
  waiting: () => ({
    icon: "loader-2",
    label: "等待中...",
    className: "action-btn action-btn--waiting",
    isDisabled: true,
    onClick: () => {}
  })
};

export function ActionButton({ state, hasContent, onSend, onStop, onRetry }: ActionButtonProps) {
  const handleClick = useCallback(() => {
    let key: keyof typeof APPEARANCE_MAP;

    if (state === "idle") {
      key = hasContent ? "idle-ready" : "idle-empty";
    } else if (state === "generating") {
      key = "generating";
    } else if (state === "error") {
      key = "error";
    } else {
      key = "waiting";
    }

    const appearance = APPEARANCE_MAP[key]({ state, hasContent, onSend, onStop, onRetry });
    appearance.onClick();
  }, [state, hasContent, onSend, onStop, onRetry]);

  const appearance = useMemo<ButtonAppearance>(() => {
    if (state === "idle") {
      return APPEARANCE_MAP[hasContent ? "idle-ready" : "idle-empty"]({ state, hasContent, onSend, onStop, onRetry });
    }

    if (state === "generating") {
      return APPEARANCE_MAP.generating({ state, hasContent, onSend, onStop, onRetry });
    }

    if (state === "error") {
      return APPEARANCE_MAP.error({ state, hasContent, onSend, onStop, onRetry });
    }

    return APPEARANCE_MAP.waiting({ state, hasContent, onSend, onStop, onRetry });
  }, [state, hasContent, onSend, onStop, onRetry]);

  const isSpinning = state === "error" || state === "waiting";

  return (
    <button
      type="button"
      className={appearance.className}
      onClick={handleClick}
      disabled={appearance.isDisabled}
      title={appearance.label}
      aria-label={appearance.label}
      data-action-state={state}
      data-testid="action-button"
    >
      <span className={`action-btn__icon${isSpinning ? " action-btn__icon--spin" : ""}`}>
        <Icon name={appearance.icon} size="md" />
      </span>
    </button>
  );
}

export default ActionButton;
export type { ActionButtonProps };
