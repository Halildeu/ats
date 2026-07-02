#!/usr/bin/env node
/**
 * KVKK crosswalk drift guard'ı: docs/compliance/kvkk-p1-crosswalk.md
 *  1. Zorunlu K1..K10 satırları + zorunlu bölümler + hukuki-görüş-değildir disclaimer'ı.
 *  2. Kanıt kolonundaki HER backtick'li repo-path GERÇEKTEN VAR (kod silinir/taşınırsa
 *     crosswalk yalan söylemesin — self-attestation değil makine-doğrulama).
 *  3. Durum sözlüğü kapalı: enforced (CI) | enforced (repo-test) (başka iddia giremez —
 *     'sertifikalı/uyumlu' overclaim'i yasak).
 *  4. Açık-kalemler bölümü mevcut (dürüst sınır silinemez).
 *  + gömülü self-test.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(REPO, "docs/compliance/kvkk-p1-crosswalk.md");

const STATUS_ALLOWED = new Set(["enforced (CI)", "enforced (repo-test)"]);

export function runChecks(text, pathExists) {
  const errors = [];
  if (!/HUKUKİ GÖRÜŞ DEĞİLDİR/.test(text)) {
    errors.push("hukuki-görüş-değildir disclaimer'ı zorunlu");
  }
  for (const h of ["## 1. Yükümlülük → Mekanizma → Kanıt matrisi",
      "## 2. Bilinen açık kalemler", "## 3. Standart-hizalama bağlantıları"]) {
    if (!text.includes(h)) errors.push(`zorunlu bölüm eksik: "${h}"`);
  }
  for (let i = 1; i <= 11; i++) {
    if (!new RegExp(`\\| K${i} \\|`).test(text)) errors.push(`zorunlu satır eksik: K${i}`);
  }
  // matris satırlarındaki durum sözlüğü kapalı
  for (const row of text.matchAll(/\| K\d+ \|[^\n]*\| ([^|\n]+) \|\n/g)) {
    const status = row[1].trim();
    if (!STATUS_ALLOWED.has(status)) {
      errors.push(`kapalı durum-sözlüğü dışı iddia: "${status}" (yalnız enforced (CI)|enforced (repo-test))`);
    }
  }
  // Kanıt-TUTARLILIK (Codex #70 blocker-3): repo-test satırı TEST path'i, CI satırı guard path'i içermeli
  for (const row of text.matchAll(/\| K\d+ \|[^\n]*\| ([^|\n]+) \|\n/g)) {
    const status = row[1].trim();
    if (status === "enforced (repo-test)" && !/src\/test\/[^`]*Test\.java/.test(row[0])) {
      errors.push(`repo-test satırında TEST kanıtı yok: ${row[0].slice(0, 40)}...`);
    }
    if (status === "enforced (CI)" && !/scripts\/check-[a-z-]+\.mjs/.test(row[0])) {
      errors.push(`CI satırında guard kanıtı yok: ${row[0].slice(0, 40)}...`);
    }
  }
  // Kanıt path'leri gerçek mi — matris satırlarındaki backtick'li repo-path'ler
  for (const row of text.matchAll(/\| K\d+ \|[^\n]+\n/g)) {
    for (const m of row[0].matchAll(/`([^`]+)`/g)) {
      const p = m[1];
      if (!/^(backend|web|docs|scripts)\//.test(p)) continue; // repo-path olmayan backtick'ler serbest
      if (!pathExists(p)) errors.push(`Kanıt path'i YOK (crosswalk yalan söylüyor): ${p}`);
    }
  }
  return errors;
}

function selfTest(base) {
  const failed = [];
  const yes = () => true;
  const mut = (a, b) => base.replace(a, b);
  const cases = [
    ["disclaimer-removed", mut("HUKUKİ GÖRÜŞ DEĞİLDİR", "uygunluk beyanı"), yes],
    ["row-removed", mut("| K3 |", "| X3 |"), yes],
    ["open-items-removed", mut("## 2. Bilinen açık kalemler", "## 2. Kapanmış"), yes],
    ["overclaim-status", mut("enforced (repo-test) |\n| K3", "KVKK-sertifikalı |\n| K3"), yes],
    ["missing-evidence-path", base, (p) => !p.includes("DsrService")],
    ["k11-transfer-removed", mut("| K11 |", "| X11 |"), yes],
    ["repo-test-without-test", mut("`backend/app-boot/src/test/java/com/ats/app/ExportDsarApiTest.java` | enforced (repo-test)", "| enforced (repo-test)"), yes],
  ];
  for (const [name, txt, pe] of cases) {
    if (runChecks(txt, pe).length === 0) failed.push(name);
  }
  return failed;
}

const text = readFileSync(FILE, "utf8");
const errors = runChecks(text, (p) => existsSync(join(REPO, p)));
for (const n of selfTest(text)) errors.push(`SELF-TEST kaçtı: ${n}`);

if (errors.length > 0) {
  console.error("kvkk-crosswalk guard FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("kvkk-crosswalk OK — K1..K11 tam, disclaimer + açık-kalemler mevcut, durum-sözlüğü kapalı, TÜM kanıt-path'leri gerçekten var; self-test 7 negatif vektör fail ediyor.");
