# ATS Fazlı Yol Haritası — Global Rakip Benchmark'lı, "Üst Seviye" Hedefli

> ⚠️ **DURUM — v2 sonrası SÜPERSEDED:** Bu dokümandaki FAZ SIRALAMASI (Faz 0-E, full-ATS-first) cross-AI mutabakatıyla (Claude+Codex) değişti. **Güncel canonical = [00-ATS-MASTER-PLAN](./00-ATS-MASTER-PLAN.md) v2.0** (G0→P1..P6, interview-evidence-add-on-first). Buradaki rakip-benchmark + 7 üst-seviye yetenek + "üst-seviye" tanımı ANALİZ olarak geçerli; yalnız SIRALAMA superseded.
>
> 2026-06-22. Girdi: [01-rekabet-analizi](./01-rekabet-analizi-ve-ozellik-stratejisi-2026.md). Owner direktifi: "global rakipleri de dikkate al, rakiplere göre kapsamı fazlı ve üst seviye yap."
>
> Baked-in kabuller (owner "önerilerin uygun" → varsayılanlarım onaylandı): mülakat-zekâsı = **flagship** · agentic = **governed-assist** (insan shortlist, fail-closed) · ICP = **regüle/mahremiyet-duyarlı kurumlar (global), TR beachhead**.

---

## 0. Çerçeve yükseltmesi — TR hendekleri → GLOBAL diferansiyeller

"Üst seviye + dünya rakipleri" hedefiyle stratejiyi yeniden çerçeveliyoruz. TR moatlarımız aslında global pazarda kıt olan şeylere genelleşiyor:

| TR hendeği | Global genelleşmesi (üst-seviye kama) | Kimde var? |
|---|---|---|
| KVKK-residency | **Veri-egemenliği / on-prem / BYO-region** — EU (GDPR+AI Act), Körfez, finans/savunma/sağlık/kamu (her ülke) | Hiçbir global SaaS ATS (hepsi US/EU cloud) |
| Türkçe egemen AI | **Çok-dilli egemen AI** (self-host LLM/STT) — veri-çıkışı yasak sektörler | Yok (endüstri cloud-API bağımlı) |
| Citation'lı mülakat zekâsı | **Kaynaklı + denetlenebilir AI kararı** — EU AI Act explainability artefaktı | Yok (kimse gerçek citation yayınlamıyor) |

→ **Konumlama:** "AI-native + compliance-native + egemen-kurulabilir ATS — regüle/mahremiyet-duyarlı kurumlar için dünyada en iyi." TR = ilk beachhead pazar, ama mimari ve kama global.

---

## 1. Rakiplerin ÜSTÜNE çıktığımız 7 yetenek ("üst seviye" tanımı)

Bunlar paritenin ötesi — global liderlerde bile **yok** ya da **zayıf**. Best-in-class iddiamız bunlara dayanıyor:

