#!/usr/bin/env node
/**
 * Security control-map drift guard (ATS-0007 · Codex 019f13b1 round-2 #7).
 *
 *  1. Required kontrol alanları (sentinel) mevcut + tekil.
 *  2. Statü sözlük-geçerli; YASAK cert/uygunluk ifadeleri (EN+TR) görünemez (No Fake Work).
 *  3. CROSS-DOC binding: her satırın "Our control" hücresi en az bir threat-register'da MEVCUT
 *     T-/P- ID'sine VEYA mevcut repo-path'e VEYA PRIVATE:<path> VEYA accepted-risk'e bağlanır
 *     (kanıtsız kontrol iddiası / kopuk threat-ID reddedilir).
 *  4. enforced (CI) → satırda mevcut repo-path (over-claim guard).
 *  5. Gömülü self-test (durable regression).
 *
 * Bağımsız (npm dep YOK), CI job `control-map-guard`.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(REPO, "docs/security/control-map.md");
const TR_FILE = join(REPO, "docs/security/threat-register.md");

const STATUS = new Set(["enforced (CI)", "gate-locked", "design", "owner-evidence-required", "accepted-risk"]);
const FORBIDDEN = /\b(certified|compliant|conformity|audited|attested|sertifikalı|uyumludur|iso 27001 certified|soc 2 type)\b/i;
const REQUIRED = [
  "Erişim kontrolü", "Kriptografi", "Tenant izolasyon", "Loglama", "Tedarik zinciri",
  "Açıklık", "AI-spesifik", "Veri-mahremiyet", "Olay müdahale", "İş sürekliliği",
  "Değişiklik yönetimi", "İnsan gözetimi", "Girdi doğrulama", "Medya/attachment",
];

// threat-register'daki MEVCUT ID'ler (cross-doc binding kaynağı)
const trText = readFileSync(TR_FILE, "utf8");
const VALID_IDS = new Set([...trText.matchAll(/\*\*((?:T|P)-[A-Za-z0-9]+)\*\*/g)].map((m) => m[1]));

const text = readFileSync(FILE, "utf8");
const lines = text.split("\n");
const errors = [];

function checkRow(rowCells, label) {
  const control = rowCells[2], status = rowCells[3];
  if (!STATUS.has(status)) errors.push(`${label}: geçersiz statü "${status}"`);
  // binding: T-/P- ID (threat-register'da mevcut) | repo-path | PRIVATE:<path> | accepted-risk
  const ids = [...control.matchAll(/\b((?:T|P)-[A-Za-z0-9]+)\b/g)].map((m) => m[1]);
  for (const id of ids) if (!VALID_IDS.has(id)) errors.push(`${label}: kopuk threat-register ID "${id}"`);
  const repoPaths = [...control.matchAll(/`([^`]+\/[^`]+)`/g)].map((m) => m[1]).filter((p) => existsSync(join(REPO, p)));
  const hasPrivate = /PRIVATE:\S+\/\S+/.test(control);
  const hasAccepted = /accepted-risk/.test(control);
  const bound = ids.some((id) => VALID_IDS.has(id)) || repoPaths.length > 0 || hasPrivate || hasAccepted;
  if (!bound) errors.push(`${label}: "Our control" bir kanıta bağlı değil (threat-ID/path/PRIVATE/accepted-risk): "${control}"`);
  // enforced → mevcut repo-path (residual+control hücrelerinde)
  if (status === "enforced (CI)") {
    const allPaths = [...(`${control} ${rowCells[4]}`).matchAll(/`([^`]+\/[^`]+)`/g)].map((m) => m[1]);
    if (!allPaths.some((p) => existsSync(join(REPO, p)))) errors.push(`${label}: enforced (CI) ama mevcut repo-path yok`);
  }
}

const seen = new Set();
for (const line of lines) {
  const t = line.trim();
  if (!/^\|\s*\*\*[A-ZÇİ]/.test(t)) continue; // | **Kontrol alanı** | ...
  const cells = t.split("|").slice(1, -1).map((c) => c.trim());
  if (cells.length < 5) { errors.push(`az hücre: ${t.slice(0, 40)}`); continue; }
  const area = cells[0].replace(/\*\*/g, "").trim();
  if (area === "Statü" || cells[1] === "Çerçeve refs") continue; // header
  if (seen.has(area)) errors.push(`duplicate kontrol alanı: ${area}`);
  seen.add(area);
  checkRow(cells, area);
}

// forbidden cert ifadeleri (YASAK-tanım satırı hariç)
lines.forEach((l, i) => {
  if (/YASAK ifadeler|sertifika\/uygunluk iddiası/.test(l)) return;
  if (FORBIDDEN.test(l)) errors.push(`YASAK cert/uygunluk ifadesi satır ${i + 1}: "${l.trim().slice(0, 50)}"`);
});

for (const r of REQUIRED) if (![...seen].some((a) => a.includes(r))) errors.push(`eksik kontrol alanı: ${r}`);

// gömülü self-test
function selfTest() {
  const baseRow = ["**X**", "ISO", "T-E1", "gate-locked", "r"];
  const T = (cells) => { const e2 = []; const save = errors.length; checkRow(cells, "ST"); const got = errors.length > save; errors.length = save; return got; };
  const fails = [];
  if (!T(["**X**", "ISO", "T-ZZ9", "gate-locked", "r"])) fails.push("kopuk-id-kaçtı");
  if (!T(["**X**", "ISO", "no-binding-here", "gate-locked", "r"])) fails.push("binding-yok-kaçtı");
  if (!T(["**X**", "ISO", "T-E1", "bogus-status", "r"])) fails.push("gecersiz-status-kaçtı");
  if (!T(["**X**", "ISO", "T-E1", "enforced (CI)", "path yok"])) fails.push("enforced-path-yok-kaçtı");
  if (T(baseRow)) fails.push("gecerli-satir-bloklandı");
  return fails;
}
for (const f of selfTest()) errors.push(`SELF-TEST: ${f}`);

if (errors.length > 0) {
  console.error("control-map drift guard FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`control-map OK — ${seen.size} kontrol alanı; cross-doc threat-register binding (${VALID_IDS.size} geçerli ID); cert/uygunluk overclaim yok; self-test geçti.`);
