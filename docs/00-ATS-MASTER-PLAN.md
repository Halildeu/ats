# ATS MASTER PLAN (canonical) — v3.0
## Regüle kurumlar için citation-backed interview evidence → land-and-expand ATS

> **v3.0 — 2026-06-22.** **3-AI mutabakat (Claude/Anthropic + Codex/OpenAI + Gemini/Google) — 3/3 AGREE.** 3 tur ping-pong (bağımsız round-0 → cross round-1 → imza round-2). Yön v2 ile aynı (add-on-first onaylı); v3 deltaları (buyer-katmanları, adoption riski, write-back kuralı, P1 resmi adı, execution de-risk, M6 birleşik AGREE gate) §13'te. Tam imzalı tutanak: [pingpong-3ai/05-consensus-draft.md](./pingpong-3ai/05-consensus-draft.md).
> **v2.0 — 2026-06-22.** Cross-AI mutabakat (Claude + Codex; MiniMax denendi/cevapsız) sonrası REVİZE. v1.0 "full AI-native ATS first" çerçevesi → v2.0 "interview-evidence ADD-ON first, ATS = gated expansion". Mutabakat detayı §3.
> Destekleyici analiz: [01-rekabet-analizi](./01-rekabet-analizi-ve-ozellik-stratejisi-2026.md) · [02-faz-roadmap](./02-faz-roadmap-rakip-benchmarkli.md) · [03-ilave-farklar](./03-rakip-guclu-yonler-ve-ilave-farklar.md). Memory: [[project_ats_salih_korkmaz]].
> Geliştirme: Salih Korkmaz (Zeynep-tarzı: implement → Halil/Claude review → cross-AI gate → düzeltme). Repo'ları biz oluşturup davet ederiz.

---

## 1. Vizyon & konumlama (REVİZE)

**İlk ticari ürün (DOĞRU konumlama):** *"Regüle kurumlar için mevcut ATS ile çalışan, Türkçe/on-prem opsiyonlu, **citation-backed interview evidence + hiring audit** add-on."*

**YANLIŞ konumlama (v1, terk edildi):** "Dünyanın en iyi AI-native ATS'i." → Workday/SAP/Greenhouse/Ashby/Kariyer.net ile kategori savaşı; junior + tek-ekip ile execution failure.

**Uzun-vade vizyon (korunur ama commitment DEĞİL):** Full ATS = **kazanılmış genişleme hakkı** (land-and-expand) — sadece müşteri talebi + gelir kanıtı + entegrasyon-sürtünmesi bunu haklı çıkarırsa açılır. İlk 6-12 ay full-ATS backlog'u ürün gereksinimi SAYILMAZ.

**Neden bu pivot (mutabakat gerekçesi):** En güçlü varlığımız ATS değil, **mülakat kanıt/intelligence katmanı** (Faz 24: Türkçe STT+diar+self-host LLM+citation). Bunu full-ATS-replacement'a gömmek satın-alma döngüsünü uzatır (veri migrasyonu, job-board, career-site, HRIS, offer, alışkanlık sürtünmesi). Mevcut ATS üstüne takılan add-on **çok daha satılabilir** + en güçlü kamayı öne çeker.

---

## 2. Kararlar (v2 — sıralama eklendi)

| Karar | Seçim |
|---|---|
| **İlk ürün** | **Interview-evidence ADD-ON** (mevcut ATS üstüne), full ATS DEĞİL |
| **Full ATS** | Gated expansion option (default roadmap commitment değil) |
| Konumlama | Bağımsız SaaS; pazar = regüle/mahremiyet-duyarlı kurumlar (global), TR beachhead |
| Stack | Platform **primitives** reuse (stable interfaces) — "tam reuse" değil; ürün boundary AYRI |
| Geliştirme | Zeynep-tarzı (Salih implement → review → cross-AI gate); junior'a dar acceptance'lı modüller |
| Mülakat zekâsı | **Flagship + Faz 1** (Faz C'den öne çekildi) |
| Agentic | Governed-assist; screening/ranking erken DEĞİL ("kanıt üretir, insan karar verir") |
| Sovereign/on-prem | Mimari gün-1 hazır; **teslim/SKU** = 1-2 ücretli design-partner sonrası |
| Naming | Minimal çekirdeğe "ATS" DEME → "interview workspace / hiring evidence workspace". **P1 resmi adı: "Audit-ready Interview Evidence Packet MVP"** (v3) |
| **Write-back (v3)** | **Export = her zaman taban** (ölü ekran değil: PDF + secure link + ATS-eklenebilir + email/webhook + kimlik eşleşmesi); narrow write-back P1'e yalnız 3 koşulda (ATS adı belli + API doğrulanmış + LOI'de "bu entegrasyonla ücretli pilot") |
| **Konumlama (v3)** | Evidence-first / score-second — ürün "kanıt dosyası üretir"; ilk satış cümlesi "AI puan veriyor" DEĞİL |
| **Execution de-risk (v3)** | senior buddy 8-10h/hafta + acceptance contract + tek paralel hat + golden Türkçe fixture + scope kill rule + owner QA (bus-factor=1 mitigasyonu) |

