# ATS-0004 — Mülakat-AI: citation + eval-metric + human-approval

- **Durum:** Kabul edildi (cross-AI AGREE — Codex thread 019ef3d9, REVISE→AGREE); sayısal eval eşikleri golden fixture'da kilitlenecek (pilot-open şartı)
- **Tarih:** 2026-06-23
- **Bağlam kaynağı:** MASTER-PLAN v3.0 §7/§8 + rekabet analizi §3.3/§3.5 · Faz 24 [[project_faz24_tc_intelligence_adr0043]] [[reference_denetim_gpu_pc_bridge]]
- **Karar tipi:** AI-çekirdek mimari (flagship; gate-safe — mevcut Faz 24 varlıklarına dayalı)
- **Board:** [ats#3](https://github.com/Halildeu/ats/issues/3)

## Bağlam

Flagship yetenek = **citation-grounded mülakat scorecard**. Rekabet analizi §3.3 kilit bulgu: global mülakat-zekâsı pazarının iki açık boşluğu = (1) **gerçek per-claim, alıntı-çapalı citation** (Metaview/BrightHire dahil kimse yayınlamıyor), (2) **on-prem/egemen + İngilizce-dışı** stack (endüstri cloud-API bağımlı, Türkçe zayıf). İkisi de **Faz 24 varlıklarımıza birebir denk**:
- **ADR-0043** citation foundation: extract-then-abstract + **entailment** (substring-match DEĞİL), signed-polarity, fail-closed; gerçek-LLM ile kanıtlanmış (#179).
- Türkçe STT (faster-whisper) + diarization (pyannote) + **self-host LLM** (denetim PC RTX 4070, ollama) + WireGuard data-plane.

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

**Olumlu:** global 2 boşluğu (citation + egemen/Türkçe) aynı anda vurur; EU AI Act explainability/audit artefaktı doğal çıktı; defensible flagship.
**Olumsuz:** gerçek Türkçe panel fixture + eval harness gerek (kriter 6, owner/Zeynep sağlar); 8GB VRAM → LLM ≤8B doğru-boyut kısıtı; entailment kalite + latency dengesi.

## Değerlendirilen alternatifler

- **(A) substring-match citation** — RED: ADR-0043 dersi (hallüsinasyon, sahte-citation).
- **(B) cloud-API LLM zorunlu** — RED ana hat: egemenlik kaması kaybı (provider-abstraction ile pilot-cloud opsiyon korunur).
- **(C) AI conduct/otonom scoring+ranking** — RED: EU AI Act high-risk + Mobley v. Workday (ATS-0005).
- **(D) entailment-citation + self-host + human-approval (seçilen).**

## Bağlantı
- [[ATS-0005]] AI-governance (assist çizgisi) · [[ATS-0003]] audit/consent · [[ATS-0001]] Faz 24 provider interface · G0 [execution-system](../G0/g0-execution-system.md) golden fixture.
