# ATS-0003 — KVKK/recording-consent + WORM-vs-deletion ayrımı

- **Durum:** Kabul edildi (cross-AI AGREE — Codex thread 019ef3d9, REVISE→AGREE)
- **Tarih:** 2026-06-23
- **Bağlam kaynağı:** MASTER-PLAN v3.0 §10 + M1-4 + guardrail #4/#9 · rekabet analizi §2.3
- **Karar tipi:** Compliance/veri-mimarisi (gate-safe + MVP-içi)

## Bağlam

Ürünün işlediği temel veri = **mülakat ses/video kaydı + transkript = aday kişisel verisi** (bağlama göre özel-nitelikli içerik barındırabilir). Geçerli rejim: KVKK (yeterlilik kararı YOK → TR-residency avantajı), GDPR, EU AI Act transparency (Art.50, Aug 2026).

3-AI mutabakatı: **consent/recording ürünün MERKEZİNDE, sonradan "compliance pack" olamaz** (M1-4) — ilk pilotta DPO ilk üç soruyu sorar. Ayrıca guardrail #9: **WORM (değiştirilemez audit) ile KVKK silme hakkı gerilimi** — yanlış tasarım "silinemez kişisel veri" yaratır.

## Karar

**Consent/recording domain MVP-içi (P1 floor) + WORM ≠ candidate-deletion ayrımı.**

1. **Consent/recording domain (P1-içi, first-class):**
   - aday + interviewer **disclosure + açık rıza** (ayrı, KVKK İlke 2026/347 uyumlu) + **rıza geri-çekme (withdrawal)**.
   - **recording permission state** her mülakat kaydında zorunlu; izin yoksa işleme yok.
   - retention (saklama) süresi parametrik + otomatik imha timer.
   - **DSR/DSAR workflow** (erişim/silme/taşınabilirlik) + cascading erasure.
   - özel-nitelikli içerik minimizasyonu + TC-Kimlik redaction.
2. **WORM-vs-deletion ayrımı (kritik):**
   - **WORM'da yalnız:** event-metadata, approval/human-oversight kaydı, model/version log, **redacted evidence referansı** + **pseudonymized/HMAC** kimlik (ham PII değil). Bunlar denetim için değişmez.
   - **Hash kişisel-veri tuzağı (Codex REVISE):** linklenebilir hash/metadata KVKK/GDPR'da kişisel-veri sayılabilir → WORM payload **minimizasyon** + aday kimliği **HMAC(salt)** ile pseudonymize + **salt-key destruction** ile silme → **"unlinkable tombstone"** (silme sonrası kayıt bireye geri-bağlanamaz, ama "silme oldu" denetim kanıtı kalır).
   - **Silinebilir (retention-policy ile):** ham transkript, ham medya, çıkarılmış PII. WORM bunları KİLİTLEMEZ → KVKK/GDPR silme hakkı korunur.
   - "Silme" = ham veri imha + salt-key destruction + WORM'da "deleted@T, reason=..., unlinkable" değişmez kanıt (silme **eylemi** denetlenir, **içerik + bağlanabilirlik** yok edilir).
   - **Erasure test (kabul şartı):** silme sonrası hiçbir WORM/log alanından aday bireye re-link edilemediğini kanıtlayan otomatik test.
3. **Multi-jurisdiction:** recording law (tek-taraf/çift-taraf rıza, işyeri kayıt kuralı) ülke-bazlı parametre; varsayılan en-katı (çift-taraf + açık rıza).

## Sonuçlar

**Olumlu:** procurement-ready; DPO itirazlarını baştan karşılar; silme hakkı ile audit aynı anda. EU AI Act explainability için redacted-evidence WORM kanıtı.
**Olumsuz:** domain modeli karmaşası (consent state machine + retention engine); ülke-bazlı parametre bakımı; redaction kalitesi kritik.

## Değerlendirilen alternatifler

- **(A) Consent'i P3'e bırak** — RED (consensus): regüle pilot satılamaz.
- **(B) Her şeyi WORM'a yaz (tam immutability)** — RED: KVKK silme hakkı ihlali, "silinemez kişisel veri".
- **(C) Hiç kayıt tutma (sadece canlı)** — RED: ürünün çekirdek değeri (kanıt dosyası) yok olur.
- **(D) Consent-domain MVP + WORM/deletion ayrımı (seçilen).**

## Bağlantı
- **İzlenebilir register:** [docs/privacy/data-lifecycle-register.md](../privacy/data-lifecycle-register.md) — bu kararın veri-sınıfı × retention/erasure/transfer matrisi (public, living, machine-checked: `data-lifecycle-guard`). WORM-içerik-yasağı + crypto-erase/unlinkable invariantları makine-zorlanır.
- [[ATS-0004]] human-approval/audit · [[ATS-0005]] AI-governance/EU-AI-Act · [[ATS-0001]] candidate-PII/transcript store boundary.
- KVKK gate her PR (CLAUDE.md). Procurement artifact: DPA/DPIA/retention-matrix (P3 — retention-matrix kanonik karşılığı data-lifecycle-register.md).
