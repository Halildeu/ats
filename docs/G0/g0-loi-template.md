# G0 — Niyet Mektubu (LOI) Şablonu

> Design-partner pilot niyetini **somutlaştıran** bağlayıcı-olmayan belge. Amaç: "ilgileniriz"i ölçülebilir taahhüde çevirmek (M6 kriter 2). En tehlikeli varsayımı (satın alır mı?) test eden tek kanıt.
>
> **Doldurma kuralı:** Tüm köşeli-parantezli `[...]` alanlar doldurulmadan LOI "imzalı" sayılmaz. Boş bırakılan her alan = o kriter kanıtlanmadı.
>
> ⚠️ Hukuk notu: Bu taslak ticari niyet beyanıdır, hukuki sözleşme değil. Nihai metni kurum sözleşme/satın-alma süreci + hukuk onayından geçirin. Agent bunu kurum adına **imzalamaz/göndermez** — owner yürütür.

---

## NİYET MEKTUBU (Letter of Intent) — Mülakat Kanıt Pilotu

**Tarih:** [GG.AA.YYYY]

**Taraflar:**
- **Sağlayıcı:** [Şirket adı] ("Sağlayıcı")
- **Kurum:** [Kurum adı] ("Kurum"), [sektör], [çalışan sayısı]

**Sponsor (Kurum tarafı imza):** [Ad-Soyad], [Unvan — Operational owner: TA/HR Head] · **E-posta:** [...]
**Onaylayan (Economic buyer):** [Ad-Soyad], [Unvan — CHRO/COO/CFO/BU]
**Veri/Hukuk onayı (Veto/DPO):** [Ad-Soyad], [Unvan — DPO/Compliance/Legal]

---

### 1. Pilot kapsamı (X)
Sağlayıcı, Kurum için **regüle kurumlara yönelik, Türkçe, kaynak-alıntılı (citation), insan-onaylı, denetlenebilir mülakat kanıt dosyası** üreten bir pilot yürütecektir. Kapsam:
- Mülakat kaydı/transkript ingest (kanal: **[MS Teams / upload / ...]**)
- Türkçe konuşma-tanıma (STT) + konuşmacı ayrımı (diarization)
- Rubric alanlarına **claim-level citation** ile kanıt önerisi (evidence-first; AI puanı opsiyonel/insan-onaylı)
- İnsan düzenleme/onay + değiştirilemez (immutable) audit log
- Kanıt dosyası çıktısı: **[PDF / secure link / e-posta / webhook / ATS write-back]** (bkz. §3)
- Consent/saklama/silme/erişim-log minimumu (compliance floor)

**Kapsam DIŞI (pilot):** full ATS, çoklu-ATS, HRIS sync, on-prem SKU, bias dashboard, otomatik aday eleme/ranking, duygu/affect analizi.

### 2. Başarı metrikleri (Z')
Pilot, aşağıdaki ölçülebilir hedeflerle başarılı sayılır:
- [ ] [örn. Mülakat değerlendirme/paket süresi: **[mevcut]** → **[hedef]** (örn. 48 saat → 15 dk)]
- [ ] [örn. Scorecard tamamlanma / adoption oranı: **[%]**]
- [ ] [örn. Audit/denetim talebine yanıt süresi: **[hedef]**]
- [ ] [örn. Citation-destekli iddia oranı / unsupported-claim oranı: **[hedef]**]
- [ ] [Kurum-özel metrik: ...]

