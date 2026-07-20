# ATS-0023 — Aday kontrollü PDF özgeçmiş içe aktarma

- Durum: **ACCEPTED FOR SYNTHETIC TEST ONLY**
- Tarih: 2026-07-18
- Bağlı ürün dilimi: `Halildeu/ats#163`, `Halildeu/platform-web#951`
- Gerçek PII aktivasyonu: **ONAYLANMADI**; #133 ve isimli Privacy/Legal/DPO/Owner kapıları geçerlidir.

## Karar

PDF özgeçmiş içe aktarma ayrı bir mikroservis açmadan ATS modular monolith içinde uygulanır.
Manuel başvuru formu her zaman kullanılabilir kalır. PDF yalnız adayın inceleyeceği alan önerileri
üretir; otomatik başvuru, scoring, ranking, shortlist veya recruiter-facing parse sinyali üretmez.

Akış:

1. Aday güncel sürümlü aydınlatmayı açıkça kabul eder ve tenant + yayınlanmış ilan + 256-bit
   candidate capability ile bağlı import oturumu oluşturur.
2. PDF digest'i PostgreSQL'de 30 saniyelik compare-and-set rezervasyonuna alınır; aynı key+byte
   süreçler/replicalar arasında tek-uçuş olur, farklı byte/key `409` ile kapanır. Ardından PDF
   boyut, MIME/magic, malware ve sayfa/metin sınırlarından geçer. Raw byte yalnız bounded
   bellekte taranır/ayrıştırılır; DB, object store, log, trace veya WORM'a yazılmaz.
3. Yalnız allowlist alanlar `page + gerçek text-line bbox + confidence + exact parserVersion`
   provenance'iyle geçici proposal olur. Protected ve unsupported içerik downstream'e çıkmaz.
4. Her alan aday tarafından `ACCEPTED | EDITED | REJECTED` yapılır. `UNREVIEWED` ve
   `CONTROL_REQUIRED` taslağa geçemez.
5. “Seçtiğim alanları forma aktar” işlemi server-side aday taslağını ve `CONFIRMED` terminal
   durumunu tek PostgreSQL transaction'ında oluşturur; geçici proposal ve document digest aynı
   transaction'da silinir.
6. Ayrı application-submit işlemi confirmed taslağı tenant + job + candidate capability + CAS
   version ile bir kez tüketir. Kaynak kapalı kümesi `PDF_CONFIRMED | MANUAL_ONLY |
   MANUAL_AFTER_IMPORT` olarak application satırında korunur, recruiter DTO'suna çıkarılmaz.
7. Açık importla manuel submit önce importu `CANCELLED` yapar ve proposal'ları aynı transaction'da
   temizler. Başvuru otomatik gönderilmez.

## Yaşam döngüsü ve eşzamanlılık

- Upload penceresi en fazla 30 dakika; immutable unfinished import TTL ilk upload rezervasyon
  receipt anından 24 saattir. Retry/rebind ve explicit replace TTL'yi ileri taşımaz.
- “PDF'yi değiştir” ayrı candidate action'ıdır: eski transient proposal/digest temizlenir, eski
  belge sürümü `VERSION_SUPERSEDED` olur, import `ACTIVE` kalır ve yeni document-version açılır.
- `CONFIRMED | CANCELLED | REJECT_ALL | EXPIRED | FAILED | SUPERSEDED` terminal ve immutable'dır.
- Candidate mutation'ları import version CAS kullanır; stale işlem `409` alır.
- Terminal transition proposal/document digest'i senkron temizler. Beş dakikalık privacy worker,
  due ACTIVE importları `EXPIRED` yapar ve süresi dolmuş tüketilmemiş aday taslaklarını siler.
- Parser executor sınırsız kuyruk kullanmaz. Worker doluyken yeni raw-byte task kabul edilmez;
  timeout olan worker kapasiteyi meşgul tutar ve yeni çağrılar fail-closed reddedilir.
- WORM `candidate-resume-import/v1` unlinkability receipt'i bu source diliminde henüz yoktur;
  gerçek candidate-facing aktivasyon için erasure-domain key destruction ve backup/telemetry
  unlinkability kanıtıyla birlikte ayrıca tamamlanmalıdır.

## Ürün ve rakip standardı bağlamı

Özgeçmişten form doldurma, çağdaş ATS ürünlerinde aday sürtünmesini azaltan table-stake bir
örüntü olarak ele alınır; parity iddiası değildir. Bu kararın farkı adayın alan bazında son sözü,
kanıtlanabilir kaynak satırı, protected-field suppression, manuel fallback, no-decision-use ve
geçici veri purge'ünü tek sözleşmede zorlamasıdır.

## Bilinen aktivasyon sınırları

- Bu source dilimi `.test` e-posta zorunluluğuyla yalnız geri bağlanamaz sentetik fixture kabul eder.
- Mevcut malware adapter'ı sentetik EICAR fail-closed kanıtıdır; gerçek CV için production-grade
  scanner ve parser OS/container sandbox kanıtı ayrıca gerekir.
- Dijital text-layer PDF desteklenir. OCR/scanned PDF, external parser, gerçek aday pilotu ve gerçek
  PII bu ADR ile açılmaz.
- Cross-AI review, CI, immutable image, GitOps test deploy ve persona browser acceptance ayrı
  kanıtlardır; bu ADR bunların yerine geçmez.
