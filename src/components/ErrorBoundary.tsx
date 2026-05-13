import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
  info: ErrorInfo | null;
};

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, info: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ error, info });
    console.error(error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', padding: 24, background: '#111', color: '#fff', fontFamily: 'sans-serif' }}>
          <h1 style={{ fontSize: 22, marginBottom: 12 }}>Sidan kraschade</h1>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#fecaca' }}>
            {this.state.error.message}
          </pre>
          {this.state.info?.componentStack && (
            <pre style={{ marginTop: 16, whiteSpace: 'pre-wrap', color: '#d1d5db', fontSize: 12 }}>
              {this.state.info.componentStack}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
