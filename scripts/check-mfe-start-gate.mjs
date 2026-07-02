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
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(REPO, "docs/frontend/mfe-start-gate.md");

// Codex blocker-1: "AG-Grid sessizce dahil edilemez" iddiası yalnız doküman-tokeni değil,
// GERÇEK snapshot dosya yüzeyinde de zorlanır. Snapshot dizini henüz yoksa no-op;
// varsa dosya içeriklerinde ag-grid/x-data-grid tokeni → fail (doc+guard birlikte değişmeden alınamaz).
const SNAPSHOT_ROOTS = ["packages/ui", "ats/packages/ui", "web/packages/ui"];
const AGGRID_TOKEN = /ag-grid|@ag-grid|x-data-grid|AgGrid/;
const MAX_FILE_BYTES = 512 * 1024;

function collectSnapshotFiles() {
  const files = [];
  for (const root of SNAPSHOT_ROOTS) {
    const abs = join(REPO, root);
    if (!existsSync(abs)) continue;
    walk(abs, files);
  }
  return files;
}

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      walk(p, out);
    } else if (st.size <= MAX_FILE_BYTES) {
      try {
        out.push({ path: p, content: readFileSync(p, "utf8") });
      } catch {
        // binary/okumaz dosya — token taraması metin dosyalarını hedefler
      }
    }
  }
}

function runChecks(text, snapshotFiles = []) {
  const errors = [];
  // Kaynak-repo pini YAPISAL kontrol edilir (backtick'li owner/repo tablo satırı).
  // Repo adı literal'i bilinçli olarak bu script'te YOK: ATS-0001 boundary-guard kod
  // dosyalarında platform-repo referansı yasaklar (ADR-0001); provenance pini dokümanda yaşar.
  if (!/\| Kaynak repo \| `[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+` \|/.test(text)) {
    errors.push("kaynak repo satırı eksik (| Kaynak repo | `owner/repo` | formatı şart)");
  }
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
  // lisans overclaim'i yasak: dependency-review'un lisans-gate olduğu iddia edilemez (Codex blocker-2)
  if (/dependency-review[^]*?\(lisans\/vuln\)/.test(text)) {
    errors.push("dependency-review 'lisans gate' overclaim'i yasak (yalnız vuln kapısı; dürüst sınır cümlesi şart)");
  }
  // GERÇEK snapshot yüzeyi: ag-grid tokeni dosyalarda geçemez (dizin yoksa no-op)
  for (const f of snapshotFiles) {
    const m = f.content.match(AGGRID_TOKEN);
    if (m) {
      errors.push(`snapshot dosyasında AG-Grid tokeni "${m[0]}" (sessiz dahil YASAK; doc+guard birlikte değişir): ${f.path}`);
      break;
    }
  }
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
    ["license-overclaim", mut("**vuln kapısıdır** (fail-on-severity: high)", "kapıdır (lisans/vuln)")],
    ["source-repo-row-removed", mut("| Kaynak repo |", "| Kaynak |")],
  ];
  const failed = [];
  for (const [name, txt] of cases) if (runChecks(txt).length === 0) failed.push(name);
  // snapshot-yüzeyi vektörü: sahte dosya listesinde ag-grid tokeni → fail beklenir
  if (runChecks(base, [{ path: "packages/ui/package.json", content: '"ag-grid-enterprise": "^31.0.0"' }]).length === 0) {
    failed.push("aggrid-in-snapshot-file");
  }
  return failed;
}

const errors = runChecks(readFileSync(FILE, "utf8"), collectSnapshotFiles());
for (const n of selfTest()) errors.push(`SELF-TEST kaçtı: ${n}`);

if (errors.length > 0) {
  console.error("mfe-start-gate drift guard FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("mfe-start-gate OK — SHA dondurulmuş (40-hex) + kaynak-repo satırı yapısal pinli, 5 şart bölümü + checklist tam, curated/dışlanan listeler pinli, AG-Grid hem doküman-tokeni hem GERÇEK snapshot-dosya taramasıyla dışarıda, lisans-overclaim yasak, namespace @ats/ui, manuel re-snapshot; self-test 9 negatif vektör fail ediyor.");
