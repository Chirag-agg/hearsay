import { Component, type ReactNode } from "react";

// Keeps one broken screen from blanking the whole app.
export default class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="card m-4 p-4 text-sm">
          <div className="font-display text-lg text-blood">This screen hit an error.</div>
          <pre className="mt-2 whitespace-pre-wrap text-xs text-muted">{String(this.state.error)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
