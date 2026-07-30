import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

function localLeaderboardApi(): Plugin {
  return {
    name: "dungeon-local-leaderboard-api",
    async configureServer(server) {
      const { createLeaderboardMiddleware } = await import("./server/leaderboard/middleware.ts");
      const api = await createLeaderboardMiddleware();
      server.middlewares.use(api.handle);
      server.httpServer?.once("close", () => api.close());
    },
    async configurePreviewServer(server) {
      const { createLeaderboardMiddleware } = await import("./server/leaderboard/middleware.ts");
      const api = await createLeaderboardMiddleware();
      server.middlewares.use(api.handle);
      server.httpServer?.once("close", () => api.close());
    },
  };
}

export default defineConfig(({ mode }) => {
  const codeVerification = mode === "code-verification";
  return {
    plugins: [localLeaderboardApi()],
    server: {
      watch: {
        // QA renders and source masters can contain thousands of large files.
        // Watching them made fresh dev servers exhaust Windows file handles and
        // stop answering while a model matrix was being written.
        ignored: ["**/.scratch/**", "**/assets-source/**"],
      },
    },
    build: {
      // The production build still copies the complete runtime asset catalog.
      // Code-only verification writes to scratch so iteration does not delete
      // and recopy that catalog before checking the Rolldown graph.
      outDir: codeVerification ? ".scratch/build/code" : "dist",
      copyPublicDir: !codeVerification,
      rolldownOptions: {
        input: {
          engine: resolve(import.meta.dirname, "index.html"),
          forge: resolve(import.meta.dirname, "forge.html"),
          reliquary: resolve(import.meta.dirname, "reliquary.html"),
          modelLab: resolve(import.meta.dirname, "model-lab.html"),
        },
      },
    },
  };
});
