import React, { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
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
    console.error("ErrorBoundary caught:", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="adl-error-boundary" role="alert" style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px",
          gap: "12px",
          color: "var(--text-secondary, #888)",
          fontSize: "13px",
          textAlign: "center",
          height: "100%"
        }}>
          <span style={{ fontSize: "24px" }}>⚠</span>
          <p>该面板遇到意外错误，已降级保护。</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              background: "var(--surface-hover, #333)",
              color: "var(--text-primary, #fff)",
              border: "1px solid var(--border, #444)",
              borderRadius: "6px",
              padding: "6px 16px",
              cursor: "pointer",
              fontSize: "12px"
            }}
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
