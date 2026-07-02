# KVKK ↔ P1 İmplementasyon Çapraz-Denetimi (crosswalk)

> **HUKUKİ GÖRÜŞ DEĞİLDİR.** Bu doküman, KVKK'nın çekirdek yükümlülüklerinin P1
> kod tabanında HANGİ mekanizmayla karşılandığını **kanıt-referanslı** eşler
> (DPO/hukuk incelemesi ve resmi uygunluk beyanı AYRI süreçtir; G0/release
> öncesi zorunludur). Amaç: buyer/DPO'nun "iddia değil kanıt" görmesi.
> **Machine-checked:** `scripts/check-kvkk-crosswalk.mjs` (CI `kvkk-crosswalk-guard`) —
> Kanıt kolonundaki her repo-path'in GERÇEKTEN var olduğunu doğrular.

## 1. Yükümlülük → Mekanizma → Kanıt matrisi

| # | KVKK yükümlülüğü | P1 mekanizması | Kanıt (repo-path / test) | Durum |
|---|---|---|---|---|
| K1 | m.4 — hukuka uygunluk, ölçülülük, amaçla sınırlılık | İçerik-tabanlı analiz boyutları; Art.5-yasaklı affect/biometric KAÇINMA tasarımı; kişi-profilleme dışlanmış | `docs/ai-governance/interview-analysis-dimensions.md` · guard `scripts/check-analysis-dimensions.mjs` | enforced (CI) |
| K2 | m.5/6 — işleme şartı: açık rıza | Rıza DENY-BY-DEFAULT (kayıt yok→red); rıza yazımı state+WORM kanıtı BİRLİKTE (GRANTED=ledger-önce); yeniden-beyan yeni kanıt | `backend/consent/src/main/java/com/ats/consent/ConsentGate.java` · `backend/consent/src/main/java/com/ats/consent/ConsentService.java` · `backend/consent/src/test/java/com/ats/consent/ConsentServiceTest.java` | enforced (repo-test) |
| K3 | m.7 + m.11/1-e — silme/yok etme; ilgili kişinin silme hakkı | DSAR intake + erasure: TOMBSTONE-ÖNCE fail-closed sıra; content-plane GERÇEKTEN silinir (API'den 404 kanıtlı), WORM pointer-only kalır; geri-çekme derhal etkili (ledger'ı beklemez) | `backend/retention-dsr/src/main/java/com/ats/dsr/DsrService.java` · `backend/app-boot/src/test/java/com/ats/app/ExportDsarApiTest.java` | enforced (repo-test) |
| K4 | m.4/2-d — gerekli süre kadar muhafaza (saklama sınırlaması) | Retention-purge: created_at + cutoff taraması; scheduler DEFAULT KAPALI, tenant-politikası config; süresi dolan content silinir | `backend/persistence-postgres/src/main/java/com/ats/persistence/PostgresRetentionScanner.java` · `backend/app-boot/src/main/java/com/ats/app/RetentionScheduler.java` · `backend/app-boot/src/test/java/com/ats/app/RetentionSchedulerTest.java` | enforced (repo-test) |
| K5 | m.10 — aydınlatma yükümlülüğü | Aydınlatma + AI-yardım ifşası UI'da katalogdan (EU AI Act m.50 cümlesi dahil); rıza-metni taslakları | `web/i18n/tr-TR.json` · `docs/privacy/consent-texts-voice-enrollment.md` · guard `scripts/check-web-foundation.mjs` | enforced (CI) |
| K6 | m.11 — ilgili kişinin hakları (erişim/bilgi talebi) | DSAR intake API'si (opak subjectRef; talep WORM/ops izli); erasure ayrı YIKICI yetki sınıfı | `backend/app-boot/src/main/java/com/ats/app/web/DsarApiController.java` · `backend/app-boot/src/test/java/com/ats/app/ExportDsarApiTest.java` | enforced (repo-test) |
| K7 | m.12 — veri güvenliği (uygun teknik tedbirler; m.12/3 amaç-dışı kullanım/ifşa yasağı dahil) | JWT+JWKS (iss/aud/exp) + endpoint-bazlı scope ayrımı + tenant DAİMA token'dan + bilinmeyen yüzey denyAll; tehdit-kaydı ve kontrol haritası | `backend/app-boot/src/main/java/com/ats/app/SecurityConfig.java` · `backend/app-boot/src/test/java/com/ats/app/RestApiSecurityTest.java` · `backend/ops-events/src/main/java/com/ats/ops/PiiClass.java` · `docs/security/threat-register.md` · `docs/security/control-map.md` | enforced (repo-test) |
| K8 | m.12/1-2 — veri güvenliği tedbirleri ve DENETLENEBİLİRLİK (denetim yükümlülüğü) | Append-only WORM ledger (hash-chain; UPDATE/DELETE/TRUNCATE reject-trigger); operasyonel event taksonomisi (pii_class fail-closed) | `backend/persistence-postgres/src/main/resources/db/migration/V1__worm_ledger.sql` · `backend/persistence-postgres/src/test/java/com/ats/persistence/PostgresEvidenceLedgerTest.java` · `docs/observability/event-taxonomy.md` | enforced (repo-test) |
| K9 | Özel nitelikli veri (m.6) — ses/biyometri sınırı | Diarization=AYRIŞTIRMA (session-scoped S1..Sn; kalıcı şablon YOK); sesten-kimlik default-DIŞLANMIŞ (opt-in yalnız iç-kullanıcı, aday kategorik-dışlanmış, çift-kilit) | `docs/ai-governance/speaker-attribution-standard.md` · `docs/privacy/dpia-voice-enrollment.md` · guard `scripts/check-speaker-attribution.mjs` | enforced (CI) |
| K10 | Veri-yaşam-döngüsü bütünlüğü (m.4+m.7 bileşik) | Veri-sınıfı × retention/erasure/transfer kanonik matrisi; WORM-içerik-yasağı (claim/ham-metin ledger'a giremez) makine-zorlanır | `docs/privacy/data-lifecycle-register.md` · guard `scripts/check-data-lifecycle.mjs` | enforced (CI) |
| K11 | m.8/m.9 — kişisel veri aktarımı / yurt dışı aktarım | P1 default: tenant dışına alıcı YOK; yurt dışı aktarım YOK; AI-işleme self-host-only (ATS-0017 — cloud fallback isim-özel owner onayına kilitli); ATS/write-back G0-gated; subprocessor register private repoda | `docs/privacy/data-lifecycle-register.md` · `docs/privacy/dpia-voice-enrollment.md` · `docs/adr/ATS-0017-p1-stt-provider-faz24-selfhost.md` · guard `scripts/check-data-lifecycle.mjs` | enforced (CI) |

## 2. Bilinen açık kalemler (dürüst sınır — release öncesi kapanır)

| Kalem | Sahip | Durum |
|---|---|---|
| VERBIS kaydı güncellemesi (voice-enrollment kategorisi) | owner (fiziksel portal işlemi) | kopyala-yapıştır paketi HAZIR (`docs/privacy/dpia-voice-enrollment.md` §6) |
| DPO/hukuk resmi incelemesi + uygunluk beyanı | owner + DPO | pre-G0; bu doküman girdi malzemesidir |
| Gerçek OIDC login akışı (dev-token yerine) | build (sıradaki dilim) | planlı |
| Prod deploy sertleştirmesi (edge, api-docs kısıtı, migration-role ayrımı) | deploy-wiring | ADR-0018/slice notlarında kayıtlı |

## 3. Standart-hizalama bağlantıları

- ISO 27001:2022 / SOC 2 TSC / OWASP → [control-map](../security/control-map.md) (sertifika beyanı DEĞİL; kontrol→tehdit→test eşlemesi)
- EU AI Act → [technical-file index](../ai-governance/eu-ai-act-technical-file-index.md) (readiness; uygunluk beyanı DEĞİL)
- STRIDE+LINDDUN → [threat-register](../security/threat-register.md)

## Bağlantı

[[ATS-0003]] (KVKK/WORM≠deletion) · [[ATS-0012]]/[[ATS-0013]]/[[ATS-0014]] ·
[[ATS-0016]] (G0 release-gate: gerçek aday verisi bu build'de YOK — yalnız sentetik/açık-rızalı fixture)