### 3. ATS / entegrasyon yolu (Y) — kriter 3
- Kurumun mevcut ATS'i: **[ATS adı]**
- Entegrasyon yöntemi (biri seçilir):
  - ☐ **Narrow write-back** (ATS API/marketplace doğrulanmış) — alan: [...]
  - ☐ **Export tabanı** (PDF + secure link + e-posta/webhook; ATS'e manuel eklenebilir) — ATS API'siz/kapalı ise
- Kurum, seçilen entegrasyon için **teknik işbirliği** (erişim/test ortamı/IT temas noktası) sağlamayı taahhüt eder: **[ad/ekip]**

### 4. Kayıt izni & hukuki uygulanabilirlik — kriter 4
- Kurum, pilot kapsamındaki mülakatlar için **aday + interviewer aydınlatma/rıza** süreçlerini yürütebileceğini ve mülakat kaydının kurum politikası + KVKK açısından **uygulanabilir** olduğunu beyan eder.
- DPO/Hukuk teyidi: **[evet / şartlı: ...]**

### 5. Süre & ticari (N, Z)
- **Pilot süresi:** [N] hafta (öneri: 8-12)
- **Pilot bedeli / bütçe:** [Z TL] (+ KDV, e-Fatura) — **ücretli pilot** (temsili/0 bedel kabul edilmez) — min eşik: **[min bedel]**
- **Ödeme / procurement adımı:** [PO no / satın-alma süreci / fatura takvimi]
- **Karar tarihi:** [GG.AA.YYYY — Kurum pilot GO/ödeme kararını verecek tarih]
- **Conversion maddesi (ZORUNLU):** Pilot §2 başarı kriterlerini sağlarsa Kurum şu **sonraki ticari adıma** geçmeye niyetlidir (biri seçili): ☐ paid extension ☐ yıllık lisans teklif değerlendirmesi ☐ procurement kickoff ☐ satın-alma komitesi tarihi: **[tarih]**.
- **Pilot-sonrası ticari ufuk (hijyen):** hedef yıllık ticari aralık **[₺ band]** veya lisanslama bütçe kaynağı **[bütçe sahibi/kalem]**.

### 6. Veri & gizlilik
- Aday/mülakat verisi yalnız pilot amacıyla işlenir; saklama süresi **[X]**, pilot sonunda silme/iade **[koşul]**.
- (Talep halinde) on-prem/BYO-region mimari opsiyonu konuşulabilir; pilot varsayılanı **[managed SaaS / dedicated tenant]**.

### 7. Niyet beyanı
Bu mektup, tarafların yukarıdaki kapsamda bir pilot başlatma **niyetini** gösterir. Bağlayıcı sözleşme, ayrı bir pilot/hizmet sözleşmesi ile kurulacaktır. Taraflar iyi niyetle ilerlemeyi beyan eder.

**Kurum adına — ZORUNLU ≥2 imza** (yalnız operational sponsor yetmez):
- **Operational sponsor:** ___________________  [Ad-Soyad / Unvan — TA/HR / Tarih]
- **Economic buyer / procurement-budget owner:** ___________________  [Ad-Soyad / Unvan — CHRO/COO/CFO/Satınalma / Tarih]

**Sağlayıcı adına:** ___________________  [Ad-Soyad / Unvan / Tarih]

---

## LOI "geçerli" kontrol listesi (owner — kriter 2, sıkılaştırılmış)
- [ ] Sponsor (Operational) + Economic buyer + DPO **isimleri** dolu
- [ ] **≥2 imza:** operational sponsor + economic buyer/procurement-budget owner
- [ ] Kapsam (X) net + yasak liste kabul
- [ ] ≥1 ölçülebilir başarı metriği
- [ ] ATS/entegrasyon yolu (Y) seçili + teknik temas taahhüdü
- [ ] Kayıt izni/hukuki uygulanabilirlik beyanı
- [ ] **Ücretli pilot bedeli (Z, temsili değil) + min eşik + procurement adımı + karar tarihi**
- [ ] **Conversion maddesi** (başarı→sonraki ticari adım) seçili + tarih
- [ ] **Pilot-sonrası hedef yıllık ticari aralık / lisans bütçe kaynağı** yazılı
- [ ] Süre (N)

**≥3 bu listeyi geçen LOI = M6 kriter 2 sağlandı.** Ek gate kuralı: ≥3'ün **≥2'si non-friendly kurum + ≥2'si ücretli/procurement-tarihli**. Kriter 3 (ATS) ve 4 (kayıt-izni) **LOI'den AYRI** kanıt ister (teknik not + DPO yazılı izin).
