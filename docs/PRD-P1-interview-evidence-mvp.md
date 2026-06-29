# PRD — P1: Audit-ready Interview Evidence Packet MVP (İSKELET)

- **Durum:** İSKELET — cross-AI **AGREE** (Codex thread 019ef420, "altitude doğru" + on-prem netleştirmesi absorb). Partner-spesifik acceptance kriterleri + sayısal eşikler **[G0-KİLİTLİ]** — G0=GO + golden fixture sonrası sabitlenir. **Detaylı build G0=GO sonrası** (3-AI mutabakat disiplini).
- **Tarih:** 2026-06-23 · **Board:** [ats#2](https://github.com/Halildeu/ats/issues/2)
- **Kaynak:** [MASTER-PLAN v3](./00-ATS-MASTER-PLAN.md) M3/§8 · [scope-freeze](./G0/g0-p1-scope-freeze.md) · ADR [0001-0008](./adr/) · [eval-harness](../ai/eval-harness/) · [pilot-open checklist](./G0/g0-pilot-open-release-checklist.md)

## 1. Problem & hedef
Regüle kurumlarda mülakat kararları denetlenebilir kanıta dayanmalı; bugün dağınık not/hafıza. Hedef: mevcut ATS üstünde çalışan, Türkçe/on-prem, **kaynak-alıntılı, insan-onaylı, denetlenebilir mülakat kanıt dosyası** üretmek. Konum: **evidence-first** (AI kanıt üretir, insan karar verir).

## 2. Kapsam (frozen — scope-freeze)
**DAHİL:** Teams/Graph veya upload ingest → Türkçe STT + diarization → transcript segment view → rubric/evidence mapping + claim-level citation → human edit/approve → immutable audit → evidence packet export (PDF/secure-link/email/webhook) + opsiyonel narrow ATS write-back (3-koşul) + compliance floor.
**YASAK (P1):** full-ATS · çoklu-ATS · HRIS/SSO/SCIM · on-prem-SKU · SOC2/ISO · bias-dashboard · QoH · agentic · **numeric/comparative scoring** · affect · auto-reject.

## 3. Kullanıcılar & alıcı
User: recruiter/HM/interviewer · Operational owner: TA/HR · Veto: Legal/Compliance/DPO/InfoSec · Economic: CHRO/CFO. Mesaj = "denetlenebilir hiring evidence", "AI notetaker" değil.

## 4. Fonksiyonel gereksinimler (P1)
| # | Gereksinim | ADR/ref |
|---|---|---|
| F1 | Mülakat ingest: MS Teams/Graph kaydı + dosya upload | ATS-0001 (AIProvider/ATSConnector) |
| F2 | Türkçe STT + diarization (3+ konuşmacı panel) | ATS-0004 |
| F3 | Transcript segment view (zaman-damgalı, konuşmacı-etiketli) | ATS-0004 |
| F4 | Rubric/evidence mapping + **claim-level citation** (tıkla→kaynak alıntı, entailment, fail-closed) | ATS-0004 |
| F5 | **Human edit/approve** (insan onayı olmadan finalize yok); **numeric score YOK** (evidence checklist + human-authored rationale) | ATS-0004/0005 |
| F6 | Immutable audit trail + model/version/oversight log | ATS-0003/0005 |
| F7 | Evidence packet export: PDF + secure link + email/webhook + kimlik eşleşmesi | M2 (export-taban) |
| F8 | Opsiyonel narrow ATS write-back (yalnız 3-koşul: ATS-adı+API+LOI) | M2 |
| F9 | Consent/recording domain: disclosure + açık rıza + withdrawal + recording-permission-state | ATS-0003 |
| F10 | Retention timer + DSR/erasure (unlinkable tombstone) | ATS-0003 |

## 5. Fonksiyonel-olmayan gereksinimler
- **Multi-tenant izolasyon** (logical default + tenant-boundary fail-closed) — ATS-0002.
- **Security/key-mgmt** (per-tenant KMS, RBAC, break-glass, AI-threat controls, supply-chain) — ATS-0007.
- **KVKK/EU-AI-Act** (consent/retention/silme/disclosure/insan-gözetimi) — ATS-0003/0005.
- **Egemenlik** (TR-residency/on-prem-capable; SKU gate'li) — ATS-0006. **Netleştirme (Codex):** P1 hedefi = egemenlik/**on-prem-uyumlu pilot deployment boundary**; paketlenmiş, tekrar-satılabilir, çok-kiracılı **on-prem SKU kapsam DIŞI** (G0 sonrası ayrı karar). "on-prem" = pilot deployment uyumu; "on-prem-SKU YASAK" = ürünleştirilmiş paket.

## 6. AI kalite kabulü (Gate C — eval-harness)
WER/DER ≤ **[G0-KİLİTLİ]** · citation precision ≥ **[G0-KİLİTLİ]** · recall ≥ **[G0-KİLİTLİ]** · unsupported-claim ≤ **[G0-KİLİTLİ]** · **fail-closed = %100 (sert)**. Ölçüm: [ai/eval-harness](../ai/eval-harness/) golden Türkçe fixture'da; eşikler kalibre + kilitli olmadan pilot-open yeşil değil.

## 7. Acceptance kriterleri (MVP — iskelet)
- [ ] F1-F10 fonksiyonel + acceptance-contract (fixture→expected→test/demo→review) — [execution-system](./G0/g0-execution-system.md)
- [ ] Pilot-open release checklist **Gate A-F yeşil** — [checklist](./G0/g0-pilot-open-release-checklist.md)
- [ ] **[G0-KİLİTLİ]** partner-spesifik: hangi ATS (write-back vs export), consent akışı, başarı metriği (örn. değerlendirme süresi/audit-yanıt/scorecard-adoption)
- [ ] **[G0-KİLİTLİ]** sayısal eval eşikleri (golden fixture)

## 8. Başarı metrikleri (plan §8)
recruiter/interviewer time-saved · scorecard completion · **citation-supported claim ratio** · unsupported-claim rate · override/edit-rate · WER/DER · citation precision/recall · legal/audit-export kabulü · ATS write-back success · **pilot→paid conversion**.

## 9. Bağımlılık & açık sorular (G0'da netleşir)
- Design-partner'ın ATS'i? (write-back derinliği belirler — M2)
- Kayıt-izni/consent hukuki şartları? (ATS-0003 parametre)
- Golden Türkçe fixture (Zeynep/owner) → eval kalibrasyonu.
- Provider seçimi: self-host eval-gate'i geçer mi yoksa pilot-cloud mı? (ATS-0004)

## 10. Sıralı teslim (execution-system tek-hat)
ingest → STT(WER) → diarization(DER) → segment-view → rubric/citation(precision/recall/fail-closed) → human-approve+audit → consent floor → export → (3-koşul varsa) narrow write-back. Haftalık tek deliverable.

---
> **İSKELET notu:** Bu PRD yapıyı + frozen scope'u + ADR/metrik bağlarını sabitler. **[G0-KİLİTLİ]** alanlar (partner-ATS, consent-detay, başarı-metriği, sayısal-eşik) G0=GO + golden fixture sonrası doldurulur; detaylı build o noktada başlar.
