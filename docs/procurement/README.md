# Procurement / DPO / InfoSec Due-Diligence Template Pack (A-lite)

> **NE DEĞİL:** Bu pack hukuki tavsiye, uyumluluk **garantisi**, sertifikasyon (SOC2/ISO), veya tamamlanmış EU AI Act technical-file **DEĞİLDİR**.
> **NE:** Regüle alıcının DPO/InfoSec/procurement ekibinin **istediği belgelerin TASLAK iskeletleri**. Her dosya `[OWNER/LEGAL DOLDURUR]` alanları içerir; **owner + hukuk + InfoSec** doldurur, gözden geçirir, sorumluluğu üstlenir.
>
> ATS-0005 çizgisi: ürün **"uyum kanıtı + kontrol üretir", uyumu garanti ETMEZ**. Bu belgeler de kanıt/kontrol iskeletidir.

## Neden (G0 enabler)
G0 kriter 4 (≥2 DPO yazılı sign-off) + procurement, bu belgeler olmadan ilerlemez. Pack, owner'ın DPO görüşmesine **hazır taslaklarla** girmesini sağlar (G0 turnkey ile bağlı: `../G0/g0-turnkey-decision-pack.md`).

## İçerik
| Dosya | Ne | DPO/InfoSec sorusu | ADR |
|---|---|---|---|
| [dpa-template.md](./dpa-template.md) | Veri İşleme Sözleşmesi taslağı | "DPA imzalar mısınız?" | ATS-0003 |
| [dpia-template.md](./dpia-template.md) | DPIA (etki değerlendirme) iskeleti | "Yüksek-risk işleme DPIA'sı?" | ATS-0003/0005 |
| [data-processing-record.md](./data-processing-record.md) | Veri akışı + saklama matrisi + subprocessor listesi | "Veri nereye gidiyor, ne kadar saklanıyor, kimler?" | ATS-0002/0003 |
| [security-posture-whitepaper.md](./security-posture-whitepaper.md) | Güvenlik duruşu (tenant izolasyon, KMS, AI-threat) | "Verilerimiz nasıl korunuyor?" | ATS-0002/0007 |
| [incident-response-runbook.md](./incident-response-runbook.md) | Olay müdahale + ihlal bildirimi iskeleti | "İhlal olursa ne yaparsınız?" | ATS-0007 |
| [ai-transparency.md](./ai-transparency.md) | Model-card + AI-use disclosure (Art.50) | "AI ne yapıyor, nasıl açıklanıyor?" | ATS-0004/0005 |
| [eu-ai-act-readiness-checklist.md](./eu-ai-act-readiness-checklist.md) | EU AI Act **readiness/gap** checklist (conformity DEĞİL) | "EU AI Act hazırlığınız?" | ATS-0005 |

## Kullanım
1. Owner/hukuk her taslağı partner + jurisdiction'a göre doldurur.
2. DPO görüşmesinde sunulur (`g0-turnkey` DPO script).
3. **Yazılı** DPO sign-off → G0 kriter 4 kanıtı.

> Disclaimer: Tüm dosyalar TASLAK. Yürürlüğe girmeden önce yetkili hukuk + DPO onayı zorunlu. "Hazır/uyumlu/sertifikalı" iddiası içermez.
