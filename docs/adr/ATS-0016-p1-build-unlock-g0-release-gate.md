# ATS-0016 — P1 build unlock: G0 "build gate"den "release gate"e taşındı (owner kararı 2026-07-02)

- **Durum:** **Accepted** — owner kararı KAYITLI (2026-07-02): "P1'e başla, G0'ı bekleme" (AskUserQuestion cevabı; /goal "beklemeden tam otonom tamamla" direktifiyle tutarlı) + Codex 019f2168 PARTIAL şartları absorbe edildi (authority-migration + slice-1 sınırları). Audit trail: [ats#46](https://github.com/Halildeu/ats/issues/46)
- **Tarih:** 2026-07-02
- **Bağlam kaynağı:** PRD-P1 iskeleti (ats-strategy; Codex 019ef420 AGREE) · master-plan M3/§8 · G0 kit (scope-freeze/execution-system/pilot-open checklist) · [[ATS-0014]] (runtime çift-kilit deseni)
- **Karar tipi:** Plan/gate değişikliği (owner yetkisi). **"Ürün hazır/validated" iddiası DEĞİL.**

## Bağlam

Bugüne kadarki disiplin: **PRE-G0 = P1 fonksiyonel build YASAK** (3-AI mutabakatı; yanlış-ürün-inşa riskini market-validation önüne koyma). Owner 2026-07-02'de yön kararı verdi: **P1 inşaatı ŞİMDİ başlasın; G0 market-validation paralelde owner-yürütümünde devam etsin.** Bu ADR o kararı kaydeder ve gate'in yeni anlamını fail-closed tanımlar.

## Karar

1. **P1 fonksiyonel build SERBEST (bugünden itibaren):** PRD-P1 frozen scope'u (F1-F10) sıralı teslim hattıyla inşa edilir: ingest → STT(WER) → diarization(DER) → segment-view → rubric/citation → human-approve+audit → consent floor → export → (3-koşul) narrow write-back. Haftalık tek deliverable; her slice cross-AI (Codex) review + CI yeşil + mevcut 24 drift-guard'a uyum.
2. **G0 artık RELEASE gate'idir (build gate değil):** Aşağıdakiler G0=GO + pilot-open checklist (Gate A-F) olmadan YAPILAMAZ — fail-closed:
   - gerçek-tenant/pilot açılışı, satış/GTM, gerçek aday verisiyle işleme;
   - **[G0-KİLİTLİ]** sayısal eval eşiklerinin "kalibre edildi" ilanı (golden Türkçe fixture + partner gerekir — placeholder eşikler `uncalibrated` etiketiyle taşınır, yeşil sayılmaz);
   - partner-spesifik acceptance (hangi ATS, consent-detayı, başarı metriği).
3. **Compliance runtime-enable kilitleri AYNEN kalır:** fiili açık-rıza toplama + imzalı DPIA ([[ATS-0014]] voice-enrollment için) + VERBIS = tenant-onboarding önkoşulu. Build'de sentetik/rıza-alınmış test verisi kullanılır; **gerçek aday verisi release-gate arkasında**.
4. **Scope-freeze korunur:** PRD "YASAK (P1)" listesi aynen (full-ATS, çoklu-ATS, HRIS/SSO/SCIM, on-prem-SKU, SOC2/ISO iddiası, bias-dashboard, QoH, agentic, numeric/comparative scoring, affect, auto-reject). Genişletme = ayrı ADR.

## Slice-1 tanımı ve sınırları (Codex 019f2168 şartlı-onay absorbe)

**Kapsam:** consent-gated upload-ingest dikey dilimi — interview/session/recording domain aggregate'leri + tenant-scoped erişim (ATS-0002) + **fail-closed consent-gate** (`consent_record` + `recording_permission_state` yoksa ingest REDDEDİLİR; `evidence.recording.blocked_no_consent`) + upload kabulü + operasyonel audit-event emisyonu (event-taxonomy zarfı/pii_class).

**Sınırlar (bu slice'ta YASAK):**
- **Persistence PORT-ONLY:** JPA/Flyway/Spring Data/Hibernate YOK — ArchUnit global yasağı AYNEN korunur; in-memory repository + port arayüzleri. Gerçek persistence = ayrı "architecture unlock" slice (ArchUnit modül-import-matrisi ADR revizyonuyla).
- **Object-store:** port + local/test adapter; vendor SDK (S3/MinIO client) YOK.
- **EvidenceLedger:** port + fake/contract-test; **gerçek ledger-ref üretildiği İDDİA EDİLMEZ** — ledger-unavailable → fail-closed davranışı test edilir. (Taxonomy'de `blocked_no_consent`/`scan_rejected` zaten `ledger_entry_ref` istemez.)
- **Test verisi:** YALNIZ sentetik veya açıkça-rızalı test fixture; gerçek aday verisiyle demo/dogfood/sales-proof YASAK (release-gate).
- Teams/Graph ingest (tenant creds; slice-2+), STT provider seçimi (ayrı cross-AI karar; slice-3 öncesi), UI segment-view (slice-4), WORM gerçek implementasyonu (slice-5 öncesi tasarım) — bilinçli dışarıda.

**Doküman-dili eşlemesi:** yaşayan authority yüzeyleri (kök README, backend/ai/web/desktop/mobile/packages README'leri, backend POM) bu ADR ile yeni kurala çevrildi. Tarihli ADR/registry metinlerindeki eski "runtime P1, G0=GO sonrası" ifadeleri **tarihsel kayıttır** ve bu ADR ile şöyle okunur: *"P1 build aktif; release/gerçek-veri/kalibrasyon-iddiası G0-kilitli"*.

## Owner'ın üstlendiği risk (dürüst kayıt)

- **Yanlış-ürün riski:** market-validation kanıtı olmadan inşaat — partner geri bildirimi slice'ları değiştirebilir (rework maliyeti owner'da). Mitigasyon: evidence-first frozen scope + haftalık ince slice + G0 paralel yürütülürse erken düzeltme.
- **Eşik-kalibrasyon borcu:** golden fixture gelene kadar Gate C eşikleri `uncalibrated`; "kalite kanıtlandı" DENMEZ.

## Değerlendirilen alternatifler

- **(A) Plan-uyumlu bekle (statüko)** — owner reddetti (2026-07-02): agent-doable zarf doygun, bekleme değer üretmiyor.
- **(B) G0'ı hızlandır, sonra P1** — owner P1'i seçti; G0 sprint kiti hazır durumda paralel yürütülebilir.
- **(C) P1 build + G0 release-gate (seçilen).**

## Gate disiplini (yeni ifade)

"PRE-G0 P1-yasak" kuralı bu ADR ile **superseded**. Yeni kural: **build serbest; release/pilot/gerçek-veri/kalibrasyon-iddiası G0 + pilot-open checklist + compliance-kilitlere bağlı.** No-Fake-Work aynen: her slice çalıştırma kanıtıyla raporlanır; "pilot-ready/validated" iddiası release-gate kanıtı olmadan YASAK.

## Bağlantı

- PRD-P1 (ats-strategy) · G0 kit (scope-freeze/execution-system/pilot-open) · [[ATS-0014]] (compliance çift-kilit) · [[ATS-0004]]/[[ATS-0005]] (citation/human-approval/no-scoring) · [[ATS-0002]]/[[ATS-0007]] (tenant-izolasyon/security) · eval-harness (Gate C rig).
