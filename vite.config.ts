import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

function localLeaderboardApi(): Plugin {
  return {
    name: "dungeon-local-leaderboard-api",
    async configureServer(server) {
      const { createLeaderboardMiddleware } = await import("./server/leaderboard/middleware");
      const api = await createLeaderboardMiddleware();
      server.middlewares.use(api.handle);
      server.httpServer?.once("close", () => api.close());
    },
    async configurePreviewServer(server) {
      const { createLeaderboardMiddleware } = await import("./server/leaderboard/middleware");
      const api = await createLeaderboardMiddleware();
      server.middlewares.use(api.handle);
      server.httpServer?.once("close", () => api.close());
    },
  };
}

export default defineConfig({
  plugins: [localLeaderboardApi()],
  build: {
    rollupOptions: {
      input: {
        engine: resolve(__dirname, "index.html"),
        forge: resolve(__dirname, "forge.html"),
        reliquary: resolve(__dirname, "reliquary.html"),
      },
    },
  },
});