| # | Üst-seviye yetenek | Şu an kimde var | Bizim avantaj kaynağı |
|---|---|---|---|
| 1 | **Citation-grounded mülakat scorecard** (her rating tıkla→transkript-alıntısı) | Kimse (Metaview/BrightHire bile değil) | Faz 24 ADR-0043 entailment-citation |
| 2 | **Egemen/on-prem AI kurulum** (mülakat-zekâsı + LLM self-host) | Kimse (cloud-API bağımlı) | Faz 24 self-host LLM + denetim-PC GPU |
| 3 | **Compliance-native** (EU AI Act + KVKK in-product enforced: assist-vs-conduct, bias-audit, audit-log) | Çoğu bolt-on; kimse native değil | Platform KVKK governance + audit/WORM |
| 4 | **Çok-dilli (Türkçe-first) egemen AI** (STT/diar/parse) | Global oyuncular Türkçe+panel'de zayıf | Faz 24 Türkçe STT/diar |
| 5 | **AI-native veri+skills katmanı + MCP** (gün-1'den) | Sadece Ashby/Gem (legacy retrofit edemiyor) | Greenfield + platform pattern |
| 6 | **Quality-of-hire kapalı döngü** (işe-alım→performans→kaynak geri-besleme) | Çoğu kapatmıyor (kuzey-yıldızı yeni) | Greenfield veri modeli |
| 7 | **Kariyer.net + yerel dağıtım** (TR) | Global'de yok (0/48 board) | TR BD ilişkisi |

**Bilinçli YAPMADIKLARIMIZ** (üst-seviye = doğru olanı yapmak): duygu/affect analizi (EU yasak), insansız auto-reject (high-risk), denetlenmemiş ranking. Bunlar "özellik" değil **yükümlülük**.

---

## 2. Fazlı yol haritası — her faz global-benchmark'lı

> Her faz: **Rakip durumu** (global lider seviyesi) → **Bizim teslimat** → **Üst-seviye farkı** (nerede üstüne çıkıyoruz).

### Faz 0 — AI-native foundation (mimari, gün-1 üstünlüğü)
- **Rakip durumu:** Legacy oyuncular (Greenhouse/Workday/iCIMS) AI'ı eski şemaya retrofit ediyor; sadece Ashby/Gem gerçek AI-native.
- **Bizim teslimat:** Birleşik aday/iş + **skills ontoloji** + vector store; event-driven; multi-tenant izolasyon; KVKK/governance/audit primitive'leri; MCP-ready; provider-abstraction (cloud-pilot→self-host).
- **Üst-seviye farkı:** Mimari gün-1'den AI-native + compliance-native + sovereign-ready — incumbent'ların yıllarca retrofit edemediği temel.

### Faz A — Çekirdek MVP (parite, hızlı)
- **Rakip durumu:** Tüm ciddi ATS'lerde var (req, pipeline/kanban, scorecard, scheduling, offer, career-site, funnel-analitik, email).
- **Bizim teslimat:** Aynı table-stakes seti — kredibilite eşiğine hızlı ulaş. + KVKK-çekirdek (ayrı aydınlatma/rıza UI, delete-on-reject, DSAR 30g) gün-1.
- **Üst-seviye farkı:** Altında AI-native veri modeli + KVKK enforced (rakipler bunu sonradan ekliyor).

### Faz B — TR beachhead + comms + Türkçe AI
- **Rakip durumu:** Global'de LinkedIn (RSC+Apply Connect) + Indeed (Job Sync API) var; **Kariyer.net/eleman.net/İYS/statutory/Türkçe-parse YOK**.
- **Bizim teslimat:** Kariyer.net BD-entegrasyon (+scrape fallback) + eleman.net + LinkedIn + Indeed (XML değil, Job Sync) + İYS-uyumlu SMS/WhatsApp + **Türkçe CV-parse** (LLM+gazetteer: YÖK/81-il/TC-checksum) + offer mgmt + scheduling + statutory (engelli %3/İŞKUR/askerlik/TC-redact) + TL/e-Fatura.
- **Üst-seviye farkı:** TR pazarında global oyuncuların **yapısal olarak veremediği** dağıtım + uyum + dil katmanı = beachhead'de tartışmasız #1.

### Faz C — AI-çekirdek diferansiyel (GLOBAL üst-seviye) ⭐
- **Rakip durumu:** Metaview/BrightHire mülakat-zekâsı *assist* (citation yok, cloud-only, Türkçe zayıf); Ashby agentic ama egemen/citation yok; Workday/Paradox konuşma-tabanlı.
- **Bizim teslimat:** **Mülakat zekâsı (Faz 24 reuse): transkript → kaynaklı (citation) structured scorecard → ATS write-back** · governed agentic screening (fail-closed, insan-shortlist) · talent rediscovery (silver-medalist) · konuşma-tabanlı aday deneyimi · NL-analytics · **quality-of-hire döngüsü** · AI-governance (bias-audit + EU AI Act audit-log) · MCP server.
- **Üst-seviye farkı:** Citation + egemen + Türkçe + governance-native = global pazarın **4 açık boşluğu** aynı anda. Burada dünyanın en iyisi oluyoruz.

### Faz D — Sovereign/enterprise + ölçek (global moat)
- **Rakip durumu:** İncumbent'lar US/EU-cloud, compliance bolt-on; on-prem/BYO-region yok.
- **Bizim teslimat:** **Veri-egemenliği ürünü** (on-prem / BYO-region / air-gapped opsiyon) + multi-tenant billing + self-serve onboarding + SOC2/ISO27001 + EU AI Act conformity-assessment artefaktları + marketplace/open-API + unified-API readiness (Merge/Kombo).
- **Üst-seviye farkı:** Regüle kurumlara (EU/Körfez/finans/savunma/kamu — global) "verileriniz sizde, AI denetlenebilir, uyum gömülü" — incumbent'ların yapısal olarak veremediği. TR moatının global gelir kapısı.

### Faz E — Frontier (sürekli, 2026+)
- **Rakip durumu:** Agentic superagents, skills-marketplace, deepfake-defense yarışı.
- **Bizim teslimat:** Coordinated agent'lar (governed) · internal talent marketplace · deepfake/aday-fraud tespiti · programmatic job-ads · sürekli skills-ontology evrimi.
- **Üst-seviye farkı:** Frontier'da kalırken governance+egemenlik kamasını koruruz (rakipler hız için uyumu feda ederken biz ikisini birden).

---

## 3. Faz özet matrisi

| Faz | Tema | Hedef seviye | Süre tahmini* |
|---|---|---|---|
| 0 | AI-native foundation | gün-1 üstünlük | kısa |
| A | Çekirdek MVP | parite (hızlı) | orta |
| B | TR beachhead + Türkçe AI | TR'de #1 | orta |
| C | AI-çekirdek (mülakat-zekâsı flagship) | **global üst-seviye** | uzun |
| D | Sovereign/enterprise + ölçek | global moat | uzun |
| E | Frontier | liderlik koru | sürekli |

*Süre Salih'in kıdemi + ekip boyutu netleşince konacak.

---

## 4. Güncellenmiş ADR seti
ATS-0001 mimari/reuse-sınırı (AI-native + sovereign-ready) · 0002 multi-tenant izolasyon · 0003 KVKK aday-veri boundary · 0004 mülakat-AI (Faz 24 reuse + citation) · 0005 AI-governance (assist-vs-conduct + bias-audit + EU AI Act) · **0006 veri-egemenliği/deployment topolojisi (cloud + on-prem + BYO-region)**.

---

## 5. Sıradaki adımlar (owner onayı sonrası)
1. Bu fazlı roadmap'i **GitHub Project board**'a epic (Faz 0–E) + issue (özellik) olarak dök.
2. **PRD** (Faz A-C kapsamı, acceptance kriterleri) + **ATS-0001 ADR** draft → cross-AI (Codex) review.
3. Repo'ları oluştur (biz) → Salih'i davet (`salihkorkmazk@gmail.com`).
4. Faz 0 scaffold + Faz A ilk slice → Salih'e ilk board issue (Zeynep-tarzı).

Açık kalan (bloklamıyor, faz-önceliği ayarı): İlk pilot ICP (regüle sektör mü, hangi dikey?), Kariyer.net BD başlangıç zamanı, reuse fiziksel sınırı (cluster/namespace).
