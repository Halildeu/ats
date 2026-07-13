# Integrity and provenance screening v1

Faz 25 P6.4, C2PA ve benzeri provenance doğrulamalarını yalnız inceleme
kanıtı olarak taşır. Bu sözleşme deepfake tespiti, gerçeklik doğrulaması,
kimlik doğrulaması, deception/emotion çıkarımı veya aday kararı değildir.

## Semantik sınır

- `NOT_PRESENT`, manifest bulunmadığını söyler; içerik sahte, değiştirilmiş
  veya deepfake demek değildir.
- `VERIFIED_BINDING`, manifest/claim ile asset snapshot bağı doğrulandı
  demektir; içerik doğru, gerçek, güvenilir veya kişiye ait demek değildir.
- Digest/signature problemi yalnız insan incelemesine sunulan provenance
  sinyalidir. Otomatik red, fraud/deception etiketi veya kişi skoru üretemez.
- Raw medya, yüz/ses/liveness şablonu, biyometri, emotion ve affect girdileri
  sözleşme dışıdır.

## Fail-closed zincir

Her receipt şunları tam ve sürümlü taşır:

1. `tenantRef + scopeRef + assetDigest` için yeniden hesaplanan SHA-256 scope
   binding; envelope ayrıca screening, asset, snapshot zamanı, manifest/claim,
   verifier, trust-list ve policy alanlarını içerir ve external claimed
   attestation material-digest/key-version referansına bağlanır;
2. exact asset snapshot digest ve kısa snapshot-to-verification penceresi;
3. manifest ve claim digestleri (varsa), verifier, trust-list ve policy sürümü;
4. her reason için exact evidence digest + snapshot/manifest/claim/verifier/
   trust-list/policy binding'i; orphan reason veya evidence kabul edilmez;
5. false-positive, false-negative, belirsizlik, device/codec ve accessibility
  için digest-bound `SYNTHETIC_ONLY` measurement receipt'leri;
6. server timestamp-authority referansı, en fazla bir saatlik verify-to-record
   penceresi, trust-list freshness ve sınırlı retention/silme politikası;
7. human-review, appeal, correction ve audit lineage.

Stale trust-list sonucu `INCONCLUSIVE` olmak zorundadır. Correction mevcut
receipt'i değiştirmez; yeni digest-sealed receipt exact eski id/digest'i
`supersedes` eder. Aynı receipt'ten iki correction dalı oluşturulamaz.
`INCONCLUSIVE`, manifestin var/yok olduğuna değil doğrulama kanıtının karar
vermeye yetmediğine ilişkin olduğundan `PRESENT` veya `UNKNOWN` ile taşınabilir.
Correction reason, değiştirebileceği alanların allowlist'ini ve gerçek bir
required-diff'i zorlar; zaman, evidence ve audit lineage yeniden kullanılamaz.

Runtime kimlikleri kişi bilgisini serbest metin ref'e saklayamaz: tenant,
scope, screening, asset, snapshot, evidence, audit ve route alanları yalnız
prefix + 16–64 hex opaque kimlik kabul eder. Semantik sürüm/katalog referansları
ayrı alanlardadır.

Coverage measurement receipt'leri kişi/screening kanıtı değildir; aynı sürümlü
sentetik benchmark birden fazla screening tarafından referanslanabilir. Buna
karşılık screening evidence ve audit lineage ref/digest'leri global tekil ve
replay-korumalıdır.

Bu PRE-G0 reference registry, attestation imzasını veya key trust chain'ini
kriptografik olarak doğruladığını iddia etmez. Alanlar yalnız dış doğrulama
receipt'ine claimed ref/material digest taşır; gerçek signer/key verification
adapter'ı ve production trust-store acceptance bu kontratın dışındadır.

## PRE-G0 kapalı kapılar

`actionAllowed`, `adverseActionAllowed`, `automaticRejectionAllowed`,
`mutationAllowed`, `personRiskScoreAllowed` ve `productionEligible` daima
`false`; `legalGate` ve `ownerGate` daima `NOT_MET`; bütün sonuç alanları
`NONE` kalır. Gerçek kişi/production aktivasyonu, hukuki kabul ve owner kabulü
bu kaynak sözleşmesinin dışında attended gate'lerdir.

## Ürün dili

`VERIFIED_BINDING` yanında “authentic, real, genuine, trustworthy, verified
person/identity, proves, confirms, guarantees”; `NOT_PRESENT` yanında “fake,
deepfake, manipulated, tampered, forged, fraudulent” dili kullanılmaz.
Panel yalnız durum, reason/evidence lineage, uncertainty, coverage ve insan
review/appeal/correction yollarını gösterir. Red, fraud işaretleme veya
“deepfake doğrula” aksiyonu eklenmez.

Standart adı, parity/certification/conformity iddiası değildir. Dedicated
desktop ve 390 px browser acceptance ayrıca kanıtlanmadan P6.4 kabul edilmiş
sayılmaz.