---

## 3. Cross-AI mutabakatı (Claude + Codex) — nedenleriyle

**Süreç:** 2 tur ping-pong. Codex round-1 = **REVISE** (scope patlaması); round-2 = **AGREE with guardrails** (`ready_for_consensus: true`). MiniMax (Mavis) mesajı teslim+işlendi ama review-cevabı dönmedi → mutabakat 2 farklı-sağlayıcı (No Fake Work: MiniMax uydurulmadı).

**Ana mutabakat (tek cümle):** Full ATS ile başlama; **regüle kurumlar için mevcut ATS üstüne takılan, Türkçe/on-prem citation-backed interview-evidence + audit add-on** ile başla → design-partner gate → thin wedge MVP → minimal interview workspace → compliance pack → ATS/HRIS entegrasyonları → ücretli-partner sonrası sovereign SKU. Full ATS yalnız müşteri talebi + gelir kanıtı haklı çıkarırsa.

**Tartışılan + uzlaşılan maddeler:**
| Konu | Codex tezi | Claude nüansı | Mutabakat |
|---|---|---|---|
| Scope | Full-ATS+AI+compliance+sovereign = execution failure | Kabul | **Daralt: wedge-first** |
| Wedge | Asıl değer = interview-evidence add-on | Kabul | Add-on ilk ürün |
| Full ATS | İlk ürün yapma | Terk etme, SIRALA (land-expand) | **Vizyon korunur, commitment değil; gate'li** |
| Moat | Citation tek başına moat değil | Moat = BUNDLE (sovereign+Türkçe+citation+regüle-güven+deployment) | **Bundle moat — ama ÜRÜNLEŞİRSE; bespoke=servis-yükü** |
| Faz sırası | Mülakat-zekâsı C'de yanlış | Kabul | **Faz 1'e çek** |
| Kariyer.net | Critical-path değil (API yok+rakip) | Kabul | Opsiyonel connector |
| Reuse | "Tam reuse" coupling tuzağı | Kabul | **Primitives via stable interfaces; ürün boundary ayrı** |
| Compliance | "Garanti" liability | Kabul | **"Kanıt+kontrol üretir", garanti değil** |

---

## 4. Mutabık guardrail'ler (Codex — uygulamaya sızma uyarıları)
1. **ATS vizyonu execution'a sızmasın** — ilk 6-12 ay full-ATS backlog ürün gereksinimi değil.
2. **Minimal çekirdeğe "ATS" deme** → "interview workspace" (yoksa müşteri job-posting/pipeline/offer/career-page/reporting bekler).
3. **Full-ATS gate** (hepsi gerekir): 2-3 ücretli müşteri "ATS olarak da kullanalım" + tekrarlanabilir add-on değeri + entegrasyon sistematik blocker + migration maliyeti pricing'le taşınabilir + ekip junior-execution'dan çıkmış.
4. **Consent/recording workflow MVP-İÇİ** — aday/mülakatçı disclosure + consent + withdrawal + retention + deletion + access-request ilk sürümde domain modeli (kayıt/transkript ürünü bunsuz satılamaz, ülke-bazlı recording law).
5. **Agentic screening/ranking GERİDE** — wedge "kanıt üretir, insan karar verir" çizgisinde; high-risk/bias tartışması ürünü yavaşlatır.
6. **Sovereign: erken pazarla, geç teslim** — "BYO-region/on-prem capable architecture" satış anlatısı OK; gerçek on-prem SKU 1-2 ücretli partner sonrası (yoksa kurulum-projesi satarsın).
7. **Pricing 2 katman** — add-on = seat/interview (şeffaf TL OK); enterprise/sovereign = quote (annual license+implementation+support+GPU sizing). Şeffaf-TL on-prem'de geçerli değil.
8. **Design-partner gerçek gate** — "konuştuk" yetmez; net: bütçe-sahibi kim, mevcut ATS ne, kayıt izni var mı, hangi roller, yılda kaç mülakat, hukuki blocker, şart entegrasyon, kabul-edilebilir fiyat, pilotu kim imzalar.
9. **WORM ≠ deletion** — WORM'da hash/event-metadata/approval/redacted-evidence; ham transcript/media retention-policy ile silinebilir (KVKK/GDPR deletion kilidi yaratma).

