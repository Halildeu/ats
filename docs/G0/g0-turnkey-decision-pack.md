# G0 — Turnkey Decision Pack (owner çalıştırır)

> Mevcut G0 kit'ini (gate · ICP · LOI · scope-freeze · execution-system · one-pager · outreach) **tek çalıştırılabilir owner paketine** çevirir. Amaç: G0 = GO/NO-GO kararını **kanıta dayalı** ver. Yeni doküman üretmek değil — **kanıt toplama + kabul sınırı**.
>
> **Bu paket agent-tarafı turnkey'dir; G0 yürütmesi (gerçek kurum outreach + LOI + DPO imza) owner/insan işidir** (gerçek regüle kurumlar; uydurulamaz).

## M6 birleşik AGREE gate — 7 kriter (kanıt-kabul matrisi)

| # | Kriter | Kanıt (kabul edilen) | Durum | Kanıt linki |
|---|---|---|---|---|
| 1 | ICP tek cümle kilitli | `g0-icp-questionnaire.md` doldurulmuş + tek-cümle ICP yazılı | ☐ | |
| 2 | ≥3 yazılı LOI/paid-pilot | LOI/sözleşme (kapsam+ATS+bedel+süre+metrik+teknik-taahhüt) | ☐ | |
| 3 | İlk ATS entegrasyon yolu doğrulanmış | partner-ATS adı + API/erişim teyidi (e-posta/doküman) | ☐ | |
| 4 | Kayıt izni + hukuki ≥2 kurum DPO/Legal onayı | DPO yazılı sign-off (script aşağıda) | ☐ | |
| 5 | P1 scope dondurulmuş + yasak liste | `g0-p1-scope-freeze.md` + ilk LOI kapsamıyla teyit | ☐ | |
| 6 | Teknik kalite baseline sayısal | golden Türkçe fixture + eval-harness eşik kilidi | ☐ | |
| 7 | Execution sistemi yazılı | `g0-execution-system.md` | ☐ | |

**Karar kuralı:** 7/7 = **GO** (P1 build kilidi açılır). Herhangi biri eksik = **NO-GO** (P1 başlamaz; scope-freeze kill rule). Kısmi = **CONDITIONAL** (eksik kriter + tarih).

## ICP scoring rubric (prospect başına 0-3)
| Boyut | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| Bütçe sahibi net | yok | belirsiz | dolaylı | doğrudan onay |
| Regülasyon baskısı (KVKK/denetim) | yok | düşük | orta | yüksek (zorunlu) |
| Mevcut ATS + write-back/export uyumu | bilinmiyor | uyumsuz | export-OK | API doğrulandı |
| Kayıt izni / hukuki yol | bloklu | belirsiz | olası | DPO ön-onay |
| Mülakat hacmi | <50/yıl | 50-200 | 200-500 | >500 |
| Pilot imza istekliliği | hayır | ilgi | sözlü pilot | LOI istekli |

**Eşik:** >=14/18 sıcak aday · <9 ele.

## DPO/Legal yazılı sign-off script (kriter 4)
1. Mülakat ses/video + transkript işlenmesine **açık rıza** mekanizması kabul mü? (aday + interviewer)
2. **TR-residency / on-prem-uyumlu pilot deployment** boundary yeterli mi?
3. Saklama süresi + **DSR/erasure** + WORM-vs-deletion ayrımı (ATS-0003) kabul mü?
4. **AI-use disclosure** (EU-AI-Act Art.50) + **no-scoring/no-affect/no-auto-reject** (ATS-0005) kabul mü?
5. İşlenecek veri sınıfı + **özel-nitelikli minimizasyon** + TC-Kimlik redaction kabul mü?
6. **DPA/DPIA** taslakları (`docs/procurement/`) inceleme için yeterli mi?

> Çıktı: DPO'dan **yazılı** "pilot için uygundur / şu koşullarla uygundur" + tarih + isim. Sözlü yetmez (M6 kriter 4).

## IT/ATS entegrasyon teyit script (kriter 3)
1. Mevcut ATS adı + sürüm?
2. **Export** kabul mü (PDF/secure-link/email/webhook) — write-back gerekmeden? (M2 taban)
3. Write-back istenirse: API var mı + erişim + LOI'de "bu entegrasyonla ücretli pilot"? (3-koşul)
4. SSO/kimlik: kim erişecek (recruiter/HM/IT-admin)?

> Çıktı: ATS adı + export-yeterli mi / write-back-3-koşul karşılandı mı (yazılı).

## Çıktılar
- `prospect-tracker.csv` — pipeline (her satır 1 prospect + ICP skoru + LOI/DPO durumu).
- Bu dosya = GO/NO-GO dashboard (matris doldurulur).
- GO anında: `g0-p1-scope-freeze.md` + ilk LOI kapsamı freeze-commit ile mühürlenir.

## Bağlantı
[g0-design-partner-gate.md](./g0-design-partner-gate.md) · [g0-icp-questionnaire.md](./g0-icp-questionnaire.md) · [g0-loi-template.md](./g0-loi-template.md) · [g0-p1-scope-freeze.md](./g0-p1-scope-freeze.md) · [g0-execution-system.md](./g0-execution-system.md) · [g0-pilot-open-release-checklist.md](./g0-pilot-open-release-checklist.md) · [../eval/golden-fixture-collection-pack.md](../eval/golden-fixture-collection-pack.md) · [../procurement/](../procurement/)
