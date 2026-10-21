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
  // Android 9 TVs can ship with older Chromium/WebView builds. Transpile
  // optional chaining, nullish coalescing, and similar syntax so the app can
  // parse before any Story Mode code runs.
  build: {
    target: 'es2017',
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    // Allow the app to be opened through VS Code / remote dev tunnels.
    allowedHosts: ["ljs91hvv-5173.inc1.devtunnels.ms", ".devtunnels.ms"],
  },
});
