import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

import logoMark from '../assets/egestao-mark.svg';

type AppErrorBoundaryProps = { children: ReactNode };
type AppErrorBoundaryState = { failed: boolean };

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  override state: AppErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application render failure', error, info.componentStack);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="full-page-state error-state" role="alert">
        <img alt="" className="loading-logo" src={logoMark} />
        <h1>Nao foi possivel exibir esta tela</h1>
        <p>A sessao foi preservada. Recarregue a aplicacao para tentar novamente.</p>
        <button className="secondary-button" onClick={() => window.location.reload()} type="button">
          <RefreshCw size={16} />
          Recarregar
        </button>
      </main>
    );
  }
}
