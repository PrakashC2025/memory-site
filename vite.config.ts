import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Android 8/9 TVs can ship with Chromium 50–66 WebViews. Keep the emitted
  // syntax within the ES2015 range so the page can parse before Story Mode
  // or the Drive client starts.
  build: {
    target: 'es2015',
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    // Listen on the local Wi-Fi interface so another device on the same
    // network can open the development site.
    host: true,
    port: 5173,
    // Allow the app to be opened through VS Code / remote dev tunnels and the
    // Arena live-preview proxy (port-5173-*.e2b.app).
    allowedHosts: ["ljs91hvv-5173.inc1.devtunnels.ms", ".devtunnels.ms", ".e2b.app"],
  },
});
