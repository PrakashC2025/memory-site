import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { installLegacyBrowserSupport, isLegacyTvBrowser } from "./utils/legacyBrowser";

installLegacyBrowserSupport();

class StartupErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Memoriya could not render on this browser.', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#070a12', color: '#fff', fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
          <section style={{ maxWidth: 520 }}>
            <h1 style={{ margin: '0 0 12px', fontSize: 26 }}>Memoriya could not start</h1>
            <p style={{ margin: '0 0 18px', color: 'rgba(255,255,255,.68)', lineHeight: 1.6 }}>
              This TV browser is missing a feature required by the current page. Please update the TV browser, then reload Memoriya.
            </p>
            <button type="button" onClick={() => window.location.reload()} style={{ padding: '12px 18px', border: 0, borderRadius: 999, background: '#ffd08a', color: '#171316', fontWeight: 800 }}>
              Reload Memoriya
            </button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StartupErrorBoundary>
      <App />
    </StartupErrorBoundary>
  </StrictMode>
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    if (isLegacyTvBrowser()) {
      // Older TV WebViews can keep a broken service-worker fetch handler alive
      // after a deployment. Let the browser use the network directly.
      navigator.serviceWorker.getRegistrations()
        .then(registrations => Promise.all(registrations.map(registration => registration.unregister())))
        .catch(() => undefined);
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
