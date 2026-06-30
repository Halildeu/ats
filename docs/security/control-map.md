# Security Control Map (ISO 27001:2022 / SOC 2 TSC / OWASP → threat-register)

> **Public · living document.** InfoSec/procurement **güvenlik soru-formu (questionnaire)** yüzeyi: yaygın çerçevelerin (ISO 27001:2022 Annex A · SOC 2 Trust Services Criteria · OWASP ASVS/LLM Top-10) kontrol alanlarını ürünün [docs/security/threat-register.md](./threat-register.md) ID'lerine + duruma + residual'a eşler.
> **SERTİFİKA/UYGUNLUK BEYANI DEĞİL (No Fake Work):** Bu map "control intent + bugünkü kanıt + gate durumu + residual" gösterir; sertifika/uygunluk iddiası YOK (guard yasaklar). ISO/SOC2 belgelendirmesi owner-gated + bağımsız denetçi işi.
> **Drift guard:** `scripts/check-control-map.mjs` (CI `control-map-guard`) — her kontrol mevcut bir threat-register ID'sine veya repo-path'e veya `accepted-risk`'e bağlı (kanıtsız kontrol iddiası reddedilir).

## 0. Statü sözlüğü

| Statü | Anlam |
|---|---|
| `enforced (CI)` | Bugün CI guard/test ile zorlanır (repo path'e bağlı). |
| `gate-locked` | Kontrol tasarımı kabul; kodu P1/G0 sonrası. |
| `design` | Karar verildi, kod öncesi. |
| `owner-evidence-required` | Owner/operatör süreç kanıtı gerekir (DPIA, IR drill). |
| `accepted-risk` | Bilinçli + tarihli kabul (threat-register §6). |

> **YASAK ifadeler** (guard reddeder): sertifika/uygunluk iddiası eşanlamlıları (EN+TR); bu map readiness değil bile değil — yalnız control→threat eşlemesi; sertifika denetçi+owner işi.

## 1. Kontrol alanı → çerçeve → threat-register → durum

| Kontrol alanı | Çerçeve refs | Our control (threat-register) | Statü | Residual |
|---|---|---|---|---|
| **Erişim kontrolü / least-privilege** | ISO A.5.15/A.8.2-3 · SOC2 CC6 · ASVS V1/V4 | T-E1 · T-S1 · T-S2 | gate-locked | RBAC matris + break-glass dual-control runtime P1 |
| **Kriptografi / key-management** | ISO A.8.24 · SOC2 CC6.1 · ASVS V6 | T-I4 · T-T1 | gate-locked | per-tenant KMS + rotation + erasure salt-key P1 |
| **Tenant izolasyon / veri-segregasyon** | ISO A.8.3 · SOC2 CC6.6 | T-I1 · P-D1 | enforced (CI) | `backend/contracts-java/src/test/java/com/ats/contracts/ContractTest.java`; storage scoping P1 |
| **Loglama & izleme** | ISO A.8.15-16 · SOC2 CC7.2 · ASVS V7 | T-R1 · T-R2 · T-I6 | enforced (CI) | `scripts/check-event-taxonomy.mjs`; runtime emisyon P1 |
| **Tedarik zinciri / güvenli SDLC** | ISO A.8.25-28 · SOC2 CC8 · ASVS V14 | T-T3a · T-T3b | enforced (CI) | `.github/workflows/security.yml` (gitleaks+dep-review); SBOM/signing P3 |
| **Açıklık (vuln) yönetimi** | ISO A.8.8 · SOC2 CC7.1 | T-T3a | enforced (CI) | `.github/workflows/security.yml`; container/dep scan SLA P3 |
| **AI-spesifik (prompt-injection/output-leak)** | OWASP LLM Top-10 · EU AI Act Art.15 | T-E2 · T-I2 · T-T2 | gate-locked | içerik-veri/talimat ayrımı + output PII-guard P1 |
| **Veri-mahremiyet / DSAR / retention** | ISO A.5.34 · SOC2 P · KVKK | P-U1 · P-L1 · T-I5 | design | `docs/privacy/data-lifecycle-register.md`; DSAR/retention engine P1 |
| **Olay müdahale (incident response)** | ISO A.5.24-26 · SOC2 CC7.3-5 | T-R2 | owner-evidence-required | IR runbook + tatbikat owner (PRIVATE ats-strategy) |
| **İş sürekliliği / yedekleme** | ISO A.8.13 · SOC2 A1.2 | PRIVATE:ats-strategy/docs/on-prem/deployment-checklist.md | gate-locked | backup/restore drill on-prem checklist §6 (PRIVATE); managed-mode P1 |
| **Değişiklik yönetimi / governance** | ISO A.8.32 · SOC2 CC8.1 | T-E3 | enforced (CI) | `scripts/check-boundary.sh`; PR governance gates |
| **İnsan gözetimi / AI governance** | EU AI Act Art.14 · ISO 42001 | T-S3 | gate-locked | `docs/governance/human-oversight-standard.md`; runtime UI P1 |
| **Girdi doğrulama / injection** | ASVS V5 · OWASP Top-10 A03 | T-T2 · T-E2 | gate-locked | input validation + parametrize P1 |
| **Medya/attachment güvenliği** | ISO A.8.7 · ASVS V12 | T-D1 · T-S3 | gate-locked | upload sandbox/scan + boyut limiti P1 |

## 2. Doğrulama (drift-guard `scripts/check-control-map.mjs`)

- Required kontrol alanları (sentinel) mevcut + tekil.
- Statü sözlük-geçerli; **YASAK cert/uygunluk ifadeleri** (EN+TR) map'te görünemez.
- **Cross-doc binding:** her satırın "Our control" hücresi en az bir **threat-register'da MEVCUT** `T-/P-` ID'sine VEYA mevcut repo-path'e VEYA `accepted-risk`'e bağlanır (kanıtsız kontrol iddiası reddedilir; kopuk ID FAIL).
- `enforced (CI)` → residual/control hücresinde mevcut repo-path (over-claim guard).
- Gömülü self-test (durable regression).

## 3. Bağlantı
- [docs/security/threat-register.md](./threat-register.md) (kaynak ID'ler) · [[ATS-0007]] (security/key-mgmt) · data-lifecycle/event-taxonomy/human-oversight registry'leri · on-prem checklist §6 (PRIVATE). PRIVATE: doldurulmuş buyer-questionnaire yanıtları (`ats-strategy`).
