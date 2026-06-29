# DPIA — Veri Koruma Etki Değerlendirmesi — TASLAK

> ⚠️ TASLAK iskelet — `[OWNER/LEGAL/DPO DOLDURUR]`. Hukuki tavsiye/garanti değil.

## 1. İşlemenin tanımı
- Mülakat ses/video + transkript → Türkçe STT + diarization → claim-level citation → **insan onaylı** kanıt dosyası. (ATS-0004)
- Recruitment AI = EU AI Act Annex III **high-risk** alan → DPIA gerekçesi.

## 2. Gereklilik & orantılılık
- Amaç: denetlenebilir, kaynak-alıntılı işe-alım kanıtı (dağınık not yerine).
- Minimizasyon: özel-nitelikli hedeflenmez; TC-Kimlik redaction; ham medya retention-limit.
- **No-scoring/no-affect/no-auto-reject** → otomatik bireysel karar YOK (insan-gözetimi korunur).

## 3. Risk değerlendirme (örnek — `[DPO DOLDURUR]`)
| Risk | Olasılık | Etki | Azaltım |
|---|---|---|---|
| AI hallucination / sahte citation | `[DOLDUR]` | yüksek | entailment + fail-closed (desteksiz iddia gösterilmez) ATS-0004 |
| Cross-tenant veri sızıntısı | `[DOLDUR]` | yüksek | tenant default-deny + per-tenant KMS ATS-0002/0007 |
| Aday rızasız kayıt | `[DOLDUR]` | yüksek | consent/recording-permission-state zorunlu ATS-0003 |
| Silinemez kişisel veri (WORM) | `[DOLDUR]` | orta | WORM≠deletion: unlinkable tombstone ATS-0003 |
| Ayrımcılık/bias | `[DOLDUR]` | yüksek | evidence-first, scoring yok; bias-audit veri modeli (P6) ATS-0005 |
| Prompt-injection / model-output PII leak | `[DOLDUR]` | orta | içerik-veri/talimat ayrımı + output guard ATS-0007 |

## 4. İnsan gözetimi & haklar
- Her finalize **insan onayı** ister. Aydınlatma + açık rıza + DSR/erasure + AI-use disclosure (Art.50).

## 5. Sonuç
- Kalan risk `[DPO DOLDURUR]` kabul edilebilir mi + koşullar. DPO görüşü + tarih + isim.

> `[OWNER/LEGAL/DPO]` doldurur; partner + jurisdiction'a göre. ATS-0003/0004/0005/0007 referans.
