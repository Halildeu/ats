# Human Oversight & Accountability Standard (canonical state-machine)

> **Public · living document.** [[ATS-0005]] (assist-vs-conduct) + [[ATS-0004]] (human-approval) kararlarını **makine-doğrulanan karar state-machine**'ine döker. "AI karar VERMEZ; insan onaylar, gerekçe yazar, hesap verir" cümlesini **process contract**'a çevirir.
> **Kapsam (No Fake Work):** Bu standart EU AI Act Art.14'ün **design/state-machine residual'ını** kapatır. **Runtime/UI enforcement** (boş-olmayan gerekçe zorlaması, rubber-stamp/bulk-approve engeli, gerçek akış) **P1 residual** olarak kalır — bu doküman onların yapıldığını iddia ETMEZ.
> **Drift guard:** `scripts/check-human-oversight.mjs` (CI job `human-oversight-guard`).
> Çapraz-bağ: [[ATS-0004]] · [[ATS-0005]] · [docs/observability/event-taxonomy.md](../observability/event-taxonomy.md) (`evidence.human_decision.finalized` sentinel) · [docs/ai-governance/eu-ai-act-technical-file-index.md](../ai-governance/eu-ai-act-technical-file-index.md) Art.14 · [docs/privacy/data-lifecycle-register.md](../privacy/data-lifecycle-register.md) (`human_decision_rationale`).

## 0. İlke (overclaim YASAK)

- **Otomatik finalize/karar YOK.** Hiçbir AI-tipi state doğrudan `FINALIZED`'e geçemez; insan gerekçesi şart.
- **Hesap verebilirlik:** `FINALIZED` yalnız aşağıdaki tüm pointer'larla kesinleşir (kim, hangi yetkiyle, neden, hangi AI çıktı-versiyonuna bakarak, hangi kanıta dayanarak, sonuç ne).
- **YASAK state token'ları** (guard reddeder, case-insensitive): `AUTO_FINALIZED` · `AI_APPROVED_FINAL` · `AUTO_DECISION` · `AI_FINAL` · `MODEL_DECIDES` · `AUTO_APPROVED`.

## 1. State'ler

> Tür: `ai` · `human` · `locked` (iş-kararı kilitli; yalnız idari geçiş) · `terminal` (çıkışsız).

| State | Anlam | Tür | Required-on-entry |
|---|---|---|---|
| **AI_SUGGESTED** | AI önerisi üretildi (assist) | ai | source_evidence_refs, ai_output_version_ref |
| **HUMAN_REVIEWING** | insan inceliyor | human | human_actor_ref, oversight_role_ref |
| **HUMAN_EDITED** | insan öneriyi düzenledi | human | human_actor_ref, human_change_summary_ref |
| **HUMAN_REVIEWED_NO_CHANGE** | insan inceledi, değişiklik yok (explicit) | human | human_actor_ref, ai_output_version_ref |
| **AI_SUGGESTION_REJECTED** | insan AI önerisini reddetti | human | human_actor_ref, human_authored_rationale_ref |
| **HUMAN_RATIONALE_RECORDED** | insan gerekçesi kaydedildi | human | human_actor_ref, human_authored_rationale_ref |
| **FINALIZED** | insan kararı kilitlendi (iş-kararı) | locked | human_actor_ref, oversight_role_ref, human_authored_rationale_ref, source_evidence_refs, ai_output_version_ref, decision_outcome_ref |
| **EXPORTED** | denetim kanıt paketi export (çıkışsız) | terminal | export_artifact_ref |
| **WITHDRAWN** | geri çekildi (DSAR/erasure; çıkışsız) | terminal | reason_code |

## 2. Geçişler (transitions)

