/* lib — curated: yalnız auth token-resolver yardımcıları (grid-varyant ve vendor-lisans yardımcıları bilinçle dışlandı — MFE START GATE). */
export {
  getResolvedToken,
  registerTokenResolver,
  resetTokenResolver,
  buildAuthHeaders,
} from "./auth";
export type { TokenResolver } from "./auth";
