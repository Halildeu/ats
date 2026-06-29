# Human Oversight & Accountability Standard (canonical state-machine)

> **Public · living document.** [[ATS-0005]] (assist-vs-conduct) + [[ATS-0004]] (human-approval) kararlarını **makine-doğrulanan karar state-machine**'ine döker. "AI karar VERMEZ; insan onaylar, gerekçe yazar, hesap verir" cümlesini **process contract**'a çevirir. EU AI Act Art.14 (human oversight) residual'ını kapatır.
> **Drift guard:** `scripts/check-human-oversight.mjs` (CI job `human-oversight-guard`).
> Çapraz-bağ: [[ATS-0004]] · [[ATS-0005]] · [docs/observability/event-taxonomy.md](../observability/event-taxonomy.md) (`evidence.human_approval.recorded` sentinel) · [docs/ai-governance/eu-ai-act-technical-file-index.md](../ai-governance/eu-ai-act-technical-file-index.md) Art.14.

## 0. İlke (overclaim YASAK)

- **Otomatik finalize/karar YOK.** Hiçbir AI-tipi state doğrudan `FINALIZED`'e geçemez; insan gerekçesi şart.
- **Hesap verebilirlik:** `FINALIZED` yalnız `human_actor_ref` + `human_authored_rationale_ref` + `source_evidence_refs` ile kesinleşir (kim, neden, hangi kanıta dayanarak).
- **YASAK state token'ları** (guard reddeder): `AUTO_FINALIZED` · `AI_APPROVED_FINAL` · `AUTO_DECISION` · `AI_FINAL` · `MODEL_DECIDES`.

## 1. State'ler

| State | Anlam | Tür | Required-on-entry |
|---|---|---|---|
| **AI_SUGGESTED** | AI önerisi üretildi (assist) | ai | source_evidence_refs |
| **HUMAN_REVIEWING** | insan inceliyor | human | human_actor_ref |
| **HUMAN_EDITED** | insan öneriyi düzenledi | human | human_actor_ref |
| **AI_SUGGESTION_REJECTED** | insan AI önerisini reddetti | human | human_actor_ref, human_authored_rationale_ref |
| **HUMAN_RATIONALE_RECORDED** | insan gerekçesi kaydedildi | human | human_actor_ref, human_authored_rationale_ref |
| **FINALIZED** | insan onayı kesinleşti (terminal) | terminal | human_actor_ref, human_authored_rationale_ref, source_evidence_refs |
| **EXPORTED** | denetim kanıt paketi export (terminal) | terminal | export_artifact_ref |
| **WITHDRAWN** | geri çekildi (DSAR/erasure; terminal) | terminal | reason_code |

## 2. Geçişler (transitions)

| From | To | Koşul |
|---|---|---|
| AI_SUGGESTED | HUMAN_REVIEWING | insan akışı açar |
| HUMAN_REVIEWING | HUMAN_EDITED | insan düzenler |
| HUMAN_REVIEWING | AI_SUGGESTION_REJECTED | insan reddeder |
| HUMAN_EDITED | HUMAN_RATIONALE_RECORDED | gerekçe girilir |
| AI_SUGGESTION_REJECTED | HUMAN_RATIONALE_RECORDED | gerekçe girilir |
| HUMAN_RATIONALE_RECORDED | FINALIZED | insan onaylar (tek FINALIZED girişi) |
| FINALIZED | EXPORTED | kanıt paketi üretilir |
| AI_SUGGESTED | WITHDRAWN | rıza-geri-çekme/erasure |
| HUMAN_REVIEWING | WITHDRAWN | rıza-geri-çekme/erasure |
| HUMAN_EDITED | WITHDRAWN | rıza-geri-çekme/erasure |
| HUMAN_RATIONALE_RECORDED | WITHDRAWN | rıza-geri-çekme/erasure |
| FINALIZED | WITHDRAWN | rıza-geri-çekme/erasure |

## 3. İnvariantlar (guard zorlar)

1. `FINALIZED`'e **tek geçiş** vardır ve kaynağı `HUMAN_RATIONALE_RECORDED` (insan gerekçesi olmadan finalize YOK).
2. Hiçbir `ai`-tipi state'ten `FINALIZED`'e doğrudan geçiş yoktur.
3. `FINALIZED` required-on-entry = `human_actor_ref` + `human_authored_rationale_ref` + `source_evidence_refs` (üçü birden).
4. YASAK state token'ları state/transition'da görünemez.
5. Tüm geçiş uçları (From/To) tanımlı state olmalı.
6. Sentinel state'ler mevcut: `FINALIZED`, `HUMAN_RATIONALE_RECORDED`, `AI_SUGGESTION_REJECTED` (silinemez — oversight zayıflatma guard'ı).

## 4. Doğrulama (drift-guard `scripts/check-human-oversight.mjs`)

§1 state tablosu + §2 transition tablosu parse; §3 invariant 1–6. `evidence.human_approval.recorded` event'i ([[ATS-0010]] taxonomy) `FINALIZED` ile eşleşir (insan onayı WORM'a audit event olarak yazılır).

## 5. Bağlantı
- [[ATS-0004]] (citation+human-approval) · [[ATS-0005]] (assist-vs-conduct) · event-taxonomy (`evidence.human_approval.recorded`/`evidence.tombstone.appended`) · eu-ai-act-index Art.14 · data-lifecycle (`human_decision_rationale`).
