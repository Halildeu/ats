# Competitive Battle-Card (B-lite) — outreach / DPO / LOI

> Tek-sayfa konumlama. Amaç: outreach + DPO görüşmesi + LOI itirazlarına net cevap. **Yeni feature backlog üretmez** (scope-freeze korunur). Kaynak: master-plan §7 + rekabet analizi.

## Tek cümle konumlama
**"Regüle/mahremiyet-duyarlı kurumlar için, mevcut ATS'inizin ÜSTÜNDE çalışan, Türkçe/on-prem opsiyonlu, kaynak-alıntılı + insan-onaylı + denetlenebilir mülakat KANIT dosyası."** (evidence-first; "AI puan veriyor" DEĞİL.)

## Rakip haritası + bizim kama
| Rakip | Sınıf | Güçlü | Bizim fark (kama) |
|---|---|---|---|
| **Metaview / BrightHire** | AI interview intelligence | not/özet, US/İngilizce | **per-claim entailment-citation** (kaynak-alıntı, fail-closed) + **Türkçe** + **on-prem/egemen** + **no-scoring** |
| **Ashby** | AI-native ATS suite | analitik + tam ATS | biz ATS değiliz → **mevcut ATS üstüne add-on** (rip-and-replace yok; düşük sürtünme) |
| **Kariyer.net** | TR dağıtım + ATS yüzeyi | yerel dağıtım | mülakat-zekâsında **citation + egemen + Türkçe + audit** ile üstte; dağıtım opsiyonel |
| agentic screening | otomatik eleme | "tam otomasyon" | **bilinçli reddediyoruz** — EU AI Act high-risk; biz **assist** (kanıt üretir, insan karar) |

## Moat (tek özellik değil — bundle)
regüle workflow'a gömülü **evidence schema** + lokal **hukuki/procurement paket** + **Türkçe diarization kalitesi** + **entegrasyon playbook** + tekrarlanabilir **deployment**.

## İtiraz → cevap (DPO/LOI)
- *"AI aday eler mi?"* → Hayır. **no-scoring/no-affect/no-auto-reject** (ATS-0005); insan onayı zorunlu (DPIA).
- *"Verilerimiz nereye?"* → TR-residency/on-prem-uyumlu; tenant izolasyon + KMS (security-posture + data-processing-record).
- *"KVKK/silme?"* → consent + DSR/erasure + WORM≠deletion (DPA/DPIA).
- *"ATS'imizi değiştirmem gerekir mi?"* → Hayır. Export taban; write-back opsiyonel (3-koşul).
- *"AI yanlış söylerse?"* → desteksiz iddia **fail-closed** + citation; kalite eval-harness ile ölçülür.
- *"SOC2/ISO?"* → Henüz yok; **mimari + kontrol kanıtı** (security-posture); sertifika gated (P5).

## Bilinçli YOK (sınır)
duygu/affect analizi (EU yasak) · insansız auto-reject · denetlenmemiş ranking · full-ATS (P6 gated).

> Bağlantı: [../G0/g0-turnkey-decision-pack.md](../G0/g0-turnkey-decision-pack.md) · [../procurement/README.md](../procurement/README.md) · master-plan §7.
