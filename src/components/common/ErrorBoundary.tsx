import React, { Component, ErrorInfo, ReactNode } from 'react';
import { SaveManager } from '../../services/SaveManager';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  props: Props;
  state: State;

  constructor(props: Props) {
    super(props);
    this.props = props;
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = async () => {
    try {
      // Clear all data
      const metadata = await SaveManager.getMetadata();
      for (const meta of metadata) {
        await SaveManager.deleteSave(meta.id);
      }
      window.location.reload();
    } catch (e) {
      console.error('Failed to clear data:', e);
      // Force reload anyway
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-rose-500 mb-4">Something went wrong</h2>
            <p className="text-slate-300 mb-4 text-sm">
              The application encountered a critical error. This might be due to corrupted save data or a temporary glitch.
            </p>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 mb-6 overflow-auto max-h-32">
              <code className="text-xs text-rose-400 font-mono">
                {this.state.error?.message || 'Unknown error'}
              </code>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors"
              >
                Reload Page
              </button>
              <button
                onClick={this.handleReset}
                className="flex-1 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-medium transition-colors"
              >
                Reset Data
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