---

## 5. Korunan çekirdek (mutabık — değişmedi)
Regüle kurumlar + TR beachhead · Türkçe/on-prem interview intelligence · citation-backed evidence · human-in-the-loop (no affect, no auto-reject) · platform security/audit primitives reuse · 7 üst-seviye kama + 12 ilave fark **capability universe** olarak geçerli (sadece re-sıralandı; §7).

---

## 6. Revize yol haritası (mutabık sıra)

| # | Aşama | Kapsam | Çıktı |
|---|---|---|---|
| **G0** | **Design-partner gate** | 5-10 regüle kurum: bütçe-sahibi/mevcut-ATS/kayıt-izni/rol/hacim/hukuki-blocker/şart-entegrasyon/fiyat/pilot-imza | GO/NO-GO + net ICP |
| **P1** | **Audit-ready Interview Evidence Packet MVP** (v3) | audio/video/transcript ingest → Türkçe STT/diarization → **claim-level citation scorecard** (evidence-first) → human edit/approval → audit trail → **export taban (PDF/secure-link/email/webhook) + opsiyonel narrow write-back (3-koşul)**. + consent/recording domain + compliance floor (M3). Teams/Outlook/Graph yeterli. | İlk ücretli pilot |
| **P2** | **Minimal "interview workspace"** | sadece wedge için: role, candidate, interview, scorecard, status, evidence, role-criteria/rubric (structured interview, illegal-question guardrail). career-site/job-board/offer/onboarding/internal-mobility YOK | Self-yeterli wedge |
| **P3** | **Compliance pack** | KVKK/GDPR retention+consent+DSR workflow + AI-use disclosure + audit export + model/version log + human-oversight log + protected-attribute guardrail | Procurement-ready |
| **P4** | **ATS/HRIS entegrasyonları** | mevcut ATS push/pull + HRIS sync + calendar/email + SSO/SCIM + CSV/API. **Kariyer.net opsiyonel** | İlk ciddi gelir |
| **P5** | **Sovereign deployment SKU** | on-prem/BYO-region (1-2 ücretli partner sonrası) + SOC2/ISO hedef + EU-AI-Act conformity artefaktları | Enterprise gelir |
| **P6** | **İleri (gated)** | QoH döngüsü · bias-audit dashboard · mülakatçı koçluk · broad skills-ontology · (en son) agentic screening · deepfake-defense · internal-marketplace · **full ATS (gate §4.3 ile)** | Genişleme |

---

