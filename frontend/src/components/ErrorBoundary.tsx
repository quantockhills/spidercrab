import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional custom fallback UI. If omitted, a default styled fallback is shown. */
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary — catches render errors in its child tree.
 *
 * Use it to wrap parts of the UI that should not take down the entire app
 * when a component throws during render.
 *
 * @example
 * <ErrorBoundary>
 *   <MaybeCrashyComponent />
 * </ErrorBoundary>
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Caught render error:', error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-[var(--text-primary)]">
          <div className="bg-[var(--bg-tertiary)] border border-[var(--border)] p-6 max-w-md w-full space-y-4">
            <h2 className="text-base font-semibold text-[var(--accent-red)]">
              Something went wrong
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              A component error occurred. Try retrying, or reload the page if the issue persists.
            </p>
            {this.state.error && (
              <pre className="text-xs text-[var(--text-secondary)] bg-[var(--bg-primary)] p-3 overflow-auto max-h-32 border border-[var(--border)]">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={this.handleRetry}
              className="w-full py-2.5 bg-[var(--accent-dim)] text-[var(--accent-orange)] text-sm font-medium active:brightness-95 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
