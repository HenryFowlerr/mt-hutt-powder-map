import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
}

type State = {
  failed: boolean
}

export class MapErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Interactive terrain failed to render', error, info)
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="loading-state map-fallback" role="alert">
          <h1>Map unavailable</h1>
          <p>The snow brief is still available. Reload to try the interactive terrain again.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload map
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
