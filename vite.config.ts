import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
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
