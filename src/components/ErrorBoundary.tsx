import { Component, type ErrorInfo, type ReactNode } from "react";
import i18n from "../i18n";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI crash:", error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
          <h1 className="text-[16px] font-semibold text-primary">
            {i18n.t("errorBoundary.title")}
          </h1>
          <p className="max-w-md text-[13px] text-muted">
            {this.state.error.message || i18n.t("common.error")}
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="rounded-[6px] border border-accent-border bg-accent-dark px-4 py-2 text-[13px] font-medium text-white hover:bg-accent"
          >
            {i18n.t("errorBoundary.reload")}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
