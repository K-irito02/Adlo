import { useMemo } from 'react';
import { type IconName } from '../../design-system/icons';
import { TooltipSimple } from './Tooltip';
import { Icon } from './Icon';
import { useTCopy } from '../i18n/useTCopy';

interface ActionButtonProps {
  state: 'idle' | 'generating' | 'error' | 'waiting';
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

function getAppearanceKey(
  state: ActionButtonProps['state'],
  hasContent: boolean
): 'idle-empty' | 'idle-ready' | 'generating' | 'error' | 'waiting' {
  if (state === 'idle') {
    return hasContent ? 'idle-ready' : 'idle-empty';
  }
  if (state === 'generating') {
    return 'generating';
  }
  if (state === 'error') {
    return 'error';
  }
  return 'waiting';
}

export function ActionButton({ state, hasContent, onSend, onStop, onRetry }: ActionButtonProps) {
  const { t } = useTCopy();

  const appearance = useMemo<ButtonAppearance>(() => {
    const key = getAppearanceKey(state, hasContent);
    switch (key) {
      case 'idle-empty':
        return {
          icon: 'arrow-up' as const,
          label: t.send,
          className: 'action-btn action-btn--idle action-btn--empty',
          isDisabled: true,
          onClick: () => {},
        };
      case 'idle-ready':
        return {
          icon: 'arrow-up' as const,
          label: t.sendMessage,
          className: 'action-btn action-btn--idle action-btn--ready',
          isDisabled: false,
          onClick: onSend,
        };
      case 'generating':
        return {
          icon: 'stop-circle' as const,
          label: t.stopGenerating,
          className: 'action-btn action-btn--generating',
          isDisabled: false,
          onClick: onStop,
        };
      case 'error':
        return {
          icon: 'rotate-ccw' as const,
          label: t.retry,
          className: 'action-btn action-btn--error',
          isDisabled: false,
          onClick: onRetry,
        };
      case 'waiting':
        return {
          icon: 'loader-2' as const,
          label: t.waiting,
          className: 'action-btn action-btn--waiting',
          isDisabled: true,
          onClick: () => {},
        };
    }
  }, [state, hasContent, onSend, onStop, onRetry, t]);

  const isSpinning = state === 'error' || state === 'waiting';

  return (
    <TooltipSimple content={appearance.label} placement="top">
      <button
        type="button"
        className={appearance.className}
        onClick={appearance.onClick}
        disabled={appearance.isDisabled}
        aria-label={appearance.label}
        data-action-state={state}
        data-testid="action-button"
      >
        <span className={`action-btn__icon${isSpinning ? ' action-btn__icon--spin' : ''}`}>
          <Icon name={appearance.icon} size="md" />
        </span>
      </button>
    </TooltipSimple>
  );
}

export default ActionButton;
export type { ActionButtonProps };
