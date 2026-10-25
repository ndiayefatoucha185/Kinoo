import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Telemetry } from '../services/telemetry';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  moduleName?: string;
  onReset?: () => void;
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

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[ErrorBoundary] Erreur interceptée dans le module ${this.props.moduleName || 'inconnu'}:`, error, errorInfo);
    try {
      Telemetry.captureException(error, {
        module: this.props.moduleName || 'Composant Inconnu',
        componentStack: errorInfo.componentStack,
      });
    } catch (e) {
      console.warn('[ErrorBoundary] Échec transmission Sentry:', e);
    }
  }

  handleRetry = () => {
    if (this.props.onReset) {
      this.props.onReset();
    }
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 rounded-2xl bg-[#14151F] border border-amber-500/30 text-center my-4 space-y-3 shadow-md max-w-xl mx-auto">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              {this.props.fallbackTitle || 'Ce module est momentanément indisponible'}
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              Une erreur inattendue est survenue dans {this.props.moduleName || 'cette section'}. L'incident a été transmis à Sentry.
            </p>
          </div>
          <button
            type="button"
            onClick={this.handleRetry}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white font-semibold text-xs hover:opacity-95 transition-all shadow-md shadow-[#7C3AED]/20 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Réessayer</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
