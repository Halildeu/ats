import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /api -> app-boot (dev; CORS'suz). Prod serving/deploy ayrı wiring dilimi.
export default defineConfig({
  plugins: [react()],
  resolve: { preserveSymlinks: true },
  build: {
    rollupOptions: {
      output: {
        // vendor ayrı chunk: bundle-scan guard'ı YALNIZ uygulama+ui chunk'ını tarar
        // (react-dom'un kendi 'email/audio/video' element-tabloları false-positive olmasın)
        manualChunks: { vendor: ["react", "react-dom"] },
      },
    },
  },
  server: {
    port: 5183,
    proxy: { "/api": { target: "http://127.0.0.1:8080", changeOrigin: false } },
  },
});
