import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { VonChatLogo } from './VonChatLogo';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = error.message || 'An unexpected error occurred.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string; path?: string };
      if (parsed && typeof parsed.error === 'string') {
        readable = parsed.path
          ? `${parsed.error} (${parsed.path})`
          : parsed.error;
      }
    } catch {
      // Plain error message
    }
    return {
      hasError: true,
      message: readable,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('vonChat ErrorBoundary caught an error:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F4F8F5] text-[#112419] flex flex-col items-center justify-center px-6 py-12">
          <div className="w-full max-w-md bg-white border border-[#D4E3D9] rounded-2xl p-6 shadow-sm space-y-5 text-center">
            <div className="flex justify-center">
              <VonChatLogo size="md" tone="light" />
            </div>
            <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-left text-xs text-red-800">
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              <div className="space-y-1 min-w-0">
                <p className="font-semibold text-red-900">Something interrupted your session</p>
                <p className="break-words">{this.state.message}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={this.handleReload}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reload vonChat</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
