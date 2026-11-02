import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2015',
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: ["1js91hvv-5173.inc1.devtunnels.ms", ".devtunnels.ms", ".e2b.app"],
    proxy: {
      '/__memoriya-cast': {
        target: 'ws://127.0.0.1:8787',
        ws: true,
      },
      '/_memoriya-cast': {
        target: 'ws://127.0.0.1:8787',
        ws: true,
      },
    },
  },
});
