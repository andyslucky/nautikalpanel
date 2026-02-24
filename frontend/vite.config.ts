import { defineConfig } from 'vite';
// @ts-ignore
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: "http://localhost:9090"
      }
    }
  }
});