| From | To | Koşul |
|---|---|---|
| AI_SUGGESTED | HUMAN_REVIEWING | insan akışı açar |
| HUMAN_REVIEWING | HUMAN_EDITED | insan düzenler |
| HUMAN_REVIEWING | HUMAN_REVIEWED_NO_CHANGE | insan değişiklik yok diye işaretler (incelenen AI versiyonu kayıtlı) |
| HUMAN_REVIEWING | AI_SUGGESTION_REJECTED | insan reddeder |
| HUMAN_EDITED | HUMAN_RATIONALE_RECORDED | gerekçe girilir |
| HUMAN_REVIEWED_NO_CHANGE | HUMAN_RATIONALE_RECORDED | explicit no-change gerekçesi girilir |
| AI_SUGGESTION_REJECTED | HUMAN_RATIONALE_RECORDED | gerekçe girilir |
| HUMAN_RATIONALE_RECORDED | FINALIZED | insan onaylar (tek FINALIZED girişi) |
| FINALIZED | EXPORTED | kanıt paketi üretilir (idari) |
| FINALIZED | WITHDRAWN | rıza-geri-çekme/erasure (idari) |
| AI_SUGGESTED | WITHDRAWN | rıza-geri-çekme/erasure |
| HUMAN_REVIEWING | WITHDRAWN | rıza-geri-çekme/erasure |
| HUMAN_EDITED | WITHDRAWN | rıza-geri-çekme/erasure |
| HUMAN_REVIEWED_NO_CHANGE | WITHDRAWN | rıza-geri-çekme/erasure |
| AI_SUGGESTION_REJECTED | WITHDRAWN | rıza-geri-çekme/erasure |
| HUMAN_RATIONALE_RECORDED | WITHDRAWN | rıza-geri-çekme/erasure |

## 3. İnvariantlar (guard zorlar)

1. `FINALIZED`'e **tek geçiş** vardır, kaynağı `HUMAN_RATIONALE_RECORDED` (insan gerekçesi olmadan finalize YOK).
2. Hiçbir `ai`-tipi state'ten `FINALIZED`'e doğrudan geçiş yoktur (prose/mermaid gizli geçiş dahil yasak).
3. `FINALIZED` required-on-entry = `human_actor_ref` + `oversight_role_ref` + `human_authored_rationale_ref` + `source_evidence_refs` + `ai_output_version_ref` + `decision_outcome_ref` (altısı birden).
4. YASAK state token'ları (case-insensitive) state/transition'da görünemez.
5. Tüm geçiş uçları (From/To) tanımlı state olmalı; **bilinmeyen state YASAK** (örn. gizli `APPROVED` terminal); state tekil.
6. Sentinel state'ler mevcut: `FINALIZED`, `HUMAN_RATIONALE_RECORDED`, `AI_SUGGESTION_REJECTED`, `HUMAN_REVIEWED_NO_CHANGE` (silinemez).
7. `terminal` state (EXPORTED/WITHDRAWN) **çıkışsız** (outgoing geçiş YOK); `locked` state (FINALIZED) yalnız `terminal`'e geçer (asla editable `human`/`ai` state'e dönemez — re-open YASAK).
8. Mermaid ok-gösterimi ve süslü-parantez flow-style ve tablo-dışı gizli FINALIZED geçiş ifadeleri YASAK (yalnız §2 tablosu otoritedir; guard bunları lexical reddeder).

## 4. WORM & event binding (netleştirme)

İnsan kararı `evidence.human_decision.finalized` operasyonel event'i ile **WORM ledger entry'sine pointer** verir (`actor_ref` + `ledger_entry_ref`); event **gövde taşımaz**. Gerekçe **gövdesi** silinebilir `primary-db`'de (`human_decision_rationale`, [data-lifecycle](../privacy/data-lifecycle-register.md)); WORM yalnız id/hash/pointer/meta tutar ([[ATS-0003]]). "Event WORM'dur" değil, "event WORM ledger entry'sine işaret eder".

## 5. Bağlantı
- [[ATS-0004]] (citation+human-approval) · [[ATS-0005]] (assist-vs-conduct) · event-taxonomy (`evidence.human_decision.finalized`/`evidence.tombstone.appended`) · eu-ai-act-index Art.14 · data-lifecycle (`human_decision_rationale`).
