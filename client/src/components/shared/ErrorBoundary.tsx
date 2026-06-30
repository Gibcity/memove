import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean }

// Ponytail: minimal class boundary — safety net so a TypeError in a leaf
// (e.g. ViewportStatPanel before the null-guard lands) doesn't blank the
// whole relocation page. React 18 still needs a class boundary; no hooks API.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, info: { componentStack?: string }): void {
    // ponytail: surface to console; real product would post to an error sink.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info?.componentStack)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center text-muted">
          Something went wrong. Refresh to try again.
        </div>
      )
    }
    return this.props.children
  }
}
