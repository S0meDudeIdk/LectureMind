import React from 'react';
import { WarningCircle, ArrowsCounterClockwise } from '@phosphor-icons/react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center bg-surface border border-red-500/20 rounded-xl m-4">
          <WarningCircle size={40} className="text-red-500 mb-3" />
          <h3 className="text-lg font-semibold text-text-primary mb-1">
            {this.props.title || 'Component Encountered an Issue'}
          </h3>
          <p className="text-sm text-text-secondary max-w-md mb-4">
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors shadow-sm"
          >
            <ArrowsCounterClockwise size={16} />
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
