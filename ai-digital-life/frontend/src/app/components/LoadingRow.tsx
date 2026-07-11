import React from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { classNames } from '@root/design-system/html';

interface LoadingRowProps {
  message?: string;
  variant?: 'row' | 'center';
  className?: string;
}

interface EmptyRowProps {
  message: string;
  variant?: 'row' | 'center';
  className?: string;
}

export function LoadingRow({ message, variant = 'row', className }: LoadingRowProps) {
  const { t } = useTCopy();
  const text = message ?? (t.loading as string);

  return (
    <div
      role="status"
      aria-label={text}
      className={classNames('adl-loading-row', `adl-loading-row--${variant}`, className)}
    >
      <span className="adl-loading-row__spinner" aria-hidden="true" />
      <span className="adl-loading-row__text adl-loading-row__text--shimmer">{text}</span>
    </div>
  );
}

LoadingRow.displayName = 'LoadingRow';

export function EmptyRow({ message, variant = 'row', className }: EmptyRowProps) {
  return (
    <div
      role="status"
      aria-label={message}
      className={classNames('adl-empty-row', `adl-empty-row--${variant}`, className)}
    >
      <span className="adl-empty-row__text">{message}</span>
    </div>
  );
}

EmptyRow.displayName = 'EmptyRow';

export type { LoadingRowProps, EmptyRowProps };
