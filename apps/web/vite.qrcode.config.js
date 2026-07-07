import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  build: {
    lib: {
      entry: "src/vendor/qrcode-entry.js",
      formats: ["es"],
      fileName: () => "qrcode-bundle.js"
    },
    outDir: "public/vendor",
    emptyOutDir: false
  }
});
