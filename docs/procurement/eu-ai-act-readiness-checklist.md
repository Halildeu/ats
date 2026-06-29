# EU AI Act — Readiness / Gap Checklist — TASLAK

> ⚠️ **Conformity/uyum beyanı DEĞİL** — yalnız **hazırlık/gap** öz-değerlendirme iskeleti. `[OWNER/LEGAL DOLDURUR]`. Resmi conformity assessment + technical-file ayrı, yetkili süreç (P3+).

Recruitment AI = Annex III **high-risk**. Aşağıdaki maddeler **hazırlık** durumudur (✅ tasarımda var / 🟡 kısmi / ☐ yapılacak); hiçbiri "uyumlu sertifikası" anlamına gelmez.

| Madde (EU AI Act) | Tasarım karşılığı | Durum |
|---|---|---|
| Risk yönetim sistemi | DPIA + risk matrisi (dpia-template) | 🟡 taslak |
| Veri yönetişimi / kalite | eval-harness (WER/DER/citation) + golden fixture | 🟡 rig var, kalibrasyon G0 |
| Teknik dokümantasyon | model-card + ADR seti (ai-transparency) | 🟡 iskelet |
| Kayıt tutma (logging) | WORM audit + model/version + human-oversight log | ✅ tasarım |
| Şeffaflık (Art.50) | AI-use disclosure (ai-transparency §B) | 🟡 taslak |
| İnsan gözetimi | human edit/approve zorunlu; no-auto-reject (ATS-0005) | ✅ tasarım |
| Doğruluk/sağlamlık/güvenlik | eval eşik + fail-closed + ATS-0007 güvenlik | 🟡 |
| Yasaklı uygulamalar kaçınma | **affect/emotion analizi YOK** (işyeri yasağı); denetlenmemiş ranking YOK | ✅ kalıcı yasak |
| Bias/ayrımcılık | evidence-first, scoring yok; bias-audit veri modeli baştan (P6) | 🟡 |
| Kalite yönetim sistemi | governance ADR + promotion ledger | 🟡 |

> **Gap = G0/P1 sonrası** doldurulur. Bu checklist owner/legal'in EU AI Act hazırlığını **izlemesi** içindir; conformity iddiası **içermez**. ATS-0005 referans.
