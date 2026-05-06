import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo)
    this.setState({ errorInfo })
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
          <div className="max-w-2xl w-full bg-red-50 border border-red-200 rounded-xl p-6 text-red-900 shadow-sm overflow-auto">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <span className="text-2xl">⚠️</span> Application Error
            </h2>
            <p className="mb-4">Something went wrong while rendering this page.</p>
            {this.state.error && (
              <pre className="bg-red-900/10 p-4 rounded-lg text-sm font-mono whitespace-pre-wrap mb-4">
                {this.state.error.toString()}
              </pre>
            )}
            {this.state.errorInfo && (
              <details className="text-xs">
                <summary className="cursor-pointer font-bold mb-2">Stack Trace</summary>
                <pre className="bg-red-900/10 p-4 rounded-lg font-mono whitespace-pre-wrap">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
            <button 
              onClick={() => window.location.href = '/'}
              className="mt-6 bg-red-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-red-700 transition-colors"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
