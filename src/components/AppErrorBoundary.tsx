import React from 'react';

interface State {
  error: Error | null;
}

class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="grid min-h-screen place-items-center bg-[#030407] px-4 text-white">
        <section className="neon-card max-w-xl p-6">
          <h1 className="text-2xl font-black">Something went wrong</h1>
          <p className="mt-3 text-sm leading-6 text-white/65">
            Memoriya had trouble loading this view. Please refresh the page. If it keeps happening, sign out and sign in again.
          </p>
          <button
            className="mt-5 rounded-lg border border-cyan-300/30 bg-cyan-300/15 px-4 py-2 text-sm font-black text-cyan-100"
            onClick={() => window.location.reload()}
          >
            Reload Memoriya
          </button>
        </section>
      </main>
    );
  }
}

export default AppErrorBoundary;
