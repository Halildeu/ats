# ATS-0006 — Sovereign / on-prem SKU (gated)

- **Durum:** Kabul edildi (cross-AI AGREE — Codex thread 019ef3d9); residual: deployment checklist'e upgrade/patching + offline install + backup-restore drill + telemetry sınırı + support escalation maddeleri yazılacak
- **Tarih:** 2026-06-23
- **Bağlam kaynağı:** MASTER-PLAN v3.0 §6 (P5) + guardrail #6/#7 · rekabet analizi §3.3 (boşluk #2) · [[ATS-0002]] topology · [[ATS-0004]] self-host provider
- **Karar tipi:** Ürün/dağıtım SKU (gate'li — erken pazarla, geç teslim)

## Bağlam

Sovereign/on-prem = en güçlü yapısal kamalardan biri (rekabet §3.3 boşluk #2: tüm endüstri cloud-API bağımlı). AMA guardrail #6/#7 net uyarı: **on-prem'i erken TESLİM etmek tuzak** — müşteri "ister" der ama bakım/güncelleme/güvenlik yükünü almak istemez; junior ekip için gerçek on-prem support = ürünü öldüren operasyonel yük (Gemini: "2. yılda batırabilir"). Mülakat-zekâsı zaten self-host LLM ile çalışıyor (Faz 24), yani mimari mümkün; soru **ne zaman SKU olarak teslim edilir**.

## Karar

**Mimari gün-1 sovereign-ready; SKU teslimi gate'li (≥1-2 ücretli partner sonrası); pricing 2-katman.**

1. **Mimari hazırlık (gün-1, teslim değil):** ATS-0001 boundary + ATS-0002 topology + ATS-0004 self-host provider zaten on-prem/BYO-region'ı **mümkün** kılar. Satış anlatısı **"sovereign-ready architecture"** erken kullanılabilir (overclaim değil — mimari gerçekten hazır).
2. **SKU teslim gate'i (HEPSİ gerekir):** ≥1-2 **ücretli** design-partner on-prem talep ediyor + **min contract value** eşiği (kurulum-projesi değil ürün) + yazılı **deployment checklist** (donanım/GPU sizing/ağ/güncelleme/backup/support SLA) + **support model** tanımlı. Yoksa on-prem teslim YAPILMAZ.
3. **Pricing 2-katman:** add-on (managed) = seat/interview, şeffaf TL + e-Fatura. Sovereign/enterprise = **quote** (annual license + implementation + support + GPU sizing). Şeffaf-TL on-prem'de geçerli DEĞİL.
4. **GPU/sizing gerçeği:** self-host LLM ≤8B (8GB VRAM sınıfı) → doğru-boyut; daha büyük model/eşzamanlılık için müşteri donanımı sizing checklist'te (ADR-0004 eval-gate kalite şartıyla birlikte).

## Sonuçlar

**Olumlu:** moat (sovereign) satış anlatısı erken; ops yükü gate'le kontrollü; pricing gerçekçi; kurulum-projesi tuzağından kaçınma.
**Olumsuz:** "sovereign-ready" iddiası test edilmeli (overclaim riski → ADR-0002 on-prem topoloji smoke gerek); ilk on-prem teslimde support modeli olgunlaşmamış olabilir → min contract + checklist şart.

## Değerlendirilen alternatifler

- **(A) On-prem'i hiç yapma (managed-only)** — RED: en güçlü kamayı bırakmak, regüle/savunma/kamu pazarı kapanır.
- **(B) Gün-1 on-prem SKU teslim** — RED (guardrail #6): kurulum-projesi satarsın, junior ekip support yükünde batar.
- **(C) Mimari-hazır + gate'li-teslim + 2-katman-pricing (seçilen).**

## Bağlantı
- [[ATS-0002]] deployment topology · [[ATS-0004]] self-host eval-gate · [[ATS-0001]] boundary · MASTER-PLAN P5 + guardrail #6/#7.
