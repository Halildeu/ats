# ats/docs — Faz 25 ATS (PUBLIC: kod + mimari/güven)

> Bu repo **public**: kod + **mimari/güven ADR'leri** + sanitized README ile sınırlıdır.
> **Strateji · GTM · G0 · rekabet · procurement · prospect içeriği → PRIVATE `Halildeu/ats-strategy`** repo'sunda (CONFIDENTIAL; Codex 019f12e2 P0 + owner kararı 2026-06-29).

## Mimari & güven ADR'leri (buyer trust surface)
| ADR | Konu | Durum |
|---|---|---|
| [ATS-0001](./adr/ATS-0001-urun-boundary-primitives-via-interfaces.md) | ürün boundary + primitives-via-interfaces | Accepted |
| [ATS-0002](./adr/ATS-0002-multi-tenant-izolasyon-deployment-topolojisi.md) | multi-tenant izolasyon + topology | Accepted |
| [ATS-0003](./adr/ATS-0003-kvkk-recording-consent-worm-vs-deletion.md) | KVKK/recording-consent + WORM≠deletion | Accepted |
| [ATS-0004](./adr/ATS-0004-mulakat-ai-citation-eval-human-approval.md) | mülakat-AI (citation + eval + human-approval) | Accepted |
| [ATS-0005](./adr/ATS-0005-ai-governance-assist-vs-conduct-bias-audit.md) | AI-governance (assist-vs-conduct + EU AI Act) | Accepted |
| [ATS-0007](./adr/ATS-0007-security-key-management-threat-model.md) | security & key-management threat model | Accepted |
| [ATS-0010](./adr/ATS-0010-audit-observability-event-taxonomy.md) | audit & observability event taxonomy | Accepted |
| [ATS-0011](./adr/ATS-0011-accessibility-i18n-standard.md) | accessibility (WCAG 2.2 AA) + i18n (Türkçe-first) | Accepted |
| [ATS-0012](./adr/ATS-0012-interview-analysis-dimensions.md) | mülakat analiz-boyutları (Art.5 affect/biometric kaçınma + deception dışlama) | Önerildi |
| [ATS-0013](./adr/ATS-0013-speaker-attribution-diarization-vs-voice-id.md) | speaker attribution (diarization + biyometrisiz eşleme; sesten-kimlik default-dışlanmış) | Önerildi |
| [ATS-0014](./adr/ATS-0014-voice-enrollment-optin-internal-only.md) | voice-enrollment opt-in (YALNIZ iç-kullanıcı; aday kategorik-dışlanmış + eleme-yoluyla tespit) | Accepted — owner beyanı 2026-07-02 (runtime P1 + imzalı-DPIA/VERBIS çift kilit) |
| [ATS-0015](./adr/ATS-0015-process-perspective-coverage-six-hats.md) | process_perspective_coverage (Altı-Şapka lensli süreç-perspektif kapsaması; kişi-profilleme dışlanmış) | Önerildi |
| [ATS-0016](./adr/ATS-0016-p1-build-unlock-g0-release-gate.md) | P1 build unlock — G0 build-gate→RELEASE-gate (owner kararı; slice-1 sınırlı) | Accepted — owner 2026-07-02 |
| [ATS-0017](./adr/ATS-0017-p1-stt-provider-faz24-selfhost.md) | P1 STT sağlayıcısı: Faz 24 self-host motoru (AIProvider portu; cloud=isim-özel owner onayı; diarization AYRI bileşen — v0.1.0 sunmaz, 2026-07-03 wire-contract keşif amendment'ı) | Accepted — standing-autonomy 2026-07-02 (dar kapsam; kalite iddiasız; owner veto sürer) |
| [ATS-0018](./adr/ATS-0018-persistence-unlock-postgres-jdbc.md) | persistence unlock: PG16+Flyway+plain-JDBC tek-adapter-modülü (JPA'sız; WORM append-only tablo + ArchUnit daralma) | Accepted — cross-AI 2026-07-02; impl: 8a+8b+8c LANDED (Testcontainers); prod wiring yok |
| [ATS-0019](./adr/ATS-0019-platform-web-mfe-integration.md) | Ürün yüzeyi platform-web'e MFE entegrasyon + `@mfe/design-system`/`@mfe/auth` reuse (frontend pivot; backend ATS app-boot AYRI; `/api/ats` proxy; platform-KC issuer/`ats-api`-audience/tenant/10-scope contract; ATS-0016 synthetic/G0 korunur) | Accepted — owner+cross-AI 2026-07-03 (ATS-0008 frontend supersede; mfe-start-gate deprecated) |

> **Private ADR'ler** (iç-mühendislik/ticari → `ats-strategy`): ATS-0006 (sovereign SKU/pricing), ATS-0008 (servis/MFE decomposition + stack-lock), ATS-0009 (CI runner). On-prem **kabiliyet** trust sinyali ATS-0002'de (topology).

## Güvenlik (public, living)
- [security/release-evidence-manifest.md](./security/release-evidence-manifest.md) — supply-chain/air-gap doğrulanabilir kanıt manifesti (digest-pin + SBOM + cosign + SLSA + vuln-disposition; drift-guard `release-evidence-guard`).
- [security/control-map.md](./security/control-map.md) — ISO 27001:2022/SOC 2 TSC/OWASP kontrol alanları → threat-register ID cross-doc eşlemesi (drift-guard `control-map-guard`; sertifika beyanı DEĞİL).
- [security/threat-register.md](./security/threat-register.md) — STRIDE + LINDDUN → kontrol → test matrisi (ATS-0007 register'ı; bugün enforced guard'lar + gate-locked kontroller).

## Gözlemlenebilirlik (public, living)
- [observability/event-taxonomy.md](./observability/event-taxonomy.md) — ATS-0010 kanonik operasyonel event registry'si (zarf + PII-redaction invariantı; drift-guard `event-taxonomy-guard`). İş-kanıtı WORM ledger'dan ayrı düzlem.

## Entegrasyon (public, living)
- [integrations/connector-capability-standard.md](./integrations/connector-capability-standard.md) — ATS connector yetenek registry'si: export baseline + dar write-back (aday/karar yazımı YASAK; drift-guard `connector-capability-guard`).

## Ürün akışı (public, living)
- [product/interview-evidence-flow.md](./product/interview-evidence-flow.md) — uçtan-uca buyer-readable akış (disclosure→consent→record→AI-suggest→human-review→finalize→export/ATS→withdraw/DSAR); per-step backing+forbidden+p1-residual (drift-guard `product-flow-guard`). Akış sözleşmesi; runtime P1.

## Kanıt paketi (public, living)
- [evidence/evidence-packet-manifest.md](./evidence/evidence-packet-manifest.md) — ATS-0004 citation-backed denetim kanıt paketi kanonik şeması (`contracts/schemas/evidence-packet.schema.json`; drift-guard `evidence-packet-guard`). Ham içerik/skor/affect fail-closed yasak.

## Mülakat rubric standardı (public, living)
- [governance/rubric-standard.md](./governance/rubric-standard.md) — ATS-0005 iş-ilişkili rubric sözleşmesi (`contracts/schemas/rubric.schema.json`; drift-guard `rubric-guard`). Korumalı-özellik (yaş/din/etnik...) + scoring/affect fail-closed yasak.

## AI yönetişimi (public, living)
- [ai-governance/interview-analysis-dimensions.md](./ai-governance/interview-analysis-dimensions.md) — ATS-0012 mülakat analiz-boyutları: içerik-tabanlı 6 boyut (CV-tutarlılık/çelişki/kalite/kapsama/citation + ATS-0015 süreç-perspektif-kapsaması; Art.5-yasaklı-affect/biometric'ten **kaçınma** tasarımı); duygu/ses-ton/davranış (Art.5) + yalan/deception (ürün-politikası) **excluded→safe-alternative** (drift-guard `analysis-dimensions-guard`; uygunluk iddiası değil).
- [ai-governance/speaker-attribution-standard.md](./ai-governance/speaker-attribution-standard.md) — ATS-0013 paylaşımlı tek-mikrofon senaryosu: **diarization = ayrıştırma** (session-scoped, takma-ad S1..Sn; kalıcı şablon YOK) + **biyometrisiz attribution** (cihaz-metadata / sözlü-tanıtım-lexical / katılımcı-cihazı / insan-etiketleme; insan onayı zorunlu); **sesten-kimlik (voiceprint): ATS-0014 owner-onaylı internal-only sentinel — aday DAİMA dışlanmış, runtime P1+imzalı-DPIA çift kilit** (drift-guard `speaker-attribution-guard`).
- [governance/human-oversight-standard.md](./governance/human-oversight-standard.md) — ATS-0004/0005 karar state-machine'i: "AI karar vermez; insan onaylar+gerekçe+kanıt" (drift-guard `human-oversight-guard`; otomatik-finalize yasak).
- [ai-governance/eu-ai-act-technical-file-index.md](./ai-governance/eu-ai-act-technical-file-index.md) — ATS-0005 EU AI Act madde→artefakt **readiness** indeksi (drift-guard `eu-ai-act-guard`; overclaim-yasağı). Uygunluk beyanı DEĞİL.

## KVKK çapraz-denetim (public, living)
- [compliance/kvkk-p1-crosswalk.md](./compliance/kvkk-p1-crosswalk.md) — KVKK yükümlülüğü → P1 mekanizması → **kanıt (repo-path/test)** matrisi K1..K11 (drift-guard `kvkk-crosswalk-guard`: kanıt-path'leri GERÇEKTEN var + kapalı durum-sözlüğü + açık-kalemler silinemez). HUKUKİ GÖRÜŞ DEĞİLDİR — DPO/hukuk incelemesi pre-G0.

## Mahremiyet / veri-yaşam-döngüsü (public, living)
- [privacy/data-lifecycle-register.md](./privacy/data-lifecycle-register.md) — ATS-0003 operationalized: veri-sınıfı × retention/erasure/transfer kanonik matrisi (drift-guard `data-lifecycle-guard`). WORM-içerik-yasağı + crypto-erase/unlinkable invariantları makine-zorlanır (DPO/procurement yüzeyi).
- [privacy/consent-texts-voice-enrollment.md](./privacy/consent-texts-voice-enrollment.md) — ATS-0014 rıza-metni TASLAKLARI: iç-kullanıcı enrollment açık-rızası + aday kayıt-rızası geçici-işleme ek-cümlesi (tenant adaptasyonu owner/DPO; hukuki görüş değildir).
- [privacy/dpia-voice-enrollment.md](./privacy/dpia-voice-enrollment.md) — ATS-0014 DPIA + ölçülülük/alternatif-analizi — **OWNER-APPROVED 2026-07-02** (kayıtlı beyan; DPO pre-G0 atanmadı) + **VERBIS kopyala-yapıştır paketi (§6)**. Runtime-enable hâlâ kapalı: VERBIS + fiili rıza + P1.

## Frontend standardı (public, living)
- [frontend/a11y-i18n-standard.md](./frontend/a11y-i18n-standard.md) — ATS-0011 WCAG 2.2 AA + Türkçe-first i18n kanonik kriter registry'si (drift-guard `a11y-standard-guard`). Enforcement (axe/eslint/i18n-extract) P1 UI ile aktif.
- [frontend/mfe-start-gate.md](./frontend/mfe-start-gate.md) — **ATS-0008 D-C P1 MFE START GATE sabitlemesi: KARŞILANDI** (platform-web snapshot SHA dondurulmuş + curated liste [x-data-grid/AG-Grid bilinçle dışlanmış → lisans n/a] + `@ats/ui` + manuel re-snapshot; drift-guard `mfe-start-gate-guard`) — `mfe-interview-evidence` UI dilimi AÇIK; **@ats/ui snapshot LANDED** (551 dosya bileşen-düzeyi curated; `packages/ui`; guard `ui-snapshot-guard`: yasak-token/path + import-closure + dependency-surface + tsc).

## Implementation (public, CI-yeşil)
- `../contracts/` — ATS-0001 4 TS sözleşme + parity (PARITY.md)
- `../backend/` — ats-core: P1 domain modülleri (ingest/orchestration/review/export/dsr, framework-free) + `persistence-postgres` (ATS-0018) + `app-boot` composition (Spring Boot 3 yalnız orada; /healthz + JWT-kapılı ilk veri-endpoint'leri — tenant token'dan) + ArchUnit
- `../ai/eval-harness/` — ATS-0004 Gate C ölçüm rig'i
- `../.github/workflows/` — ci (boundary+contracts+backend) + security (gitleaks+dependency-review)

## P1 durum (dürüst özet — 2026-07-03)
**Bitti (build+verified):** domain hattı F1/F2/F4/F5/F6/F7/F9/F10 + durable persistence (WORM+6 store+purge) + app-boot composition + JWT/scope'lu TAM API yüzeyi + @ats/ui curated kit + **browser-verified F3 segment-view** + retention-scheduler (default-off) + OpenAPI + KVKK crosswalk (K1..K11 kanıt-referanslı).
**Kalan build-doğa:** F3-sonrası UI akışları (citation-panel/review ekranları). OIDC Auth-Code+PKCE login LANDED (browser-verified; prod IdP bağlaması deploy-wiring).
**Ayrı-doğa (owner/dış-bağımlı):** deploy-wiring (ats-gitops billing + ats-ai Faz24 endpoint'leri), F8 write-back (G0-partner-bağlı), VERBIS girişi (paket hazır), DPO/hukuk incelemesi, G0 saha kanıtları (ATS-0016: release-gate).

## Strateji/G0/rekabet/procurement (PRIVATE)
`Halildeu/ats-strategy` (private) — master-plan · PRD · rekabet analizi · G0 kit (turnkey/ICP/LOI/scope-freeze/sector-pack) · procurement template pack · battle-card · golden-fixture collection pack.
> Not: ADR'lerdeki bazı `Bağlam kaynağı` linkleri bu taşınan dosyalara işaret eder (artık private). ADR'lerin mimari içeriği public kalır; strateji referansları private repodadır.
