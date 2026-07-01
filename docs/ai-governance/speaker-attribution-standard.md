# Speaker Attribution Standard (canonical registry)

> ATS-0013 kanonik kayıt. **Machine-checked** (`scripts/check-speaker-attribution.mjs`, CI `speaker-attribution-guard`).
> Owner senaryosu (2026-07-02): aynı oda + **tek bilgisayar/tek mikrofon + çok konuşmacı** — cihaz-metadata'sı tek başına yetmez. Çözüm: **ayrıştırma (diarization) + biyometrisiz kimlik-eşleme (attribution)**. **Sesten otomatik kimlik (voiceprint): [[ATS-0014]] owner beyanıyla YALNIZ iç-kullanıcı opt-in (§2; ADAY DAİMA DIŞLANMIŞ; runtime P1 + imzalı-DPIA çift kilit)**.
> **Kapsam dürüstlüğü (No Fake Work):** Bu bir tasarım/kapsam sözleşmesidir; diarization/attribution runtime'ı **P1 gate-locked** (G0=GO sonrası). "Uygunluk/conformity" iddiası değildir ([[eu-ai-act-technical-file-index]] readiness disiplini).

## 0. Sözlük (üç ayrı işlem — hukuki eşikleri FARKLI)

- **separation (diarization):** tek ses kanalını oturum-içi akustik kümeleme ile `S1..Sn` **takma-ad** konuşmacılarına AYIRMA. Kimlik iddiası YOK; hangi kümenin kim olduğu bilinmez.
  - **embedding invariantı (sabit cümle):** diarization embedding'leri **session-scoped**'tır; **persist edilmez**, **export edilmez**, **cross-session karşılaştırılmaz**, hiçbir kimlik/kayıt veritabanıyla eşleştirilmez. Amaç ayrıştırmadır; kalıcı ses-şablonu üretilmez — tanımlama eşiği (kalıcı şablon + kimlik eşleme) geçilmez.
- **attribution:** bir `S1..Sn` kümesinin katılımcı display-ref'ine eşlenmesi. YALNIZ §1 biyometrisiz yöntemlerle; kayıt = **insan-onaylı metadata**: iş gerçeği **ledger'a bağlanır** (`ledger_entry_ref`), log düzleminde yalnız opak `target_ref` (two-plane) — `evidence.speaker.attributed` audit event'i ([[event-taxonomy]]); eşleme verisi **`speaker_attribution_map`** sınıfı olarak yaşam-döngüsüne tabi ([[data-lifecycle-register]]). Attribution **OPSİYONELDİR** — eşlenmemiş `S1` takma-adı geçerli kalır (zorla eşleme yok).
- **identification (sesten kimlik):** ses örneğinden kalıcı şablon çıkarıp kişiyi tanıma. **KOŞULLU** (§2 sentinel; [[ATS-0014]] owner beyanı 2026-07-02): YALNIZ iç-kullanıcı opt-in — **aday için DAİMA dışlanmış**. Rejim: KVKK m.6 özel-nitelikli + GDPR Art.4(14)/Art.9 biyometrik eşiği + EU AI Act biyometrik-tanımlama yüksek-risk + US eyalet-hukuku (BIPA vb.). **Dar iddia:** internal-only scope adayı biyometrik-TANIMLAMA rejiminden uzak tutar; ham ses/görüntü kaydı yine kişisel veridir (`raw_media` rejimi).
- **status:** `active-compliant` (biyometrisiz, izinli) · `active-internal-consented` (owner risk-kabul KAYITLI — [[ATS-0014]]; YALNIZ iç-kullanıcı opt-in, aday daima dışlanmış; **runtime P1 + imzalı-DPIA çift kilit**) · `excluded-biometric` (beyan-öncesi default; geri dönüş = ADR+guard değişikliği).

### İnvariantlar (guard)

1. §1 aktif yöntem = **YALNIZ allowlist**: device_metadata · lexical_self_introduction · per_participant_device · human_labeling. Ekstra aktif yöntem → fail (yeni yöntem = ayrı ADR).
2. Aktif yöntem `biometric = no`; aktif satırda biyometrik kavram (voiceprint/ses-şablonu/enrollment/embedding/cross-session eşleme) **geçemez**.
3. `lexical_self_introduction` ve `human_labeling` satırlarında **insan onayı** tokeni zorunlu (otomatik kimlik iddiası yasak).
4. Sentinel `voiceprint_enrollment` §2'de **durmalı** (status = `active-internal-consented`; owner beyanı [[ATS-0014]]) + hiçbir zaman §1'e taşınamaz + satırında **iç-kullanıcı / aday-ASLA (candidate_exclusion) / amaç-sınır / self-service silme / DPIA / P1** tokenları zorunlu (biri silinirse fail).
5. §0 embedding invariant cümlesi (session-scoped + persist edilmez + export edilmez + cross-session karşılaştırılmaz) silinemez/yumuşatılamaz.
6. **Cross-doc binding:** `evidence.speaker.attributed` event'i [[event-taxonomy]]'de `ledger_entry_ref` + `target_ref` required-extra ile durmalı; `speaker_attribution_map` sınıfı [[data-lifecycle-register]]'da durmalı. Doküman yapısı pinli: yalnız §0–§4 numaralı bölümler (ara bölüm, örn. "1a", yasak); §1 tablo satırları strict format + duplicate yasak; §1 gövdesinin TAMAMI yasak-kavram taramasına tabidir.

