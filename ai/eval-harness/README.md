# ATS-0004 Eval-Harness (pilot-open Gate C ölçüm rig'i)

> Mülakat-AI kalite metriklerini **golden Türkçe fixture** üzerinde ölçer ve `thresholds.json` ile kıyaslar. ATS-0004 + pilot-open release checklist (private `ats-strategy` repo) Gate C'nin makine-uygulanabilir karşılığı. **Build değil, ölçüm altyapısı** (gate-safe).

## Neden var
ATS-0004 "eval-gate-first" diyor: bir provider (self-host / cloud) ancak golden Türkçe fixture eşiklerini **kanıtlarsa** pilot-open Gate C yeşil olur. Bu rig o ölçümü standardize eder → fixture gelince eşikler tek komutla kontrol edilir, provider değişiminde regresyon yakalanır.

## Yapı
```
eval-harness/
  metrics/wer.py        WER (STT) — Levenshtein S/D/I
  metrics/der.py        DER (diarization) — frame-based + optimal speaker mapping (küçük set)
  metrics/citation.py   precision/recall + unsupported-claim + fail-closed
  thresholds.json       eşikler (ŞU AN placeholder/uncalibrated — fixture'da kilitlenecek)
  fixtures/schema.json  golden fixture şeması
  fixtures/example-fixture.json   SENTETİK self-test (gerçek mülakat değil)
  run_eval.py           orchestrator → kırmızı/yeşil Gate C raporu
  tests/test_metrics.py birim testler (harness güvenilirliği)
```

## Çalıştırma
```bash
cd ai/eval-harness
python3 -m pytest tests/ -q              # HARNESS SAĞLIĞI → 11/11, exit 0
python3 run_eval.py                      # sentetik self-test → exit 1 (fail-closed, BEKLENEN)
python3 run_eval.py path/to/golden.json  # gerçek golden Türkçe fixture
```

### Exit-code semantiği (fail-closed — kritik)
`run_eval.py` **yalnız** şu durumda exit `0`: kalibre eşikler (`_status != uncalibrated`) **+** gerçek fixture (`_synthetic` değil) **+** tüm gate yeşil. Aksi her durumda exit `1` (uncalibrated/sentetik dahil) — **tasarım gereği fail-closed**: kalibre olmayan bir gate "geçti" raporlayamaz.
- **Harness'in doğru çalıştığı** = `pytest` (exit 0).
- **Gate C kararı** = `run_eval.py` golden fixture'da exit 0 (G0=GO + kalibrasyon sonrası).
- Sentetik koşu exit 1 = doğru davranış, hata değil.

## Metrikler (Gate C)
| Metrik | Anlam | Eşik (placeholder) |
|---|---|---|
| WER | STT kelime hata oranı | ≤ 0.15 |
| DER | diarization hata oranı | ≤ 0.15 |
| citation_precision | gösterilen alıntıların doğruluğu | ≥ 0.90 |
| citation_recall | yakalanan geçerli alıntı oranı | ≥ 0.80 |
| unsupported_claim_rate | desteksiz ama gösterilen iddia | ≤ 0.02 |
| **fail_closed_rate** | desteksiz iddianın bastırılma oranı | **= 1.0 (SERT)** |

## Kalibrasyon (yapılacak — owner/Zeynep)
1. Rıza-alınmış gerçek **Türkçe panel mülakat** fixture'ı ekle (`fixtures/`, `_synthetic` YOK).
2. `run_eval.py` ile baseline ölç.
3. Owner + cross-AI ile `thresholds.json` değerlerini **kilitle** (`_status: "calibrated"`).
4. Gate C, gerçek fixture + kalibre eşikle yeşil olunca pilot-open'a katkı verir.

## Üretim notları (skeleton → prod)
- **DER:** `pyannote.metrics.DiarizationErrorRate` ile değiştir (collar/overlap toleransı).
- **citation support:** span-overlap proxy → **entailment (NLI)** ile değiştir (ADR-0043); `support_fn` hook'u hazır.
- WER tokenizasyonu Türkçe için yeterli (unicode `\w`); gerekirse normalize (noktalama/sayı) eklenir.
