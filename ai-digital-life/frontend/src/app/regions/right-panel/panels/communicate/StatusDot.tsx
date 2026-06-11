import React from 'react';
import { statusColor } from './githubPanelUtils';

export function StatusDot({ conclusion, status }: { conclusion: string | null; status: string }) {
  const color = statusColor(conclusion, status);
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }}
    />
  );
}
