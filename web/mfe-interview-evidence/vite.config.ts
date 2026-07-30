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

// Prod'da uygulama paylaşılan origin'in tamamına değil tek bir prefix'e servis
// edilir; asset URL'leri o prefix'i taşımalı yoksa deep-link'te 404 olurlar.
// Dev sunucusu köke bağlı kalır — geliştirici akışı değişmez.
const PROD_BASE_PATH = "/ats/interview-evidence/";

// /api -> app-boot (dev'de vite proxy; prod'da imajın kendi nginx'i, bkz.
// nginx.conf.template — uygulama her iki durumda da /api/v1/... çağırır).
export default defineConfig(({ command }) => ({
  base: command === "build" ? PROD_BASE_PATH : "/",
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
}));
