import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "./ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center bg-slate-50 p-8">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100">
              <AlertTriangle className="h-7 w-7 text-rose-600" />
            </div>
            <h2 className="mb-2 text-xl font-bold text-slate-900">
              Something went wrong
            </h2>
            <p className="mb-6 text-sm text-slate-500">
              An unexpected error occurred. Try refreshing the page.
            </p>
            {this.state.error && (
              <pre className="mb-6 max-h-32 overflow-auto rounded-lg bg-slate-100 p-3 text-left text-xs text-slate-600">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex justify-center gap-3">
              <Button variant="outline" onClick={this.handleReset}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Try Again
              </Button>
              <Button onClick={() => window.location.reload()}>
                Refresh Page
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
