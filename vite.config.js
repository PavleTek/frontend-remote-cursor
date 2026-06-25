import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function healthCheckPlugin() {
  return {
    name: "health-check",
    configurePreviewServer(server) {
      server.middlewares.use("/health", (_req, res) => {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            ok: true,
            service: "remote-cursor-frontend",
            timestamp: new Date().toISOString(),
          }),
        );
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), healthCheckPlugin()],
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 4173,
    host: true,
  },
});
