#!/usr/bin/env node
/**
 * Security control-map drift guard (ATS-0007 · Codex 019f17f1 REVISE absorb).
 *
 *  1. Required kontrol alanları (sentinel) mevcut + tekil.
 *  2. Statü sözlük-geçerli (her '/'-segment); YASAK cert/uygunluk ifadeleri (EN+TR) görünemez.
 *  3. CROSS-DOC binding: her satır en az bir threat-register'da MEVCUT T-/P- ID içerir
 *     (kopuk-ID veya threat-bağsız satır FAIL). repo-path/PRIVATE yalnız EK kanıt (tek başına binding değil).
 *  4. enforced (CI) (karma dahil) → satırda mevcut repo-path (over-claim guard).
 *  5. Gömülü self-test (forbidden-cert dahil; durable regression).
 *
 * Bağımsız (npm dep YOK), CI job `control-map-guard`.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(REPO, "docs/security/control-map.md");
const TR_FILE = join(REPO, "docs/security/threat-register.md");

const STATUS_SEG = new Set(["enforced (CI)", "gate-locked", "design", "owner-evidence-required", "accepted-risk"]);
const FORBIDDEN = /\bcertified|\bcertification|\bcompliant|\bcompliance|\bconformity|\bconformant|\baudited|audit report|\battested|attestation|soc ?2 type|iso ?27001 certif|sertifik|uyumlu|denetlendi/i;
const REQUIRED = [
  "Erişim kontrolü", "Erişim gözden geçirme", "Kriptografi", "Tenant izolasyon", "Loglama",
  "Tedarik zinciri", "Tedarikçi", "Açıklık", "AI-spesifik", "Veri-mahremiyet", "Veri ikametgâhı",
  "Olay müdahale", "İş sürekliliği", "Değişiklik yönetimi", "İnsan gözetimi", "Girdi doğrulama", "Medya",
];

const trText = readFileSync(TR_FILE, "utf8");
const VALID_IDS = new Set([...trText.matchAll(/\*\*((?:T|P)-[A-Za-z0-9]+)\*\*/g)].map((m) => m[1]));

const text = readFileSync(FILE, "utf8");
const lines = text.split("\n");
const errors = [];

function checkRow(cells, label) {
  const control = cells[2], status = cells[3], residual = cells[4] || "";
  for (const seg of status.split("/").map((s) => s.trim())) if (!STATUS_SEG.has(seg)) errors.push(`${label}: geçersiz statü segment "${seg}"`);
  // binding: en az bir MEVCUT threat-register ID zorunlu
  const ids = [...control.matchAll(/\b((?:T|P)-[A-Za-z0-9]+)\b/g)].map((m) => m[1]);
  for (const id of ids) if (!VALID_IDS.has(id)) errors.push(`${label}: kopuk threat-register ID "${id}"`);
  if (!ids.some((id) => VALID_IDS.has(id))) errors.push(`${label}: "Our control" mevcut threat-register ID içermiyor (binding zorunlu): "${control}"`);
  if (status.includes("enforced (CI)")) {
    const paths = [...(`${control} ${residual}`).matchAll(/`([^`]+\/[^`]+)`/g)].map((m) => m[1]);
    if (!paths.some((p) => existsSync(join(REPO, p)))) errors.push(`${label}: enforced (CI) ama mevcut repo-path yok`);
  }
}

const seen = new Set();
for (const line of lines) {
  const t = line.trim();
  if (!/^\|\s*\*\*[A-ZÇİ]/.test(t)) continue;
  const cells = t.split("|").slice(1, -1).map((c) => c.trim());
  if (cells.length < 5) { errors.push(`az hücre: ${t.slice(0, 40)}`); continue; }
  const area = cells[0].replace(/\*\*/g, "").trim();
  if (cells[1] === "Çerçeve refs") continue;
  if (seen.has(area)) errors.push(`duplicate kontrol alanı: ${area}`);
  seen.add(area);
  checkRow(cells, area);
}

// forbidden cert (YASAK-tanım satırı hariç)
lines.forEach((l, i) => {
  if (/YASAK ifadeler|sertifika\/uygunluk iddiası|certified\/compliance/.test(l)) return;
  if (FORBIDDEN.test(l)) errors.push(`YASAK cert/uygunluk ifadesi satır ${i + 1}: "${l.trim().slice(0, 50)}"`);
});

for (const r of REQUIRED) if (![...seen].some((a) => a.includes(r))) errors.push(`eksik kontrol alanı: ${r}`);

// gömülü self-test (checkRow + forbidden)
function runRow(cells) { const save = errors.length; checkRow(cells, "ST"); const got = errors.length > save; errors.length = save; return got; }
function selfTest() {
  const ok = ["**X**", "ISO", "T-E1", "gate-locked", "r"];
  const fails = [];
  if (!runRow(["**X**", "ISO", "T-ZZ9", "gate-locked", "r"])) fails.push("kopuk-id-kaçtı");
  if (!runRow(["**X**", "ISO", "no-binding", "gate-locked", "r"])) fails.push("binding-yok-kaçtı");
  if (!runRow(["**X**", "ISO", "T-E1", "bogus", "r"])) fails.push("gecersiz-status-kaçtı");
  if (!runRow(["**X**", "ISO", "T-E1", "enforced (CI)", "path yok"])) fails.push("enforced-path-yok-kaçtı");
  if (runRow(ok)) fails.push("gecerli-satir-bloklandı");
  if (runRow(["**X**", "ISO", "T-I1 · P-D1", "enforced (CI) / gate-locked", "`scripts/check-control-map.mjs`"])) fails.push("gecerli-karma-bloklandı");
  // forbidden-cert path
  for (const w of ["this is certified", "we are compliant", "SOC2 Type II", "ISO 27001 certification", "denetlendi", "sertifika aldık", "sistem uyumludur"]) {
    if (!FORBIDDEN.test(w)) fails.push("forbidden-kaçtı:" + w);
  }
  return fails;
}
for (const f of selfTest()) errors.push(`SELF-TEST: ${f}`);

if (errors.length > 0) {
  console.error("control-map drift guard FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`control-map OK — ${seen.size} kontrol alanı; her satır cross-doc threat-register binding (${VALID_IDS.size} geçerli ID); cert/uygunluk overclaim yok; self-test geçti.`);
