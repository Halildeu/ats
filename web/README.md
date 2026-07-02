# web — ürün-yüzeyi temeli (gate-safe foundation)

> Owner direktifi (2026-06-29) ile **gate-safe product-surface foundation** açıldı. ATS-0011 (WCAG 2.2 AA + tr-TR i18n) + ATS-0001 boundary standartlarının **kod karşılığı**.
>
> **Mevcut (machine-enforced — `scripts/check-web-foundation.mjs` / CI `web-foundation-guard`):**
> - `design-system/tokens.json` — renk/kontrast token'ları (**kontrast oranı guard'da HESAPLANIR** + WCAG 2.2 AA min ile karşılaştırılır; sadece beyan değil) + target-size ≥24px (WCAG 2.5.8) + focus-visible.
> - `i18n/tr-TR.json` — Türkçe-first mesaj kataloğu (key dot.case + boş-değer-yok + ICU-brace-dengeli).
> - `src/contracts/component-contracts.ts` — typed component prop sözleşmeleri (Button/ConsentBanner/EvidenceBadge/ReviewPanel); metin `MessageKey`, veri `OpaqueRef`; ham-PII/score/affect alan YASAK; **React runtime import YOK**.
>
> **Gate-safe sınır (No-Fake-Work):**
> - 🔒 Sonraki slice'lar (ATS-0016 sıralı teslim; release/gerçek-veri G0-kilitli): gerçek React bileşeni, JSX/render, story/screen, axe/eslint runtime harness, ingest/STT/diarization/LLM/citation-runtime, backend/PII/WORM, export/render, ATS write-back, persistence, finalize.
> - "ürün UI tamamlandı / pilot-ready / citation çalışıyor / a11y compliant" **İDDİA EDİLMEZ**. Burası yalnız **token + katalog + tip sözleşmesi**; çalışan bileşen yok.
>
> Standartlar: [docs/frontend/a11y-i18n-standard.md](../docs/frontend/a11y-i18n-standard.md) · [docs/adr/ATS-0011-accessibility-i18n-standard.md](../docs/adr/ATS-0011-accessibility-i18n-standard.md) · [docs/evidence/evidence-packet-manifest.md](../docs/evidence/evidence-packet-manifest.md) · [docs/governance/human-oversight-standard.md](../docs/governance/human-oversight-standard.md).
