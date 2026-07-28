import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  build: {
    lib: {
      entry: "src/vendor/jsqr-entry.js",
      formats: ["es"],
      fileName: () => "jsqr-bundle.js"
    },
    outDir: "public/vendor",
    emptyOutDir: false
  }
});
