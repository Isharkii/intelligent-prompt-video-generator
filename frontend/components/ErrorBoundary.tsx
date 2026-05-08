"use client";

import React from "react";
import Button from "./ui/Button";

interface State { hasError: boolean; error: Error | null }

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-dvh flex items-center justify-center p-8">
        <div className="card max-w-md w-full space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <p className="font-mono text-[10px] tracking-widest text-red-400 uppercase">
              Runtime error
            </p>
          </div>
          <p className="font-mono text-sm text-[var(--text-muted)] break-all">
            {this.state.error?.message ?? "Unknown error"}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
          >
            RELOAD
          </Button>
        </div>
      </div>
    );
  }
}