## 1. Aktif attribution yöntemleri (biyometrisiz)

| method | basis | biometric | status | not |
|---|---|---|---|---|
| **device_metadata** | oturum/hesap/cihaz katılım metadata'sı | no | active-compliant | tek-konuşmacılı cihazda otomatik öneri; **paylaşımlı tek-mikrofon odada TEK BAŞINA YETMEZ** (owner senaryosu) — diğer yöntemlerle tamamlanır |
| **lexical_self_introduction** | transcript_text içeriği (sözlü tanıtım/yoklama; [[interview-analysis-dimensions]] izinli lexical input) | no | active-compliant | söylenen SÖZDEN çıkarım (içerik), akustik karakteristikten değil; yalnız ÖNERİ üretir — **insan onayı zorunlu** |
| **per_participant_device** | katılımcı-başına ayrı cihaz/hesap katılımı | no | active-compliant | opsiyonel düzen: aynı odada herkes kendi cihazından katılırsa cihaz-bazlı otomatik öneri güçlenir |
| **human_labeling** | görüşmeci/toplantı-sahibi küme-başına atama (küme kısa-kesit inceleme UI) | no | active-compliant | **paylaşımlı-mikrofon kanonik yolu**; **insan onayı** beyanın kendisidir; her atama `evidence.speaker.attributed` audit event'i üretir |

## 2. Koşullu yöntem (sentinel — internal-only owner-onaylı; aday DAİMA dışlanmış)

| method | sebep | koşul/scope (yürürlük) | status |
|---|---|---|---|
| **voiceprint_enrollment** | kalıcı ses-şablonu (voiceprint) + kimlik eşleme = KVKK m.6 **özel-nitelikli biyometrik** (açık rıza şart) + GDPR Art.4(14)/Art.9 biyometrik eşiği + EU AI Act **biyometrik-tanımlama yüksek-risk** + US eyalet-hukuku maruziyeti (Illinois BIPA vb.; jurisdictional). Ağır rejim — bu yüzden scope DAR tutulur | **owner beyanı 2026-07-02 KAYITLI** ([[ATS-0014]] Accepted; ayrı ADR + açık-rıza akışı + owner risk-kabul koşulları karşılandı): YALNIZ **iç-kullanıcı** opt-in; **aday ASLA enroll edilmez** (candidate_exclusion; eleme-yoluyla öneri); **amaç-sınırlı** (yalnız attribution önerisi — authentication/izleme yasak) + **self-service silme** (crypto-erase, [[data-lifecycle-register]] `voiceprint_template`); rıza metinleri [[consent-texts-voice-enrollment]]; **imzalı DPIA** ([[dpia-voice-enrollment]]) + VERBIS = runtime-enable kanıtı; runtime **P1** gate-locked | active-internal-consented |

## 3. Doğrulama (`scripts/check-speaker-attribution.mjs`)

§0 sözlük + invariant 1–6: aktif yöntem allowlist (yalnız 4, duplicate yasak, strict satır formatı) + `biometric=no` + yasak biyometrik-kavram taraması (§1 gövdesinin tamamı; TR alias'lar dahil: ses izi/imzası/biyometrisi, speaker recognition, voice biometrics); insan-onay tokeni (lexical/human_labeling); sentinel voiceprint_enrollment korunur + §1'e taşınamaz + status=active-internal-consented + satırında iç-kullanıcı/aday-ASLA/candidate_exclusion/amaç-sınır/self-service/DPIA/P1 tokenları; embedding invariant cümlesi literal-pinli; bölüm yapısı allowlist (§0–§4; ara "1a"/rakamsız H2 fail); cross-doc: event-taxonomy `evidence.speaker.attributed`+`ledger_entry_ref` + data-lifecycle `speaker_attribution_map`+`voiceprint_template`; gömülü self-test (negatif vektörler fail eder).

## 4. Bağlantı

- [[ATS-0013]] kararı · [[ATS-0012]]/[[interview-analysis-dimensions]] (`biometric_signal` yasaklı input; transcript_text lexical-only) · [[ATS-0003]] (kayıt rızası; biyometrik/özel-nitelikli sınır) · [[ATS-0010]]/[[event-taxonomy]] (`evidence.speaker.attributed`) · [[data-lifecycle-register]] (veri-sınıfı/retention) · [[human-oversight-standard]] (insan-onay düzlemi).
