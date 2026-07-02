# ai/ — Faz 25 ATS AI plane (Python)

`ats-ai` servisi (ATS-0008): Faz 24 motoru (Türkçe STT faster-whisper + diarization pyannote + self-host LLM ollama + entailment-citation ADR-0043) `AIProvider` sözleşmesi (ATS-0001) ardında. **P1 build AKTİF (ATS-0016, owner kararı 2026-07-02)**; STT/diarization provider bağlantısı kendi slice sırasında (provider seçimi = ayrı cross-AI karar); release/gerçek-veri G0-kilitli.

## Şu an (gate-safe)
| Dizin | İçerik | Durum |
|---|---|---|
| `eval-harness/` | ADR-0004 **Gate C** ölçüm rig'i (WER/DER/citation/fail-closed) | ✅ rig hazır; eşikler G0-locked |
| `ats-ai/` (sonra) | FastAPI servis (AIProvider impl) | 🔒 sonraki slice (ATS-0016; provider seçimi ayrı cross-AI karar) |

## Eval-harness (Gate C)
```bash
cd ai/eval-harness
python3 -m pytest tests/ -q       # harness sağlığı → 30/30, exit 0
python3 run_eval.py               # sentetik self-test → exit 1 (fail-closed, BEKLENEN; pilot kararı VERMEZ)
python3 run_eval.py golden.json   # gerçek golden Türkçe fixture (operator-provided / consented)
```
Eşikler `thresholds.json` **uncalibrated placeholder** — golden Türkçe fixture'da kilitlenmeden pilot-open Gate C yeşil sayılmaz (ATS-0004). CI'a bağlama billing düzelince (PR-with-workflow).
