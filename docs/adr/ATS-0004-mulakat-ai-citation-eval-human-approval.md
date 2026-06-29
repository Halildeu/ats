# ATS-0004 — Mülakat-AI: citation + eval-metric + human-approval

- **Durum:** Kabul edildi (cross-AI AGREE — Codex thread 019ef3d9, REVISE→AGREE); sayısal eval eşikleri golden fixture'da kilitlenecek (pilot-open şartı)
- **Tarih:** 2026-06-23
- **Bağlam kaynağı:** Private `ats-strategy` canon + [[ATS-0001]]/[[ATS-0003]]/[[ATS-0005]]/[[ATS-0007]]
- **Karar tipi:** AI-çekirdek mimari (flagship; gate-safe — mevcut Faz 24 varlıklarına dayalı)
- **Board:** [ats#3](https://github.com/Halildeu/ats/issues/3)

## Bağlam

Flagship yetenek = **citation-grounded mülakat scorecard**. İki tasarım hedefi: (1) **gerçek per-claim, alıntı-çapalı citation** (entailment-temelli, substring değil), (2) **on-prem/egemen + Türkçe** destekli stack. Teknik temel:
- Citation: extract-then-abstract + **entailment** (signed-polarity, fail-closed).
- Türkçe STT (faster-whisper) + diarization (pyannote) + **self-host LLM** seçeneği.
> (Rekabet konumlama + iç altyapı detayı: private `ats-strategy`.)

## Karar

**Pipeline = ingest → Türkçe STT → diarization → entailment-citation LLM → claim-level scorecard → human edit/approve → audit. Eval-metric baştan. Human-in-the-loop zorunlu.**

1. **Pipeline (Faz 24 servisleri provider/interface olarak — ATS-0001):**
   `audio/video/transcript ingest (Teams/Graph/upload) → faster-whisper STT (Türkçe) → pyannote diarization → LLM extract-then-abstract + entailment-citation (ADR-0043) → rubric alanlarına claim-level citation → human edit/approve → immutable audit`.
2. **Citation invariant:** her AI iddiası, kaynak transkript alıntısına **entailment** ile bağlı (substring değil); desteklenmeyen iddia **fail-closed** (gösterilmez/işaretlenir). Her rating tıkla→kaynak-alıntı.
3. **Evidence-first / score-second (MVP = evidence-ONLY, Codex REVISE):** MVP'de **numeric/comparative scoring YOK** → yalnız claim-level **evidence checklist** + insan-yazımı (human-authored) karar gerekçesi. Sayısal/karşılaştırmalı puanlama = sonraki gated regüle alt-sistem (ATS-0005). İlk satış cümlesi "AI puan veriyor" DEĞİL → "AI kanıt çıkarır, insan değerlendirir".
4. **Human-in-the-loop ZORUNLU:** insan düzenler/onaylar; **affect/emotion analizi YOK; otonom auto-reject YOK** (ATS-0005).
5. **Eval-metric baştan (golden Türkçe fixture):** WER (STT), DER (diarization), citation precision/recall, unsupported-claim rate, hallucination fail-closed oranı, human override/edit-rate. (G0 M6 kriter 6.)
6. **Provider abstraction — eval-gate-first (Codex REVISE):** default = **golden Türkçe fixture eval-gate'ini geçen provider** (self-host 8GB/≤8B otomatik güvenlik zemini DEĞİL). Self-host LLM **primary olur ancak** §"acceptance threshold"ları kanıtlarsa; aksi halde pilot cloud-LLM (interface arkasında) primary + self-host paralel kalifikasyon. Egemenlik = hedef SKU (ADR-0006), ama **kalite-gate default'u belirler**; müşteri-bazlı sovereign/cloud seçimi.

### Acceptance threshold (pilot-open gate — cross-cutting, G0 M6 kriter 6)
Aşağıdaki eşikler **golden Türkçe panel fixture'da** ölçülüp **kilitlenmeden** pilot açılmaz (hedefler ilk fixture'da kalibre edilir, sonra regresyon-gate):
- **WER** (STT) ≤ hedef [fixture'da kilitlenir] · **DER** (diarization) ≤ hedef · 3+ konuşmacı overlap dayanımı.
- **Citation precision** ≥ hedef (yüksek öncelik) · **recall** ≥ hedef.
- **Unsupported-claim rate** ≤ hedef · **hallucination fail-closed** = %100 (desteklenmeyen iddia ASLA onaysız gösterilmez — sert invariant).
- **Human override/edit-rate** ölçülür (baseline). Provider/model değişiminde tüm set re-run (regresyon yok şartı).

## Sonuçlar

**Olumlu:** citation + Türkçe/egemenlik uyumu, denetlenebilirlik ve açıklanabilirlik gereksinimlerini destekler; EU AI Act explainability/audit artefaktı doğal çıktı.
**Olumsuz:** operator-provided / consented golden Türkçe fixture + eval harness gerek (kriter 6); self-host LLM boyut/VRAM kısıtı; entailment kalite + latency dengesi.

## Değerlendirilen alternatifler

- **(A) substring-match citation** — RED: ADR-0043 dersi (hallüsinasyon, sahte-citation).
- **(B) cloud-API LLM zorunlu** — RED ana hat: egemenlik kaması kaybı (provider-abstraction ile pilot-cloud opsiyon korunur).
- **(C) AI conduct/otonom scoring+ranking** — RED: EU AI Act high-risk + Mobley v. Workday (ATS-0005).
- **(D) entailment-citation + self-host + human-approval (seçilen).**

## Bağlantı
- [[ATS-0005]] AI-governance (assist çizgisi) · [[ATS-0003]] audit/consent · [[ATS-0001]] Faz 24 provider interface · G0 [execution-system](../G0/g0-execution-system.md) golden fixture.
