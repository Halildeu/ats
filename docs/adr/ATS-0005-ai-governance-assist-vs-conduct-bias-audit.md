# ATS-0005 — AI-governance: assist-vs-conduct + bias-audit + EU AI Act

- **Durum:** Kabul edildi (cross-AI AGREE — Codex thread 019ef3d9, REVISE→AGREE)
- **Tarih:** 2026-06-23
- **Bağlam kaynağı:** Private `ats-strategy` canon · regülasyon: EU AI Act, KVKK, NYC LL144, Mobley v. Workday
- **Karar tipi:** AI-governance / legal-posture (gate-safe; ürünün hukuki kalkanı)
- **İzlenebilir index:** [docs/ai-governance/eu-ai-act-technical-file-index.md](../ai-governance/eu-ai-act-technical-file-index.md) — EU AI Act madde→artefakt→residual readiness matrisi (public, machine-checked: `eu-ai-act-guard`; overclaim-yasağı).

## Bağlam

Recruitment AI = EU AI Act'te **high-risk** alan (Annex III). Risk gradyanı (rekabet §3.5):
- 🔴 **KAÇIN:** AI video + **duygu/affect analizi** (EU işyerinde yasak, Şub 2025; US BIPA).
- 🔴 **Yüksek:** otonom (insansız) auto-reject (EU insan-gözetimi ihlali); aday ranking/scoring (EU high-risk; NYC LL144 bias-audit; *Mobley v. Workday*).
- 🟡 **Orta:** insana besleyen sourcing/matching.
- 🟢 **Düşük:** not-alma/özet (assist), scheduling, JD yazımı.

3-AI mutabakatı: ürün **assist** tarafında ("kanıt üretir, insan karar verir"); ama Codex uyarısı: *scoring üretiyorsan "assist demek tek başına hukuki kalkan değil"* → governance gömülü olmalı.

## Karar

**Ürün assist-posture'da kalır; her scoring/ranking zorunlu human-override + audit altında regüle alt-sistemdir; affect ve otonom auto-reject HİÇBİR ZAMAN.**

1. **Assist çizgisi (sabit):** AI kanıt/öneri üretir; **karar insanın**. "conduct" (AI'ın soru sorup otonom puanlayıp eleme) ürün kapsamı DIŞI.
2. **Kalıcı yasaklar (hiçbir SKU'da yok):** duygu/affect/emotion analizi · otonom (insansız) auto-reject · denetlenmemiş ranking.
3. **MVP'de scoring YOK (Codex REVISE):** MVP = claim-level **evidence checklist** + **human-authored decision rationale**; AI sayısal/karşılaştırmalı puan veya ranking ÜRETMEZ (bu dil tek başına EU AI Act regüle alt-sistemini tetikler). **Scoring/ranking sonraki gated alt-sistem:** açılırsa = zorunlu human-override + audit-log + AI-use disclosure + protected-attribute guardrail + (gerekirse) NYC LL144 bias-audit. Önce evidence ürünü kanıtlanır, scoring gate'le gelir.
4. **Bias-audit:** yayınlanabilir fairness dashboard (P6 teslim) ama **veri modeli baştan** (audit verisi gün-1 toplanır; sonradan geriye-dönük üretilemez). citation = audit kanıtı (ADR-0004).
5. **EU AI Act / NYC LL144 artefaktları:** model/version log + human-oversight log + transparency disclosure (Art.50) + technical-file/conformity (P3+ procurement). 
6. **KVKK kesişimi:** açık rıza + aydınlatma + DSAR + VERBIS + özel-nitelikli/biyometrik dokunma yasağı (ATS-0003).

## Sonuçlar

**Olumlu:** legal kalkan + "uyumu güven ürününe çevir" (bias-audit = feature); regüle alıcıya risk-azaltma satışı; Mobley-tipi davalardan kaçınma.
**Olumsuz:** "score" özelliği kısıtlı/insan-onaylı (bazı müşteri "tam otomasyon" bekleyebilir → bilinçli reddedilir); bias-audit veri modeli baştan maliyet.

## Değerlendirilen alternatifler

- **(A) Full agentic otonom screening** — RED: EU high-risk + Gartner %40 fail + güven kaybı.
- **(B) Affect/duygu analizi (rakip "fark" diye sunuyor)** — RED: yasak; negatif beklenen değer.
- **(C) "Assist" deyip governance gömmeme** — RED (Codex): scoring varsa assist-etiketi tek başına kalkan değil.
- **(D) Assist + gömülü governance + bias-audit (seçilen).**

## Bağlantı
- [[ATS-0004]] human-approval/citation · [[ATS-0003]] KVKK/consent · MASTER-PLAN "Bilinçli YOK" listesi.
