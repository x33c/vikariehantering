import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

const isProd = import.meta.env.PROD;

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: 24, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'sans-serif'
        }}>
          <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            Något gick fel.
          </p>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 24 }}>
            Ladda om sidan eller kontakta support om felet kvarstår.
          </p>
          {!isProd && (
            <pre style={{ whiteSpace: 'pre-wrap', color: '#fca5a5', fontSize: 12, maxWidth: 600 }}>
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 24, padding: '8px 20px', borderRadius: 8,
              background: 'var(--blue)', color: '#fff', fontSize: 14,
              border: 'none', cursor: 'pointer'
            }}
          >
            Ladda om
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
