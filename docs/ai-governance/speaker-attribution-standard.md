# Speaker Attribution Standard (canonical registry)

> ATS-0013 kanonik kayıt. **Machine-checked** (`scripts/check-speaker-attribution.mjs`, CI `speaker-attribution-guard`).
> Owner senaryosu (2026-07-02): aynı oda + **tek bilgisayar/tek mikrofon + çok konuşmacı** — cihaz-metadata'sı tek başına yetmez. Çözüm: **ayrıştırma (diarization) + biyometrisiz kimlik-eşleme (attribution)**. **Sesten otomatik kimlik (voiceprint) DEFAULT-DIŞLANMIŞ** (§2).
> **Kapsam dürüstlüğü (No Fake Work):** Bu bir tasarım/kapsam sözleşmesidir; diarization/attribution runtime'ı **P1 gate-locked** (G0=GO sonrası). "Uygunluk/conformity" iddiası değildir ([[eu-ai-act-technical-file-index]] readiness disiplini).

## 0. Sözlük (üç ayrı işlem — hukuki eşikleri FARKLI)

- **separation (diarization):** tek ses kanalını oturum-içi akustik kümeleme ile `S1..Sn` **takma-ad** konuşmacılarına AYIRMA. Kimlik iddiası YOK; hangi kümenin kim olduğu bilinmez.
  - **embedding invariantı (sabit cümle):** diarization embedding'leri **session-scoped**'tır; **persist edilmez**, **export edilmez**, **cross-session karşılaştırılmaz**, hiçbir kimlik/kayıt veritabanıyla eşleştirilmez. Amaç ayrıştırmadır; kalıcı ses-şablonu üretilmez — tanımlama eşiği (kalıcı şablon + kimlik eşleme) geçilmez.
- **attribution:** bir `S1..Sn` kümesinin katılımcı display-ref'ine eşlenmesi. YALNIZ §1 biyometrisiz yöntemlerle; kayıt = **insan-onaylı metadata**: iş gerçeği **ledger'a bağlanır** (`ledger_entry_ref`), log düzleminde yalnız opak `target_ref` (two-plane) — `evidence.speaker.attributed` audit event'i ([[event-taxonomy]]); eşleme verisi **`speaker_attribution_map`** sınıfı olarak yaşam-döngüsüne tabi ([[data-lifecycle-register]]). Attribution **OPSİYONELDİR** — eşlenmemiş `S1` takma-adı geçerli kalır (zorla eşleme yok).
- **identification (sesten kimlik):** ses örneğinden kalıcı şablon çıkarıp kişiyi tanıma. **DEFAULT-DIŞLANMIŞ** (§2 sentinel) — KVKK m.6 özel-nitelikli + GDPR Art.4(14)/Art.9 biyometrik eşiği + EU AI Act biyometrik-tanımlama yüksek-risk + US eyalet-hukuku (BIPA vb.). **Dar iddia:** default-dışlama ürünü biyometrik-TANIMLAMA rejiminden uzak tutar; ham ses/görüntü kaydı yine kişisel veridir (`raw_media` rejimi).
- **status:** `active-compliant` (biyometrisiz, izinli) · `excluded-biometric` (default-dışlanmış; aktif edilemez — açılması ayrı ADR + açık rıza + owner risk-kabul gerektirir).

### İnvariantlar (guard)

1. §1 aktif yöntem = **YALNIZ allowlist**: device_metadata · lexical_self_introduction · per_participant_device · human_labeling. Ekstra aktif yöntem → fail (yeni yöntem = ayrı ADR).
2. Aktif yöntem `biometric = no`; aktif satırda biyometrik kavram (voiceprint/ses-şablonu/enrollment/embedding/cross-session eşleme) **geçemez**.
3. `lexical_self_introduction` ve `human_labeling` satırlarında **insan onayı** tokeni zorunlu (otomatik kimlik iddiası yasak).
4. Sentinel `voiceprint_enrollment` §2'de `excluded-biometric` olarak **durmalı** + hiçbir zaman §1'e aktif taşınamaz.
5. §0 embedding invariant cümlesi (session-scoped + persist edilmez + export edilmez + cross-session karşılaştırılmaz) silinemez/yumuşatılamaz.
6. **Cross-doc binding:** `evidence.speaker.attributed` event'i [[event-taxonomy]]'de `ledger_entry_ref` + `target_ref` required-extra ile durmalı; `speaker_attribution_map` sınıfı [[data-lifecycle-register]]'da durmalı. Doküman yapısı pinli: yalnız §0–§4 numaralı bölümler (ara bölüm, örn. "1a", yasak); §1 tablo satırları strict format + duplicate yasak; §1 gövdesinin TAMAMI yasak-kavram taramasına tabidir.