## 7. Capability universe (7 kama + 12 ilave fark → aşama eşlemesi)
- **P1 wedge:** kama#1 citation-scorecard · #2 egemen-AI · #4 Türkçe-AI · ilave#2 aday-deneyimi (light) · consent.
- **P3-P4:** kama#3 compliance-native · #5 AI-native-veri+MCP (mimari) · ilave#3 açık-API · #7 bias-audit · #1 şeffaf-fiyat (add-on) · #8 portability.
- **P5:** sovereign (kama#2 deployment) · ilave#11 dikey-şablon.
- **P6 (gated/ileri):** kama#6 QoH · #7 Kariyer.net-dağıtım · ilave#6 anti-deepfake · #9 koçluk · #10 skills-ontoloji · #12 internal-marketplace · agentic screening.
- **Bilinçli YOK:** duygu/affect analizi (EU yasak) · insansız auto-reject · denetlenmemiş ranking.

---

## 8. Başarı metrikleri (P1 MVP — mutabık, baştan ölç)
recruiter/interviewer time-saved · scorecard completion-rate · **citation-supported claim ratio** · **unsupported-claim rate** · human override/edit-rate · **WER / DER** · citation precision/recall · legal/compliance audit-export kabulü · ATS write-back success · **pilot→paid conversion**. ("Dünyada en iyi" iddiası bu metrikler olmadan boş.)

---

## 9. Mimari (mutabık — primitives via interfaces, boundary ayrı)
Reuse (stable interface): Keycloak/identity-tenant · audit/WORM yaklaşımı · notify/Graph mail · GitOps/secret/observability · **AI inference altyapısı (Faz 24)**.
AYRI tutulacak (ürün boundary): identity/tenant contract · audit-evidence contract · candidate-PII store · transcript/media store · AI-provider interface · ATS domain services · deployment topology (managed SaaS / dedicated tenant / BYO-region / on-prem).

---

## 10. Eksik kapatılanlar (Codex'in işaret ettiği, mutabık)
ICP netleştirme (dikey+boyut+mevcut-ATS+kayıt-izni) · replacement-vs-augmentation = **augmentation** · recording/consent hukuku (P1-içi) · structured-interview design + illegal-question guardrail · eval metrikleri (§8) · pricing 2-katman · **security threat model** (prompt-injection/malicious-attachment/transcript-poisoning/impersonation/deepfake/tenant-leak/RBAC/model-output-leak/audit-tamper) · distribution kanalı (MS-ecosystem? KVKK-danışman? SI-partner? CISO/DPO-girişi?) · procurement artifact seti (DPA/DPIA/AI-Act-technical-file/security-whitepaper/data-flow/subprocessors/retention-matrix/incident-response/model-card/eval-report) · MCP = mimari-hazır, satış-nedeni değil.

---

## 11. ADR seti (v2 → v3 statüleri)
Dosyalar: [adr/](./adr/). Cross-AI: Codex thread 019ef3d9 (REVISE→AGREE).
- **ATS-0001** ürün-boundary + primitives-via-interfaces — ✅ **Accepted** (4 MVP sözleşmesi + contract test)
- **ATS-0002** multi-tenant izolasyon + deployment topolojisi — ✅ **Accepted** (tenant-boundary contract test P0; en riskli izolasyon)
- **ATS-0003** KVKK/recording-consent + WORM-vs-deletion — ✅ **Accepted** (unlinkable tombstone + erasure test)
- **ATS-0004** mülakat-AI (citation + eval-gate-first + human-approval) — ✅ **Accepted** (sayısal eşik golden fixture'da kilitlenecek; en riskli ADR)
- **ATS-0005** AI-governance (assist-vs-conduct + MVP-no-scoring + bias-audit + EU-AI-Act) — ✅ **Accepted**
- **ATS-0006** sovereign/on-prem SKU (gate'li) — ✅ **Accepted** (mimari-hazır, teslim gate'li, 2-katman pricing)
- **ATS-0007** security & key-management threat model — ✅ **Accepted** (5+1 sınıf; supply-chain dahil; pilot-open Gate F)
- **Pilot-open gate:** A-F (6 ADR kapısı) + ticari G0 → [G0/g0-pilot-open-release-checklist.md](./G0/g0-pilot-open-release-checklist.md).

---

## 12. Sıradaki adımlar
1. ✅ **G0 design-partner gate KIT HAZIR** (cross-AI kilitli, Codex REVISE→AGREE thread 019ef313) → [G0/](./G0/): gate + ICP soru-seti + LOI şablonu + P1-scope-freeze (kriter 5) + execution-system (kriter 7). Kalan = **owner execution** (≥3 LOI + ≥2 DPO + ATS teyidi). Board: [ats#1](https://github.com/Halildeu/ats/issues/1) In Progress.
2. ✅ **PRD P1 İSKELET yazıldı** (cross-AI AGREE "altitude doğru", Codex 019ef420) → [PRD](./PRD-P1-interview-evidence-mvp.md). F1-F10 + NFR(ADR bağlı) + Gate C; `[G0-KİLİTLİ]` alanlar G0=GO + golden fixture sonrası, detaylı build o noktada. Board ats#2 In Progress.
3. **ATS-0001/0003/0004 ADR** draft → Codex cross-AI review.
4. GitHub Project board → epic G0–P6 + P1 feature issue'ları.
5. Repo'ları oluştur (erpteams) → Salih davet → P1 ilk slice (dar acceptance) → Salih'e ilk issue.

**Açık (G0'da netleşecek):** ICP dikey (kamu/finans/sağlık) · hedef kurumların mevcut ATS'i · Salih kıdem/uzmanlık · reuse fiziksel sınır.

---

## 13. v3.0 — 3-AI mutabakat deltaları (Claude/Anthropic + Codex/OpenAI + Gemini/Google)

> 2026-06-22, 3 tur ping-pong, **3/3 AGREE**. Tam tutanak + imzalar: [pingpong-3ai/05-consensus-draft.md](./pingpong-3ai/05-consensus-draft.md). Yön v2 ile aynı; aşağıdakiler EKLENEN/sıkılaştırılan.

- **Üçüncü sağlayıcı:** MiniMax (Mavis) kırık (better-sqlite3) → yerine **Gemini/Google**; cross-provider HARD RULE'a tam uyum (self-subagent ikamesi YOK, dürüst beyan).
- **Buyer katmanları:** User (recruiter/HM/interviewer) · Operational owner (TA/HR — satış kapısını açar) · Veto/sponsor (Legal/Compliance/InfoSec/DPO) · Economic buyer (CHRO/COO/CFO/BU). Mesaj alıcıya göre "denetimden geç / dava+EU-AI-Act ceza riskini azalt".
- **Adoption riski (yeni P1 domain gereği):** aday/interviewer kayıt+AI'ı reddederse değer sıfırlanır = pazar/kültür problemi; "aday kaydedilmek istemiyor" senaryosu consent domain'de ele alınır.
- **Evidence-first / score-second:** ürün "kanıt dosyası üretir"; ilk satış cümlesi "AI puan veriyor" DEĞİL.
- **Write-back kuralı:** export = her zaman taban (ölü ekran değil: PDF + secure link + ATS-eklenebilir + email/webhook + aday/role/interview kimlik eşleşmesi); narrow write-back P1'e yalnız 3 koşulda (ATS adı belli + API doğrulanmış + LOI'de "bu entegrasyonla ücretli pilot").
- **P1 resmi adı + M3 sabitlendi:** "Audit-ready Interview Evidence Packet MVP" — yüzey + compliance floor + yasak liste.
- **Execution de-risk (junior tek-ekip):** senior buddy 8-10h/hafta (mimari/PR/blocker) + acceptance contract (fixture→expected→test/demo→review) + tek paralel hat + golden Türkçe fixture + scope kill rule (LOI'siz custom entegrasyon yok) + owner QA (acceptance gate sahibi).
- **Moat yeniden çerçeve:** tek özellik değil → regüle workflow'a gömülü evidence schema + lokal hukuki paket + Türkçe diarization kalitesi + entegrasyon playbook + tekrarlanabilir deployment birikimi.
- **Birleşik AGREE gate (M6 — G0 üretmeli):** (1) ICP tek cümle kilitli (2) ≥3 yazılı LOI/paid-pilot (kapsam/ATS/bedel/süre/metrik/teknik-taahhüt) (3) ilk ATS entegrasyon yolu doğrulanmış (4) kayıt izni+hukuki ≥2 kurum Legal/DPO onayı (5) P1 scope dondurulmuş+yasak liste (6) teknik kalite baseline Türkçe fixture'da sayısal (7) execution sistemi yazılı. **Tam AGREE→yürütme = G0 bu 7'yi üretince.**

---

## Değişiklik kaydı
- **v3.1 (2026-06-23):** G0 kit 8-doküman (gate+ICP+LOI+scope-freeze+execution-system+pilot-open-checklist+**one-pager+outreach-templates**) + cross-AI gate-lock (Codex REVISE→AGREE, 7 false-GO deliği kapatıldı, thread 019ef313) → [G0/](./G0/). **Foundational ADR seti TAM ATS-0001..0007** cross-AI Accepted (Codex thread 019ef3d9, çok-tur REVISE→AGREE; +0002 tenant-izolasyon, +0006 sovereign-SKU-gated, +0007 security/supply-chain) → [adr/](./adr/). Pilot-open release checklist **Gate A-F**. **Eval-harness** (ATS-0004 Gate C ölçüm rig'i: WER/DER/citation/fail-closed, 11/11 test pass, fail-closed doğrulandı) → [ai/eval-harness/](../ai/eval-harness/) (repo'ya taşındı, WS-1). Issue ats#1 In Progress, ats#3 Needs Verify.
- **v3.0 (2026-06-22):** **3-AI mutabakat (Claude+Codex+Gemini, 3/3 AGREE)**, 3 tur ping-pong. MiniMax kırık→Gemini. v3 deltaları §13 (buyer-katmanları, adoption riski, write-back 3-koşul kuralı, P1 resmi adı, execution de-risk, M6 birleşik AGREE gate). İmzalı tutanak pingpong-3ai/05.
- **v2.0 (2026-06-22):** Cross-AI mutabakatı (Claude+Codex, 2-tur REVISE→AGREE; MiniMax cevapsız). Pivot: full-ATS-first → interview-evidence-add-on-first (land-and-expand). Mülakat-zekâsı C→P1. Kariyer.net critical-path'ten çıktı. "Tam reuse"→primitives-via-interfaces. 9 guardrail + eval-metrik + security-threat-model + consent-in-MVP eklendi.
- v1.0 (2026-06-22): İlk canonical master plan (7 kama + 12 ilave fark + fazlar 0-E).
