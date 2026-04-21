import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/snapshot": "http://localhost:8000",
      "/stats":    "http://localhost:8000",
      "/health":   "http://localhost:8000",
      "/ws": { target: "ws://localhost:8000", ws: true },
    },
  },
});
