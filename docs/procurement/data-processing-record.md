# Veri İşleme Kaydı — Data-Flow + Saklama Matrisi + Subprocessors — TASLAK

> ⚠️ TASLAK — `[OWNER DOLDURUR]`. Mimari hedef (ATS-0002/0003/0008); pilot'a göre kesinleşir.

## 1. Data-flow (özet)
```
Aday/Interviewer (consent) → ingest (Teams/Graph veya upload)
  → ats-ai (Türkçe STT + diarization + entailment-citation; provider eval-gate)
  → ats-core (interview-workspace + evidence-ledger WORM)
  → human edit/approve → export (PDF/secure-link/email/webhook) [+ narrow write-back 3-koşul]
Store: candidate-PII (interview-workspace) · raw media/transcript (ingest-media) · WORM evidence (evidence-ledger)
       — hepsi tenant-scoped (ATS-0002) + per-tenant KMS (ATS-0007); object store G0'da seçilir.
```

## 2. Saklama (retention) matrisi `[OWNER DOLDURUR]`
| Veri | Saklama süresi | Silme yolu | Not |
|---|---|---|---|
| Ham ses/video | `[DOLDUR, ör. pilot+30g]` | retention timer + imha | WORM'da DEĞİL → silinebilir (ATS-0003) |
| Transkript (redakte) | `[DOLDUR]` | DSR/erasure | silinebilir |
| Candidate-PII | `[DOLDUR]` | DSR + salt-key destruction | unlinkable tombstone |
| WORM evidence (metadata/hash/approval) | `[DOLDUR, denetim süresi]` | **silinmez**; pseudonymize + tombstone | denetim kanıtı (içerik değil) |
| Audit/model-version log | `[DOLDUR]` | — | EU AI Act explainability |

## 3. Subprocessors `[OWNER DOLDURUR]`
| Alt-işleyen | Hizmet | Veri | Yer | Not |
|---|---|---|---|---|
| `[ör. self-host LLM / cloud-pilot provider]` | STT/LLM inference | ses/transkript | `[TR/EU/...]` | provider eval-gate; sovereign tercih (ATS-0004/0006) |
| `[object store: MinIO self-host / cloud S3]` | media/transcript store | ham medya | `[DOLDUR]` | G0'da seçilir; tenant-scoped+KMS |
| `[email/webhook sağlayıcı]` | export bildirimi | packet metadata | `[DOLDUR]` | — |

> Default eğilim: sovereign/TR-residency (MinIO + self-host LLM). Cloud-pilot kullanılırsa subprocessor + aktarım maddesi (DPA).
