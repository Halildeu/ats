# Golden Türkçe Fixture Collection Pack (G0 kriter 6 enabler)

> **Amaç:** eval-harness (ATS-0004 Gate C) eşiklerinin **gerçek, rıza-alınmış Türkçe mülakat** üzerinde kalibre edilmesi için owner/Zeynep'in toplaması gerekenleri turnkey yapar. **Ürün build değil.** Sentetik fixture pilot kararı VERMEZ (run_eval fail-closed).
>
> KVKK/ATS-0003: mülakat ses/video + transkript = aday kişisel verisi → **açık rıza + minimizasyon + redaction zorunlu**.

## 1. Consent / release template (fixture-kullanım rızası)
Her kayıt için **yazılı** alınır (aday + interviewer):
- "Bu mülakat kaydı/transkripti, [şirket]'in işe-alım kanıt sistemi **kalite ölçümü** için **redakte/pseudonymize edilmiş** olarak kullanılabilir." (Not: redaksiyon sonrası dahi bağlama göre **kişisel veri sayılmaya devam edebilir**; açık rıza + KVKK kontrolleri altında işlenir — "tam anonim" iddia edilmez.)
- Kapsam: STT/diarization/citation doğruluk ölçümü. Otomatik karar/puanlama YOK (ATS-0005).
- Geri çekme (withdrawal) + saklama süresi + silme (DSR) yolu.
- Özel-nitelikli veri toplanmaz; geçerse redaksiyon.
- İmza + tarih + veri sorumlusu iletişim.

## 2. Recording protocol
- 3+ konuşmacı paneli (DER için overlap dahil).
- Türkçe; aksan/ortam çeşitliliği (gerçekçi WER); en az 1 gürültülü-ortam.
- 10-20 dk segment; format + sample-rate + kanal manifest'e yazılır.

## 3. Anonymization / redaction checklist (KVKK)
- [ ] Ad-soyad -> S1/S2/S3 (gerçek isim YOK)
- [ ] TC-Kimlik / telefon / e-posta / adres -> [REDACTED]
- [ ] Şirket özel adları -> [ORG]
- [ ] Özel-nitelikli içerik (sağlık/din/etnik/biyometrik) -> çıkarılır
- [ ] Ham medya fixture repo'ya KONULMAZ (yalnız **redakte** transkript + segment metadata)
- [ ] Redaction sonrası 4-göz doğrulama

## 4. Fixture manifest schema (eval-harness ile hizalı)
`ai/eval-harness/fixtures/schema.json` ile uyumlu:
- `id`, `_synthetic: false` (gerçek).
- `reference`: insan-doğrulanmış ground-truth `transcript` + `speakers`.
- `hypothesis`: sistem STT `transcript` + `speakers`.
- `claims[]` (schema birebir, `additionalProperties:false`): `claim_text`, `predicted_citation`, `shown_as_supported` (bool), `ground_truth_valid_spans` -> precision/recall/unsupported/fail-closed.
- Ek: protokol, redaction-onay, rıza-ref (id, kişisel veri değil), dil `tr`, konuşmacı sayısı.

> `python3 run_eval.py <golden>.json` -> şema + eşik raporu. Eşikler ilk gerçek ölçümden sonra owner+cross-AI ile `thresholds.json`'da kilitlenir (uncalibrated -> exit 1 fail-closed).

## 5. Annotation guide
- Transkript: birebir (dolgu dahil); belirsiz -> [?].
- Diarization: konuşmacı-değişim zaman-damgası; overlap -> iki segment.
- Claim/citation: rubric alanı başına iddia + destekleyen span; desteksiz -> shown=false (fail-closed beklenir).
- İki annotator + uzlaşma.

## 6. Expected-output rubric
| Metrik | Ne | Hedef |
|---|---|---|
| WER | STT kelime hatası | [G0-KİLİTLİ] |
| DER | diarization (3+ konuşmacı) | [G0-KİLİTLİ] |
| citation precision | gösterilen alıntı doğruluğu | [G0-KİLİTLİ] (yüksek öncelik) |
| citation recall | yakalanan geçerli alıntı | [G0-KİLİTLİ] |
| unsupported-claim rate | desteksiz ama gösterilen | [G0-KİLİTLİ] |
| **fail-closed rate** | desteksizin bastırılması | **= %100 (sert)** |

## Owner aksiyon özeti
1. >=1 (tercihen 3+) gerçek Türkçe panel -> consent (§1) + protocol (§2).
2. Redaction (§3) + annotation (§5) -> manifest (§4).
3. `run_eval.py` -> ilk ölçüm -> owner+cross-AI eşik kilidi.
4. = G0 kriter 6 kanıtı.

## Bağlantı
[../G0/g0-turnkey-decision-pack.md](../G0/g0-turnkey-decision-pack.md) · [../adr/ATS-0004-mulakat-ai-citation-eval-human-approval.md](../adr/ATS-0004-mulakat-ai-citation-eval-human-approval.md) · [../adr/ATS-0003-kvkk-recording-consent-worm-vs-deletion.md](../adr/ATS-0003-kvkk-recording-consent-worm-vs-deletion.md) · `../../ai/eval-harness/`
