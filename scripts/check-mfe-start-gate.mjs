#!/usr/bin/env node
/**
 * MFE START GATE drift guard (ATS-0008 D-C sabitlemesi).
 *
 * docs/frontend/mfe-start-gate.md:
 *  1. Snapshot SHA: 40-hex, backtick'li, kaynak repo satırıyla birlikte (SHA silinir/kısaltılır → fail).
 *  2. 5 zorunlu bölüm başlığı + gate-checklist'in 5 maddesi de işaretli ([x]).
 *  3. Curated tablo non-empty + dışlananlar satırı (x-data-grid dışlaması) mevcut.
 *  4. AG-Grid dışlama tokeni: "AG Grid Enterprise: bu snapshot'ta YOK" — sessizce içeri alınamaz;
 *     alınacaksa doc + guard birlikte değişir (görünür karar).
 *  5. Namespace pini: @ats/ui + ats/packages/ui.
 *  6. Upstream: "Manuel re-snapshot" tokeni (otomatik-senkron dili yasak).
 *  + gömülü self-test (negatif vektörler fail eder).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(REPO, "docs/frontend/mfe-start-gate.md");

function runChecks(text) {
  const errors = [];
  if (!/`Halildeu\/platform-web`/.test(text)) errors.push("kaynak repo satırı eksik");
  if (!/\*\*Snapshot commit SHA\*\* \| `[0-9a-f]{40}`/.test(text)) {
    errors.push("snapshot SHA eksik/40-hex değil (dondurulmuş nokta şart)");
  }
  for (const h of ["## 1. Kaynak repo", "## 2. Curated paket", "## 3. Namespace + ownership",
      "## 4. Lisans", "## 5. Upstream güncelleme politikası", "## Gate durumu"]) {
    if (!text.includes(h)) errors.push(`zorunlu bölüm eksik: "${h}"`);
  }
  const checked = (text.match(/- \[x\] \d\./g) || []).length;
  if (checked !== 5) errors.push(`gate-checklist 5 işaretli madde olmalı (bulunan: ${checked})`);
  if (!/\| `packages\/design-system` \|/.test(text)) errors.push("curated tablo design-system satırı eksik");
  if (!/BİLİNÇLE KAPSAM DIŞI[^]*x-data-grid/.test(text)) errors.push("dışlananlar satırı (x-data-grid) eksik");
  if (!text.includes("AG Grid Enterprise: bu snapshot'ta YOK")) {
    errors.push("AG-Grid dışlama tokeni eksik (sessizce içeri alınamaz — doc+guard birlikte değişir)");
  }
  if (!text.includes("`@ats/ui`") || !text.includes("`ats/packages/ui`")) errors.push("namespace pini eksik");
  if (!/Manuel re-snapshot|manuel re-snapshot/i.test(text)) errors.push("upstream manuel re-snapshot tokeni eksik");
  if (/otomatik senkron akışı VAR|auto-sync enabled/i.test(text)) errors.push("otomatik-senkron dili yasak");
  return errors;
}

function selfTest() {
  const base = readFileSync(FILE, "utf8");
  const mut = (a, b) => base.replace(a, b);
  const cases = [
    ["sha-shortened", base.replace(/`[0-9a-f]{40}`/, "`d5db9b8`")],
    ["section-removed", mut("## 5. Upstream güncelleme politikası", "## 5. Politika")],
    ["checklist-unchecked", mut("- [x] 4. Lisans netliği", "- [ ] 4. Lisans netliği")],
    ["aggrid-silently-included", mut("AG Grid Enterprise: bu snapshot'ta YOK", "AG Grid dahil edildi")],
    ["namespace-changed", base.replaceAll("`@ats/ui`", "`@acme/ui`")],
    ["exclusion-row-removed", mut("BİLİNÇLE KAPSAM DIŞI", "Dahil edilenler")],
  ];
  const failed = [];
  for (const [name, txt] of cases) if (runChecks(txt).length === 0) failed.push(name);
  return failed;
}

const errors = runChecks(readFileSync(FILE, "utf8"));
for (const n of selfTest()) errors.push(`SELF-TEST kaçtı: ${n}`);

if (errors.length > 0) {
  console.error("mfe-start-gate drift guard FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("mfe-start-gate OK — SHA dondurulmuş (40-hex), 5 şart bölümü + checklist tam, curated/dışlanan listeler pinli (AG-Grid dışlama tokeni), namespace @ats/ui, manuel re-snapshot; self-test 6 negatif vektör fail ediyor.");
