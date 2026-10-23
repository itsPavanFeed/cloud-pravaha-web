import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the UI proxies API calls to a local control plane.
// PRAVAHA_API is the central plane (default: scripts/dev-up.sh). If it uses the dev CA,
// certificate checks are relaxed for this local proxy only.
const target = process.env.PRAVAHA_API ?? "http://127.0.0.1:8090";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target, changeOrigin: true, secure: false },
      "/.well-known": { target, changeOrigin: true, secure: false },
    },
  },
  build: { outDir: "dist", sourcemap: false },
});
