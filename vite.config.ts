import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": "/client/src",
      "@shared": "/shared",
    },
  },
  root: ".",
  publicDir: "client/public",
  build: {
    outDir: "dist/public",
    emptyOutDir: true,
  },
});
