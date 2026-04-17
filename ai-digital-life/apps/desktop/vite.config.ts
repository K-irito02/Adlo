import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  root: path.resolve(__dirname, "renderer"),
  build: {
    outDir: path.resolve(__dirname, "dist/renderer"),
    emptyOutDir: true
  }
});
