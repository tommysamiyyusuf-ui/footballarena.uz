import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5173,
    // Allow ngrok tunnel hosts to reach the dev server (Vite blocks unknown
    // hosts by default). The Telegram login widget needs a public HTTPS domain.
    allowedHosts: [".ngrok-free.dev", ".ngrok.dev", ".ngrok-free.app", ".ngrok.app", ".ngrok.io"],
    // The API and the WebSocket endpoint are proxied so the browser only ever
    // talks to one origin in development — no CORS preflight, no cookie games.
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: true },
      "/ws": { target: "ws://localhost:8000", ws: true },
      "/media": { target: "http://localhost:8000", changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          charts: ["recharts"],
          query: ["@tanstack/react-query", "axios"],
        },
      },
    },
  },
});
