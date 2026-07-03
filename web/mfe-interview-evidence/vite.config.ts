import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// vite 6.4.3 güvenlik sertleştirmesi (?raw dosya-servis bypass fix'i) proje-kökü
// dışını fail-closed reddediyor — DOĞRU davranış. Repo-kökü contracts/schemas
// tek-kaynak şema importu ve file:-bağlı @ats/ui için DAR, bilinçli allowlist
// (tüm workspace-root DEĞİL; genişletme = bilinçli PR beyanı).
const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const contractsSchemas = fileURLToPath(new URL("../../contracts/schemas", import.meta.url));
const uiPackage = fileURLToPath(new URL("../../packages/ui", import.meta.url));

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
    fs: { allow: [projectRoot, contractsSchemas, uiPackage] },
    proxy: { "/api": { target: "http://127.0.0.1:8080", changeOrigin: false } },
  },
});
