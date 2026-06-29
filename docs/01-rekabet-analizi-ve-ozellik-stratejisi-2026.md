# ATS Rekabet Analizi & Özellik Stratejisi (2026)
## "Sektörün en iyisi olmak" için AI-çekirdekli yol haritası

> Hazırlık: 2026-06-22. 4 paralel araştırma hattı (global liderler · AI-native manzara · TR pazarı/KVKK · kapsamlı özellik taksonomisi), ~150+ web kaynağı. Yük taşıyan iddialar kaynaklı; doğrulanamayanlar `[UNVERIFIED]` etiketli.
>
> Proje: Salih Korkmaz ile **bağımsız multi-tenant SaaS ATS** · platform stack tam reuse · AI çekirdekte. Karar geçmişi: [[project_ats_salih_korkmaz]].

---

## 0. Yönetici özeti — kazanma tezi

Yatay/genel bir "Türkçe Greenhouse" YAPMIYORUZ. Global devler (Greenhouse, Workday, Ashby, SmartRecruiters) 2026'da agentic AI'a geçti ve çekirdek ATS özelliklerini meta haline getirdi — onlarla "daha iyi pipeline" yarışına girmek kaybedilmiş bir savaş. Bunun yerine **rakiplerin yapısal olarak GEÇEMEDİĞİ üç hendekte** kazanıyoruz ve AI'yı bu hendeklerin üstüne inşa ediyoruz:

1. **KVKK-resident veri egemenliği** — KVKK *hiçbir ülkeye yeterlilik kararı vermedi* (US de EU de değil). Global ATS'lerin hepsi US/EU'da barınıyor → her CV yüklemesi SCC + 5-gün bildirim gerektiren *düzenlenmiş sınır-ötesi transfer*. Türkiye'de barınan bir ürün bunu **temiz bir satış argümanına** çevirir. Yapısal, kapanmıyor.
2. **Kariyer.net + yerel-board dağıtımı** — Kariyer.net TR beyaz-yaka kredibilitesini belirliyor, **public API'si yok** ve kendi rakip ATS'ini (Kariyer.net 360) işletiyor. Greenhouse'un 48 board'unda *sıfır* Türk board var. Direkt ticari entegrasyonu kuran + blue-collar (eleman.net) ekleyen bu hendeği kapatır.
3. **Egemen + Türkçe + kaynaklı (citation) mülakat zekâsı** — global mülakat-zekâsı pazarının **iki en büyük doldurulmamış boşluğu** tam bizim Faz 24 yatırımlarımıza denk geliyor (aşağıda §3.3 — bu raporun en kritik bulgusu).

**AI çekirdekte (owner direktifi):** "AI bolted-on" değil "AI-native" — birleşik veri/skills katmanı + çekirdek workflow'da iş yapan governed agent'lar + otomatik structured write-back. Ama **en yüksek kaldıraçlı + en düşük regülasyon-riskli** AI bahislerine odaklanıyoruz (konuşma-tabanlı yüksek-hacim + mülakat-zekâsı *assist* duruşu), ve EU AI Act'in "yasak" tarafından (duygu/affect analizi) uzak duruyoruz.

**Tek cümlelik strateji:** *Global devlerin geçemediği iki hendekte (KVKK-residency + Kariyer.net) kazan, sonra her şeyi (Türkçe parse, mülakat-zekâsı, İYS/SMS, statutory workflow, TL fiyat) "Türkiye için yapılmış AI-native ATS" temasını güçlendirecek şekilde kur — "çevrilmiş yabancı ATS" değil.*

---

## 1. Rakip manzarası

### 1.1 Global liderler

