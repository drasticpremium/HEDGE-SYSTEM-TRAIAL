import { Component, type ReactNode } from 'react'
/** Keeps one broken page or chart from blanking the whole site. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { err: Error | null; key?: string }> {
  state: { err: Error | null; key?: string } = { err: null }
  static getDerivedStateFromError(err: Error) { return { err } }
  static getDerivedStateFromProps(p: { resetKey?: string }, s: { err: Error | null; key?: string }) { return p.resetKey !== s.key ? { err: null, key: p.resetKey } : null }
  render() {
    if (!this.state.err) return this.props.children
    return <div className="panel card"><h2>This page hit an error</h2><p>The rest of the site still works. You can use the menu to go elsewhere, or reload.</p><pre className="mut" style={{ whiteSpace: 'pre-wrap' }}>{this.state.err.message}</pre><button type="button" className="btn primary" onClick={() => location.reload()}>Reload</button></div>
  }
}