## 1. Aktif attribution yöntemleri (biyometrisiz)

| method | basis | biometric | status | not |
|---|---|---|---|---|
| **device_metadata** | oturum/hesap/cihaz katılım metadata'sı | no | active-compliant | tek-konuşmacılı cihazda otomatik öneri; **paylaşımlı tek-mikrofon odada TEK BAŞINA YETMEZ** (owner senaryosu) — diğer yöntemlerle tamamlanır |
| **lexical_self_introduction** | transcript_text içeriği (sözlü tanıtım/yoklama; [[interview-analysis-dimensions]] izinli lexical input) | no | active-compliant | söylenen SÖZDEN çıkarım (içerik), akustik karakteristikten değil; yalnız ÖNERİ üretir — **insan onayı zorunlu** |
| **per_participant_device** | katılımcı-başına ayrı cihaz/hesap katılımı | no | active-compliant | opsiyonel düzen: aynı odada herkes kendi cihazından katılırsa cihaz-bazlı otomatik öneri güçlenir |
| **human_labeling** | görüşmeci/toplantı-sahibi küme-başına atama (küme kısa-kesit inceleme UI) | no | active-compliant | **paylaşımlı-mikrofon kanonik yolu**; **insan onayı** beyanın kendisidir; her atama `evidence.speaker.attributed` audit event'i üretir |

## 2. Dışlanan yöntem (default — sentinel, aktif edilemez)

| method | sebep | koşul (gelecekte açılırsa) | status |
|---|---|---|---|
| **voiceprint_enrollment** | kalıcı ses-şablonu (voiceprint) + cross-session kimlik eşleme = KVKK m.6 **özel-nitelikli biyometrik** veri (açık rıza şart) + GDPR Art.4(14)/Art.9 biyometrik eşiği + EU AI Act **biyometrik-tanımlama yüksek-risk** sınıfı + US eyalet-hukuku maruziyeti (Illinois BIPA vb.; jurisdictional). Kategorik yasak DEĞİL — ağır rejim; default kapsam dışı | **ayrı ADR** + açık-rıza akışı + özel-nitelikli veri envanteri/retention ([[data-lifecycle-register]]) + **owner risk-kabul**; ancak opsiyonel modül olarak — taslak: [[ATS-0014]] internal-only opt-in (owner risk-kabul bekliyor) | excluded-biometric |

## 3. Doğrulama (`scripts/check-speaker-attribution.mjs`)

§0 sözlük + invariant 1–6: aktif yöntem allowlist (yalnız 4, duplicate yasak, strict satır formatı) + `biometric=no` + yasak biyometrik-kavram taraması (§1 gövdesinin tamamı; TR alias'lar dahil: ses izi/imzası/biyometrisi, speaker recognition, voice biometrics); insan-onay tokeni (lexical/human_labeling); sentinel voiceprint_enrollment korunur + aktif-değil + koşul satırında ayrı-ADR/açık-rıza/risk-kabul; embedding invariant cümlesi literal-pinli; bölüm yapısı allowlist (§0–§4; ara "1a" bölümü fail); cross-doc: event-taxonomy `evidence.speaker.attributed`+`ledger_entry_ref` + data-lifecycle `speaker_attribution_map`; gömülü self-test (negatif vektörler fail eder).

## 4. Bağlantı

- [[ATS-0013]] kararı · [[ATS-0012]]/[[interview-analysis-dimensions]] (`biometric_signal` yasaklı input; transcript_text lexical-only) · [[ATS-0003]] (kayıt rızası; biyometrik/özel-nitelikli sınır) · [[ATS-0010]]/[[event-taxonomy]] (`evidence.speaker.attributed`) · [[data-lifecycle-register]] (veri-sınıfı/retention) · [[human-oversight-standard]] (insan-onay düzlemi).
