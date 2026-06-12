import React, { Component, type ReactNode } from 'react';
import { IconAlertTriangle } from '../icons';
import { copy } from '../i18n';
import type { Locale } from '../i18n';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  locale?: Locale;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      const currentLocale = this.props.locale ?? 'zh-CN';
      const t = copy[currentLocale];
      return (
        <div
          className="adl-error-boundary"
          role="alert"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px',
            gap: '12px',
            color: 'var(--text-secondary, #888)',
            fontSize: '13px',
            textAlign: 'center',
            height: '100%',
          }}
        >
          <IconAlertTriangle size={24} decorative className="adl-error-boundary__icon" />
          <p>{t.panelError}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              background: 'var(--surface-hover, #333)',
              color: 'var(--text-primary, #fff)',
              border: '1px solid var(--border, #444)',
              borderRadius: '6px',
              padding: '6px 16px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            {t.retry}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