| Vendor | Segment | Fiyat modeli | 2024–26 AI başlığı | Zayıflık |
|---|---|---|---|---|
| **Greenhouse** | Orta→Enterprise | Per-seat (Core/Plus/Pro) | Gömülü "Greenhouse AI" (talent matching, scorecard summary, notetaker), agent + **MCP** çıkıyor | Maliyet/TCO, opak fiyat |
| **Lever** | Orta | Per-employee | AI interview transcript/summary (Yaz '25) | Employ satın almasından beri roadmap yavaşladı |
| **Ashby** | Startup→Enterprise | Per-headcount + "elevated seats" | En derin suite: **Assistant (agentic)**, Notetaker, rediscovery, **MCP** | Fiyat karmaşası |
| **Workday Recruiting** | Enterprise | Quote + Flex Credits | **Illuminate Recruiter Agent** + **Paradox/Olivia ($1B)** + HiredScore | Hantal recruiter UX, maliyet |
| **iCIMS** | Enterprise/yüksek-hacim | Quote, modüler | **Copilot** + Talent Match/Discovery/Ranking | Modüler maliyet sürünmesi |
| **SmartRecruiters** | Enterprise/global | Quote | **Winston** agentic platform; **SAP-owned** | Maliyet; SAP entegrasyon belirsizliği |
| **Teamtailor** | KOBİ→Orta (EU) | **Job-slot başı** | Co-pilot (OpenAI) içerik/asist | Job-slot fiyat oynaklığı; sığ AI |
| **Workable** | KOBİ→Orta | **Şirket boyutuna göre düz** | **Workable Agent** (full-cycle, Mar '26) | Orta-seviye analitik derinliği |
| **Recruitee** (Tellent) | KOBİ→Orta (EU) | Employee-count | Asistif AI (screening/matching) | Cimri AI kredi tavanları |
| **BambooHR** | KOBİ | Per-employee/ay | "Ask BambooHR" (HR-ops, recruiting değil) | ATS recruiter'a değil HRIS'e hizmet eder |
| **Bullhorn** | **Staffing ajansları** | Per-user (5-10 min) | **Copilot** + **Amplify** + Textkernel | TCO; sadece-staffing |
| **Pinpoint** | Orta in-house | Quote | AI Notetaker/Copilot/Match Score | Native passive-sourcing/CRM yok |

### 1.2 AI-native / agentic dalga (taze sermaye burada)
- **Agentic recruiter'lar**: LinkedIn Hiring Assistant, Workday Recruiter Agent, SmartRecruiters Winston, Workable Agent, Bullhorn Amplify, Ashby Assistant. Gartner: HR liderlerinin **%82'si 12 ay içinde agentic AI** planlıyor; Korn Ferry: TA liderlerinin **%52'si bu yıl otonom agent**. AMA *uyumlu* her dağıtımda agent recruiter-belirlediği kriterlerde **öneri+yürütme** yapar, **shortlist/işe-alım kararı insanda kalır** (hem tasarım hem regülasyon gereği). Gartner agentic projelerin **%40+'ının 2027 sonuna iptal** beklentisinde.
- **Yeni girenler (fonlu)**: Juicebox/PeopleGPT ($30M, Sequoia), Findem ($51M), Apriora/Alex, Tezi "Max", Jack&Jill.
- **Sourcing/talent-intelligence**: Eightfold (1.6B+ profil graph), Beamery (TalentGPT), SeekOut (1B+ profil, 6 agent + "Sam"), hireEZ (EZ Agent).

### 1.3 Mülakat zekâsı (interview intelligence) — *stratejik kritik*
İki ürün sürekli karıştırılıyor (G2 ikiye böldü):
- **(A) ASSIST** (insan yürütür; AI kaydeder/özetler/scorecard taslağı): **Metaview** (son büyük bağımsız), **BrightHire** (Zoom-owned, Ara '25), **Pillar** (Employ-owned). **Düşük regülasyon yükü** (US AEDT eşiğinin altında).
- **(B) CONDUCT** (AI sesli/görüntülü agent soru sorar+puanlar): HeyMilo, Apriora, Ribbon, Micro1/Zara, HireVue. **Yüksek yük** (ranking/scoring + duygu-tanıma riski).

Pipeline standardı: `capture → STT (Deepgram/AssemblyAI) → diarization → LLM yapılandırma (Claude/OpenAI) → citation/grounding → ATS write-back`.

### 1.4 TR-local pazarı
| Vendor | Tip | AI | Durum |
|---|---|---|---|
| **Kariyer.net** (+İşin Olsun, **Kariyer.net 360**) | Job board → kendi ATS'i | Akıllı İlan (≥%70 fit, 26M CV), Kopilot GPT-4o | **Pazar lideri** — hem entegrasyon hedefi hem rakip |
| **eleman.net** | Job board + ATS | AI özgeçmiş analizi | #2 trafik, blue-collar lider |
| **Kolay İK** | HRIS + ATS | matching (Talentics satın alma) | En büyük TR HR SaaS |
| **Logo (J-HR + Peoplise)** | HRIS + ATS + video | **Casebot** AI ön-eleme + yetkinlik analizi | İncumbent, Peoplise %86.7 Logo'nun |
| **SorsX** | AI ATS (uçtan uca) | CV eval + **AI mülakat** + sourcing + ranking | TR/US/UAE, 60+ enterprise |
| **Hiroo / HrPanda / HiRi.ai / IKAI** | AI-native ATS | fit scoring, AI JD/soru | Startup kohort |
| **HRPeak** | Assessment + AI video | **Peeky** AI soru + cevap analizi | Yerel |
| SAP SF / Oracle / Workday | Global HCM | suite-içi AI | Güçlü TR enterprise |

**TR çıkarımları**: (1) Kariyer.net merkez + işveren-AI + rakip ATS kuruyor. (2) Logo & Kolay İK iki konsolidatör (ikisi de ATS/AI'ı satın aldı). (3) AI-native kohort (özellikle SorsX + HRPeak) en agresif AI-mülakat iddialarının olduğu yer. **AI matching/screening TR'de 2026'da artık ayırt edici değil, beklenen.**

### 1.5 Konsolidasyon (M&A) — fırsat sinyali
Workday→Paradox+HiredScore+Sana · SAP→SmartRecruiters · Zoom→BrightHire · Employ→Pillar · Bullhorn→Textkernel. Sonuç: **roadmap-yavaşlaması + fiyat-değişim riski** müşterilerde güvensizlik yaratıyor — yeni-giren için açık.

---

## 2. Özellik × Rakip Matrisleri

> Lejant: ✅ güçlü/native · 🟡 var ama sığ/eklenti · ❌ yok · **BİZ** = hedef duruş. ("BİZ" greenfield + platform reuse; parite = build edilecek, hendek = en iyi olunacak.)

### 2.1 Çekirdek ATS (table-stakes — parite şart)
| Özellik | Greenhouse | Ashby | Workday | Workable | Kariyer.net | SorsX | **BİZ (hedef)** |
|---|---|---|---|---|---|---|---|
| Requisition + onay akışı | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ parite |
| Pipeline / kanban + bulk | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ parite |
| Structured scorecard | ✅ | ✅ | 🟡 | 🟡 | ❌ | ✅ | ✅ parite |
| Mülakat scheduling (calendar) | ✅ | ✅✅ | 🟡 | ✅ | 🟡 | ✅ | ✅ parite |
| Offer mgmt + e-sign | ✅ | ✅ | ✅ | ✅ | ❌ | 🟡 | ✅ parite |
| Career-site builder | 🟡 | ✅ | 🟡 | ✅ | ✅ | 🟡 | ✅ parite |
| Analitik/funnel | ✅ | ✅✅ | ✅ | 🟡 | 🟡 | 🟡 | ✅ parite+ |

### 2.2 AI yetenekleri (owner: "ciddi derecede") — *en önemli matris*
| AI yeteneği | Greenhouse | Ashby | Workday | Workable | SorsX/TR | Metaview/BrightHire | **BİZ (hedef)** |
|---|---|---|---|---|---|---|---|
| AI JD / outreach üretimi | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ + **Türkçe-native** |
| AI CV parse + matching/ranking | ✅ | ✅ | ✅✅ | ✅ | ✅ | ❌ | ✅ + **Türkçe parse hendek** |
| Konuşma-tabanlı yüksek-hacim (chat/voice) | 🟡 | 🟡 | ✅✅(Paradox) | ✅ | 🟡 | ❌ | 🟡→✅ (Faz B) |
| **Mülakat zekâsı (transkript→scorecard)** | 🟡(çıkıyor) | ✅ | 🟡 | ❌ | 🟡(AI video) | ✅✅ | ✅✅ **flagship** |
| **Per-claim kaynaklı (citation) scorecard** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ *(kimse yayınlamıyor)* | ✅✅ **doldurulmamış boşluk #1** |
| Agentic screening (governed) | 🟡 | ✅ | ✅ | ✅ | ✅ | ❌ | 🟡→✅ (Faz C, fail-closed) |
| Talent rediscovery (silver-medalist) | 🟡 | ✅ | ✅ | 🟡 | 🟡 | ❌ | ✅ (Faz C) |
| **On-prem / egemen AI** | ❌(cloud) | ❌ | ❌ | ❌ | ❌ | ❌(cloud-API) | ✅✅ **doldurulmamış boşluk #2** |
| **Türkçe-dil AI (STT/diar/LLM)** | ❌ | ❌ | ❌ | ❌ | 🟡 | 🟡(zayıf) | ✅✅ **hendek** |
| Duygu/affect analizi (mülakatta) | ❌ | ❌ | ❌ | ❌ | 🟡⚠️ | ❌ | ❌ **bilinçli yapmıyoruz** (EU yasak) |

### 2.3 Compliance & KVKK (yapısal hendeğimiz)
| Özellik | Global ATS (Greenhouse/Workday/…) | TR-local (Kolay İK/Logo) | **BİZ (hedef)** |
|---|---|---|---|
| Türkiye veri-residency | ❌ (US/EU host, yeterlilik kararı YOK) | 🟡 | ✅✅ **en iyi** |
| Ayrı aydınlatma/açık-rıza UI (İlke 2026/347) | ❌ | 🟡 | ✅ enforced |
| Delete-on-rejection + ≤6ay imha timer | 🟡 | 🟡 | ✅ enforced |
| DSAR 30-gün + cascading erasure | 🟡 | 🟡 | ✅ enforced |
| Özel-nitelikli veri lockdown + TC-Kimlik redact | ❌ | 🟡 | ✅ |
| VERBIS envanter export | ❌ | ✅ | ✅ |
| EU AI Act assist-posture + audit log | 🟡 | ❌ | ✅ (citation = audit kanıtı) |

### 2.4 TR-local fit (yapısal hendeğimiz)
| Özellik | Global ATS | TR-local | **BİZ (hedef)** |
|---|---|---|---|
| Kariyer.net entegrasyon | ❌ (0/48 board) | 🟡(iddia, mekanizma opak) | ✅✅ **BD önceliği** |
| eleman.net/blue-collar | ❌ | 🟡 | ✅ |
| LinkedIn (RSC+Apply Connect) | ✅ | 🟡 | ✅ parite |
| Indeed (Job Sync API, XML değil) | ✅ | 🟡 | ✅ parite |
| İYS-uyumlu SMS/WhatsApp | ❌ | 🟡 | ✅ |
| Engelli %3 kotası + İŞKUR | ❌ | 🟡 | ✅ |
| TL fiyat + e-Fatura + yerel ödeme | ❌ | ✅ | ✅ |

---

## 3. AI'yı çekirdeğe koymak

### 3.1 "AI-native" vs "AI bolted-on" (2026 değerlendirme çerçevesi)
| Boyut | Bolted-on (legacy+AI) | AI-native (BİZ) |
|---|---|---|
| Veri modeli | Parçalı, AI mevcut şemayı okur | Birleşik veri + skills ontoloji + vector store |
| AI nerede | Ayrı "AI paneli" | Çekirdek workflow'da; agent iş yapar |
| Varsayılan operatör | Her adımda insan | Agent guardrail içinde yürütür, insan yönetir |
| Write-back | Manuel kopyala-yapıştır | Otomatik structured scorecard/transkript yazımı |
| Dış agent | Yok | **MCP server** (Claude/ChatGPT sorgular) |
| AI fiyatı | Ücretli eklenti tier | Varsayılan, tüm tier'larda |

### 3.2 En yüksek kaldıraçlı AI bahisleri (kaldıraç = etki × olgunluk ÷ risk)
- **Tier 1 (önce buraya):** (1) Yüksek-hacim konuşma-tabanlı işe-alım + aday deneyimi (kanıtlı ROI, en düşük yasal risk). (2) **Mülakat zekâsı *assist* duruşu** (savunulabilir hendek, yüksek-yük regülasyon çizgisinin altında).
- **Tier 2:** AI sourcing + talent rediscovery; AI ile-işbirliği ölçen skills assessment (cheating krizi).
- **Tier 3 (gerçek ama kısıtlı):** agentic otonom screening (yasa + %40 başarısızlık tavanı); AI JD/outreach (commodity + denetlenmezse bias riski).
- **Kaçın:** AI video mülakatta **duygu/affect analizi** — 2026'da *negatif* beklenen değer (EU yasak, US BIPA davalı).

### 3.3 ⭐ Mülakat zekâsı = bizim flagship'imiz (Faz 24 reuse — bu raporun en kritik bulgusu)
Global mülakat-zekâsı pazarının **iki en büyük doldurulmamış boşluğu** + bizim hazır varlıklarımız **birebir örtüşüyor**:

| Global doldurulmamış boşluk (kaynak: AI-landscape araştırması) | Bizim hazır varlığımız |
|---|---|
| **#1 Gerçek per-claim, alıntı-çapalı citation** — "adayın kendi sözleri" herkes diyor ama *kimse gerçek RAG/citation/anti-halüsinasyon mimarisi yayınlamıyor.* Her rating'in tıkla→kaynak transkript alıntısına bağlandığı scorecard ayırt edici + EU AI Act'in istediği audit/explainability artefaktı. | **Faz 24 ADR-0043** citation foundation (extract-then-abstract + **entailment**, substring-match değil; signed-polarity/fail-closed) + gerçek-LLM proof (#179). [[project_faz24_tc_intelligence_adr0043]] |
| **#2 On-prem/egemen + İngilizce-dışı stack** — doğrulanmış endüstri standardı **cloud-API bağımlı** (AssemblyAI/Deepgram + Anthropic/OpenAI); Metaview/BrightHire İngilizce-dışı + 3+ kişilik panelde *zayıf*. | **Faz 24** Türkçe STT (faster-whisper) + diarization (pyannote) + **self-host LLM** (denetim PC RTX 4070, ollama) + WireGuard data-plane. [[reference_denetim_gpu_pc_bridge]] [[reference_wireguard_crosssite_denetim_staging]] |

**Sonuç:** ATS'imizin mülakat-zekâsı modülü, tüm global pazarın açık bıraktığı iki boşluğu (gerçek citation + egemen/Türkçe) Faz 24 üstüne kurarak vurur — ÜSTELİK KVKK-residency + Kariyer.net hendekleriyle sarılı. Bu olağanüstü güçlü ve savunulabilir bir kama. **Faz 24 ≠ ayrı ürün; ATS'in AI-çekirdeğinin motoru.**

### 3.4 Bizim AI mimarimiz
- Birleşik aday/iş + **skills ontoloji** katmanı (vector store).
- Mülakat zekâsı motoru = Faz 24 servisleri (audio-gateway → STT → diarization → meeting-ai citation/intelligence) → ATS scorecard write-back.
- Türkçe CV parse: **LLM extraction + deterministik gazetteer/checksum** (YÖK listesi, 81-il/973-ilçe, plaka↔posta-kodu, TC checksum) — egemen/self-host model ile KVKK-temiz.
- Governed agent katmanı (fail-closed, insan-onaylı shortlist) + **MCP server**.
- Provider abstraction: cloud-pilot → self-host (ADR-0043 deseni).

### 3.5 Regülasyon: assist-vs-conduct çizgisi (ürün tasarımını belirler)
| Yük | Özellik | Neden |
|---|---|---|
| 🔴 En yüksek / KAÇIN | AI video + duygu/affect analizi | EU işyerinde **yasak** (Şub 2025); US BIPA |
| 🔴 Yüksek | Otonom auto-reject (insansız) | EU insan-gözetimi ihlali |
| 🔴 Yüksek | Aday ranking/scoring | EU high-risk; NYC LL144 audit; *Mobley v. Workday* |
| 🟡 Orta | İnsana besleyen sourcing/matching | ranking maruziyeti ama insan-tartılı |
| 🟢 Düşük | **Not-alma/özet (assist), scheduling, JD yazımı** | idari/asistif; eşiğin altında |

→ Düşük-yük + savunulabilir tarafta inşa et; her scoring/ranking/auto-reject'i **zorunlu insan-override + yayınlanan bias audit** ile regüle alt-sistem say. (TR'de KVKK ayrıca: açık rıza + aydınlatma + 30-gün DSAR + delete/anonymize + VERBIS + özel-nitelikli/biyometrik dokunma.)

---

## 4. Bizim kazanma kamamız (özet)
1. **Kariyer.net + yerel-board dağıtımı** (BD ilişkisi; scrape-fallback) — global geçemez.
2. **KVKK-resident, Türkiye-barınan mimari** — yeterlilik kararı yok; 2026 denetimleri SaaS'a yöneliyor; ~₺17M ceza → legal/compliance alıcıya *risk azaltma* sat.
3. **Egemen + Türkçe + kaynaklı mülakat zekâsı** (Faz 24) — global pazarın 2 açık boşluğu.
4. **TR statutory workflow** (engelli %3, İŞKUR, askerlik, TC-Kimlik) — "yasal kalmamı sağlayan ATS".
5. **TR-native ticari model** (TL/e-Fatura/yerel ödeme/İYS-SMS).
6. **AI paritesi + Türkçe-native AI** (matching/screening artık beklenen; fark Türkçe + egemen).

**Tuzak (kaçın):** "Türkçe UI" farklılaştırıcı DEĞİL — Workday/SAP zaten Türkçe destekliyor. Hendekler **dağıtım + veri-egemenliği + statutory uyum + Türkçe/egemen AI**.

---

## 5. Olması gereken özellik seti (17 domain — özet)
> Tam taksonomi (table-stakes/differentiator/frontier işaretli) ayrı çalışıldı; başlıklar:
1. Requisition/job mgmt (+internal mobility/talent marketplace) 2. Sourcing (+programmatic, browser-extension) 3. Candidate/CRM (+dedup/merge, nurture, rediscovery) 4. Application pipeline (+automation rules) 5. Screening/assessment (+AI voice screen, integrity/deepfake) 6. Interview mgmt (+auto-schedule, load-balance) 7. Evaluation/scorecard (+calibration, blind review, **AI notes**) 8. Offer mgmt (+comp bands) 9. Onboarding/HRIS sync (+background check) 10. Career site (+conversational apply) 11. Communication (+two-way SMS/WhatsApp, sequences) 12. Analytics (+NL analytics, **quality-of-hire**, predictive) 13. Compliance (KVKK/GDPR/EU-AI-Act/audit) 14. Integrations & API (+webhooks, **MCP**, unified-API) 15. Admin/permissions/security (RBAC/SSO/SCIM/SOC2/multi-tenant) 16. Mobile (recruiter+HM+candidate) 17. **AI layer** (her domain'de cross-cutting).

**Okuma:** Tüm table-stakes'i build et (kredibilite eşiği). Differentiator'ları ICP'mize göre seç (biz: analytics + scheduling + KVKK + Türkçe-AI). Frontier-2026 gerçek yarış (agentic, skills-ontology, conversational/voice, deepfake-defense, AI-compliance stack) — hendeğimiz **birleşik skills+candidate veri katmanı + governed auditable agent'lar**.

---

## 6. Plana entegrasyon (faz roadmap)
- **Faz A — MVP (table-stakes iskelet):** tenant + Keycloak auth + Job/req + Candidate + pipeline (kanban) + scorecard + temel e-posta + KVKK çekirdek (ayrı aydınlatma/rıza, delete-on-reject, DSAR) + career-site v1. *Tek-tenant smoke.*
- **Faz B — TR-fit + comms:** Kariyer.net/LinkedIn/Indeed entegrasyon + eleman.net + İYS-SMS/WhatsApp + Türkçe CV-parse (LLM+gazetteer) + offer mgmt + scheduling + statutory (engelli %3/askerlik/TC-redact).
- **Faz C — AI-çekirdek diferansiyel:** **mülakat zekâsı (Faz 24 reuse: transkript→kaynaklı scorecard)** + talent rediscovery + governed agentic screening (fail-closed) + analytics/funnel + NL analytics + MCP server.
- **Faz D — ölçek/ticari:** multi-tenant billing + self-serve onboarding + quality-of-hire ölçüm döngüsü + marketplace/API.

**ADR seti:** ATS-0001 mimari/reuse-sınırı · ATS-0002 multi-tenant izolasyon · ATS-0003 KVKK aday-veri boundary · ATS-0004 mülakat-AI (Faz 24 reuse + citation) · ATS-0005 AI-governance (assist-vs-conduct + bias-audit).

---

## 7. Açık stratejik kararlar (owner)
1. **Mülakat zekâsı flagship mı?** (Önerim: EVET — en güçlü savunulabilir kama, Faz 24 hazır.)
2. **Agentic duruş**: governed-assist (insan shortlist) vs daha otonom? (Önerim: governed-assist — regülasyon + güven.)
3. **Kariyer.net**: BD/ticari entegrasyon önceliği ne zaman? (API yok → ilişki gerek; erken başlat.)
4. **İlk ICP/pilot**: regüle sektör (kamu/finans/sağlık) mi, KOBİ self-serve mi? (Faz önceliği buna bağlı.)
5. **Reuse fiziksel sınırı**: aynı cluster ayrı namespace mi, erpteams ayrı altyapı mı? (ATS-0001.)

---

## 8. Güven & kaynak notları
- **Yüksek güven (birincil/resmi):** Workday-Paradox ($1B, Eki '25), SAP-SmartRecruiters, Zoom-BrightHire (Ara '25), Workable Agent (Mar '26); EU AI Act high-risk (Annex III; Aug 2 2026 → Digital Omnibus ile Dec 2 2027 *provisional*, Art.50 transparency Aug 2026 aktif); EU duygu-tanıma işyeri yasağı (Şub 2025); NYC LL144; KVKK *hiç yeterlilik kararı yok*; Greenhouse 0/48 Türk board; RChilli Türkçe "Full Parsing".
- **Vendor-raporlu (bağımsız audit değil):** tüm ROI/% rakamları (time-to-hire, completion vs).
- **`[UNVERIFIED]`:** TR board entegrasyon *mekanizmaları* (Kariyer.net/secretcv/isbul/eleman public API yok → ticari/scraping varsay); Affinda/Sovren Türkçe kalitesi; multiposting vendor Kariyer.net kapsamı.
- **Yıllık re-check:** Indeed XML cutoff (2026), LinkedIn AWLI, KVKK TL eşik/ceza bantları, İlke 2026/347, yeni KVKK yeterlilik kararı.
