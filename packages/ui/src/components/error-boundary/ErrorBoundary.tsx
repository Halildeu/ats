import React, { Component, ErrorInfo, ReactNode } from 'react';
import {
  resolveAccessState, _accessStyles,
  type AccessControlledProps,
} from '../../internal/access-controller';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ErrorBoundaryFallback =
  | ReactNode
  | ((error: Error, reset: () => void) => ReactNode);

export interface ErrorBoundaryProps extends AccessControlledProps {
  /** Child components to wrap */
  children: ReactNode;
  /** Static fallback element, or render function receiving (error, reset) */
  fallback?: ErrorBoundaryFallback;
  /** Callback fired when an error is caught — use for logging / reporting */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Additional CSS class merged onto the wrapper */
  className?: string;
  /** data-component attribute override */
  'data-component'?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/* ------------------------------------------------------------------ */
/*  Default fallback                                                   */
/* ------------------------------------------------------------------ */

const DefaultFallback: React.FC<{ error: Error; onReset: () => void }> = ({
  error,
  onReset,
}) => (
  <div
    role="alert"
    style={{
      padding: '24px',
      border: '1px solid var(--border-default)',
      borderRadius: '8px',
      background: 'var(--surface-default)',
      color: 'var(--text-primary)',
      textAlign: 'center',
    }}
  >
    <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Something went wrong</p>
    <p style={{ margin: '0 0 16px', fontSize: '0.875rem', opacity: 0.7 }}>
      {error.message}
    </p>
    <button
      type="button"
      onClick={onReset}
      style={{
        padding: '6px 16px',
        borderRadius: '6px',
        border: '1px solid var(--border-default)',
        background: 'var(--surface-default)',
        color: 'var(--text-primary)',
        cursor: 'pointer',
        fontSize: '0.875rem',
      }}
    >
      Try again
    </button>
  </div>
);

/* ------------------------------------------------------------------ */
/*  ErrorBoundary                                                      */
/* ------------------------------------------------------------------ */

/**
 * Error boundary component that catches JavaScript errors in child components.
 * @example
 * ```tsx
 * <ErrorBoundary fallback={<p>Something went wrong</p>}>
 *   <App />
 * </ErrorBoundary>
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/error-boundary)
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  static displayName = 'ErrorBoundary';
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.props.onError?.(error, errorInfo);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render() {
    const {
      children,
      fallback,
      className,
      'data-component': dataComponent = 'error-boundary',
      access = 'full',
      accessReason,
    } = this.props;
    const { error } = this.state;
    const accessState = resolveAccessState(access);
    if (accessState.isHidden) return null;

    if (error) {
      const fallbackContent =
        typeof fallback === 'function'
          ? fallback(error, this.reset)
          : fallback ?? <DefaultFallback error={error} onReset={this.reset} />;

      return (
        <div className={className} data-component={dataComponent} data-access-state={accessState.state} title={accessReason}>
          {fallbackContent}
        </div>
      );
    }

    return (
      <div className={className} data-component={dataComponent} data-access-state={accessState.state} title={accessReason}>
        {children}
      </div>
    );
  }
}

export { ErrorBoundary };
ErrorBoundary.displayName = 'ErrorBoundary';

/**
 * ForwardRef wrapper for ErrorBoundary that enables ref forwarding.
 * Use the class-based `ErrorBoundary` export directly when ref forwarding is not needed.
 */
const ErrorBoundaryWithRef = React.forwardRef<ErrorBoundary, ErrorBoundaryProps>(
  function ErrorBoundaryForwardRef(props, _ref) {
    return <ErrorBoundary {...props} />;
  },
);
ErrorBoundaryWithRef.displayName = 'ErrorBoundary';

export { ErrorBoundaryWithRef };

/** Alias for ErrorBoundaryProps for external consumers. */
export type ErrorBoundaryComponentProps = ErrorBoundaryProps;
/** Alias for ErrorBoundaryFallback for external consumers. */
export type ErrorBoundaryFallbackType = ErrorBoundaryFallback;

