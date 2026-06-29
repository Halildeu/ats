# ATS-0001 — Ürün boundary + primitives-via-interfaces

- **Durum:** Kabul edildi (cross-AI AGREE — Codex thread 019ef3d9, REVISE→AGREE)
- **Tarih:** 2026-06-23
- **Bağlam kaynağı:** [00-MASTER-PLAN v3.0](../00-ATS-MASTER-PLAN.md) §9 + M5 · 3-AI mutabakat [pingpong-3ai/05](../pingpong-3ai/05-consensus-draft.md)
- **Karar tipi:** Mimari / reuse-sınırı (gate-safe — hangi design-partner olursa olsun geçerli)

## Bağlam

Faz 25 (ATS interview-evidence add-on) **bağımsız multi-tenant SaaS**. Platform (autonomous-orchestrator) varlıkları cazip reuse adayı: Keycloak identity/multi-tenant, audit/WORM, notify/Graph mail, GitOps/secret/observability, K8s ve **Faz 24 AI inference altyapısı** (Türkçe STT/diar/self-host LLM/ADR-0043 citation).

3-AI mutabakatı (Codex tezi, Claude+Gemini kabul) net bir tuzak işaretledi: **"tam reuse" = coupling tuzağı.** Platform şemasına/servislerine sıkı bağlanırsa: (a) platform değişiklikleri ürünü kırar, (b) bağımsız deploy/scale/sovereign topoloji imkânsızlaşır, (c) ürünün satılabilirliği platform release döngüsüne rehin kalır.

## Karar

**Primitives stable interface üzerinden reuse; ürün domain boundary'si AYRI.**

1. **Reuse (stable interface arkasında):** identity/tenant (Keycloak deseni), audit/WORM yaklaşımı, notify/Graph mail, GitOps/secret/observability, **AI inference altyapısı (Faz 24)**. Bunlar versiyonlu interface ile tüketilir; platform iç implementasyonuna doğrudan bağlanılmaz.
   - **MVP interface seti (DAR — Codex REVISE):** yalnız **4 sözleşme** + contract test gün-1: `IdentityTenant`, `EvidenceLedger` (audit/WORM), `AIProvider` (Faz 24), `ATSConnector`. notify/GitOps/observability adapter **detayları ERTELENİR** (over-engineering guard; junior ekiple 4 sözleşme yönetilebilir). Yeni interface ancak bir P1 dilimi gerektirince eklenir.
2. **AYRI tutulacak (ürün kendi kontratı):** identity/tenant contract · audit-evidence contract · **candidate-PII store** · **transcript/media store** · AI-provider interface · ATS/interview domain services · deployment topology (managed SaaS / dedicated tenant / BYO-region / on-prem).
3. **Faz 24 = motor, ayrı ürün değil:** mülakat-zekâsı pipeline'ı Faz 24 servislerini **provider/interface** olarak çağırır (ADR-0004); kopyalamaz, fork'lamaz.
4. **Repo:** `Halildeu/ats` (monorepo: backend/web/ai/desktop/mobile/packages/contracts) + `Halildeu/ats-gitops`. Platform repo'larına kod bağımlılığı YOK; yalnız yayınlanmış interface/imaj.

## Sonuçlar

**Olumlu:** bağımsız deploy/scale; sovereign topoloji mümkün (ADR-0006); platform değişimi ürünü kırmaz; güvenlik/audit primitive'leri sıfırdan yazılmaz; cross-AI/test sınırı net.
**Olumsuz / maliyet:** interface bakım yükü; bazı tekrarlanan tutkal kod; "primitive interface'i yeterince stabil mi" disiplini gerek (her reuse noktası versiyonlanmalı).

## Değerlendirilen alternatifler

- **(A) Tam reuse / platform monolith'e coupling** — RED (consensus): coupling tuzağı, bağımsız satılabilirlik kaybı.
- **(B) Sıfırdan her şey** — RED: Faz 24 + güvenlik/audit primitive israfı, time-to-value kaybı.
- **(C) Primitives-via-stable-interfaces (seçilen)** — bağımsızlık + reuse dengesi.

## Uygunluk / bağlantı
- Boundary ihlali = PR-red sinyali (ileride CI guard: platform iç paketine import YASAK).
- [[ATS-0002]] deployment topology · [[ATS-0004]] Faz 24 provider interface.
