import React, { Component, type ReactNode } from 'react';
import type { CopyDict } from '../i18n/types';

interface ErrorBoundaryBase {
  children: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

/**
 * 顶层错误边界：单点渲染异常不再导致整个应用空白（见 debug-logs 2026-09-17 RangeError 白屏）。
 * 无 fallback 时必须传入 t（默认面板级降级 UI 走 i18n）；显式 fallback 可省略 t。
 */
type ErrorBoundaryProps = ErrorBoundaryBase &
  ({ fallback: ReactNode; t?: CopyDict } | { fallback?: ReactNode; t: CopyDict });

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
      const t = this.props.t;
      // 类型层面：走到这里的一定是 t 必填的变体；运行时兜底覆盖纯 JS 调用方。
      if (!t) {
        return null;
      }
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
