/**
 * @ats/ui — kamu yüzeyi (bileşen-düzeyi curated snapshot; MFE START GATE).
 * Vendor kök index'i BİLİNÇLE kopyalanmadı (kirli dizinleri re-export ediyordu);
 * bu yüzey yalnız kopyalanan-temiz alanları açar. Yasaklı vendor yüzeyleri YOK (liste: scripts/check-ui-snapshot.mjs).
 */
export * from "./primitives";
export * from "./components";
export * from "./form";
export * from "./a11y";
export * from "./hooks";
export * from "./icons";
export * from "./headless";
export * from "./providers";
export * from "./tokens";
export * from "./patterns";
export * from "./blocks";

// star-export çakışmalarının açık çözümü (TS2308): kanonik kaynak pinlenir
export { TabItem } from "./components";
export { OverlayCloseReason } from "./primitives";
