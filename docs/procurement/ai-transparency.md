# AI Transparency — Model-Card + AI-Use Disclosure — TASLAK

> ⚠️ TASLAK — `[OWNER DOLDURUR]`. EU AI Act Art.50 transparency + ATS-0004/0005. Garanti değil.

## A. Model-card (sistem davranışı)
- **Amaç:** mülakat transkriptinden **kaynak-alıntılı (citation) kanıt** çıkarımı. **Karar/puanlama DEĞİL.**
- **Girdi:** ses/video → STT (faster-whisper, Türkçe) + diarization (pyannote) → transkript.
- **AI işlevi:** extract-then-abstract + **entailment-citation** (ADR-0043): her iddia transkript alıntısına bağlı; desteksiz iddia **fail-closed** (gösterilmez).
- **YAPMAZ (ATS-0005):** numeric/comparative scoring · ranking · affect/emotion · otonom auto-reject. **İnsan onayı zorunlu.**
- **Sınırlar:** Türkçe-odaklı; STT/diarization hata payı (WER/DER eval-harness ölçümü, golden fixture'da kalibre); hallucination fail-closed ile bastırılır ama %100 doğruluk iddia edilmez.
- **Sağlayıcı:** eval-gate'i geçen provider (self-host tercih / pilot-cloud interface ardında).

## B. AI-use disclosure (Art.50 — son kullanıcıya)
- "Bu mülakatta yapay zekâ destekli **not/kanıt çıkarımı** kullanılmaktadır. AI **karar vermez**; kaynak-alıntılı kanıt üretir, **insan değerlendirir/karar verir**."
- Aday/interviewer aydınlatma + açık rıza (recording-permission-state) + AI kullanım bildirimi.
- Model/version + human-oversight log tutulur.

## C. Governance kaydı
- Her öneride: model+version, tool, kaynak alıntı(lar), insan onay durumu → audit timeline.

> `[OWNER DOLDURUR]` partner-özel disclosure + jurisdiction. ATS-0004/0005 referans.
