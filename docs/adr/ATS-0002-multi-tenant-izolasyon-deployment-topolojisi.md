# ATS-0002 — Multi-tenant izolasyon + deployment topolojisi

- **Durum:** Kabul edildi (cross-AI AGREE — Codex thread 019ef3d9); residual: tenant-boundary contract test (DB/API/object-store/background-job/log/export/backup) = P0 pilot-open gate
- **Tarih:** 2026-06-23
- **Bağlam kaynağı:** MASTER-PLAN v3.0 §9 + M5 · [[ATS-0001]] boundary · [[ATS-0006]] sovereign SKU
- **Karar tipi:** Mimari / izolasyon + dağıtım (gate-safe)

## Bağlam

Ürün bağımsız **multi-tenant SaaS**. Regüle kurumlar farklı izolasyon + veri-residency seviyesi ister (banka ≠ KOBİ). Mülakat verisi (aday-PII + ham medya) yüksek-hassasiyet. Deployment topolojisi consensus'ta 4-katman (M5): managed SaaS / dedicated tenant / BYO-region / on-prem. İzolasyon modeli yanlış kurulursa: ya maliyet patlar (herkes dedicated) ya da güven kaybı (zayıf logical isolation regüle alıcıyı kaçırır).

## Karar

**Tek codebase, izolasyon + topoloji = konfigürasyon/SKU; default logical isolation, yüksek-güvence için dedicated, sovereign için on-prem.**

1. **İzolasyon katmanları (artan güvence):**
   - **Logical (default):** tenant_id + row-level security + Keycloak realm/tenant ayrımı; candidate-PII/transcript store per-tenant mantıksal ayrım. KOBİ/orta için yeterli + maliyet-verimli.
   - **Dedicated tenant (yüksek-güvence):** ayrı namespace + ayrı DB/şema + ayrı medya bucket; aynı cluster. Banka/sigorta için.
   - **On-prem / BYO-region (sovereign):** tam ayrı kurulum (ADR-0006 gate'li).
2. **Tenant data boundary (ATS-0001):** candidate-PII + transcript/media store her zaman tenant-scoped; cross-tenant erişim kod-seviye fail-closed; her sorgu tenant-filtre zorunlu (test invariant).
3. **Data residency parametrik:** tenant başına region/residency politikası; TR-residency default opsiyon (KVKK kaması, ATS-0003).
4. **Topology = SKU/config, codebase tek:** managed/dedicated/BYO/on-prem aynı kod, farklı deployment profili (GitOps overlay deseni). MVP = managed (logical) + dedicated yolu hazır.

## Sonuçlar

**Olumlu:** maliyet-verimli başlangıç (logical) + regüle alıcıya yükseltme yolu (dedicated/on-prem); residency satılabilir; tek codebase bakımı.
**Olumsuz:** multi-topology test yükü (her katman izolasyon testi); dedicated/on-prem ops yükü (ADR-0006 gate'le sınırlı); RLS/tenant-filter disiplini sürekli denetlenmeli.

## Değerlendirilen alternatifler

- **(A) Managed-only, tek topology** — RED: sovereign/dedicated kaması kaybı, regüle enterprise kaçar.
- **(B) Her tenant zorunlu dedicated/ayrı-deploy** — RED: maliyet + ops, MVP-overkill, junior ekip batırır.
- **(C) Tek codebase + katmanlı izolasyon + topology-as-config (seçilen).**

## Bağlantı
- [[ATS-0001]] boundary/tenant-contract · [[ATS-0003]] residency/PII · [[ATS-0006]] on-prem SKU gate · tenant-cross-leak testi pilot-open checklist'te.
