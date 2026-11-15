import { defineConfig } from "vite";

// Relative base: an extension page is served from chrome-extension://<id>/, not from a domain root.
// Only index.html is built; compare.html is a dev-only tool.
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: { input: { index: "index.html" } },
  },
});
