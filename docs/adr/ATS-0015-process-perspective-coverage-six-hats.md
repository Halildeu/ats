# ATS-0015 — process_perspective_coverage: Altı-Şapka lensli süreç-perspektif kapsaması (içerik-tabanlı; kişi-profilleme dışlanmış)

- **Durum:** Önerildi (cross-AI review bekliyor) — owner isteği 2026-07-02 ("altı şapka kuralına göre toplantının nasıl ilerlediğini anlamak") + owner /goal tam-otonom-tamamla direktifi
- **Tarih:** 2026-07-02
- **Bağlam kaynağı:** owner sorusu "altı Şapka kuralı ile toplantıda verimli/nasıl ilerlediğini anlamak — sıkıntı olur mu?" · [[ATS-0012]] (analiz-boyutları; invariant-1: yeni aktif boyut = ayrı ADR) · [[ATS-0005]] (affect yasağı)
- **Karar tipi:** Ürün/AI-kapsam kararı (gate-safe; runtime P1). Uygunluk iddiası değil.

## Bağlam

Owner, toplantı/mülakatın **verimli ilerleyip ilerlemediğini** De Bono Altı-Şapka çerçevesiyle anlamak istiyor. Cevap (2026-07-02): içerik-tabanlı **süreç** analizi olarak sıkıntısız; iki sınır ihlal edilirse sıkıntılı: (1) kişi-profillemesine kayarsa (`personality_inference` — [[ATS-0012]] §2 dışlanmış), (2) "duygu tespiti" gibi Art.5-yasaklı-affect çağrışımlı çıkarım/pazarlamaya kayarsa.

## Karar

[[interview-analysis-dimensions]] registry'sine **6. aktif içerik-tabanlı boyut** eklenir: **`process_perspective_coverage`** (input: `transcript_text`, `rubric`; output: `coverage`, `citation`; status: `active-compliant`).

**Ne yapar:** transkript katkılarını Altı-Şapka perspektif sınıflarına göre İÇERİK üzerinden sınıflar — veri/olgu (beyaz), **beyan edilen** çekince/itiraz (kırmızı karşılığı — yalnız SÖZLE ifade edilmiş pozisyon), risk/eleştiri (siyah), fayda (sarı), yaratıcı öneri (yeşil), süreç-yönetimi (mavi) — ve **oturum-düzeyi** kapsama bulgusu üretir: "risk perspektifi hiç konuşulmadı", "oturumun ~%70'i bilgi-aktarımı", "yaratıcı öneri 2 kez, ikisi de takip edilmedi" (+ citation).

**Makine-zorlanır sınır seti:**
1. **Süreç-düzeyi, kişi-düzeyi DEĞİL:** çıktı toplantı/oturum İLERLEYİŞİ hakkındadır; "bu kişi hep duygusal/analitik" tarzı kişi-düzeyi kalıcı etiket/profil ÜRETİLMEZ ([[ATS-0012]] §2 `personality_inference` dışlaması aynen korunur; safe_alternative zinciri değişmez).
2. **"Kırmızı şapka" = YALNIZ açıkça beyan edilen içerik:** kişinin SÖZLE ifade ettiği çekince/itiraz/karşı-görüş iddiasının lexical sınıflamasıdır. **Lexical sentiment/polarity/valence/mood veya ima-edilen-endişe (unstated concern) ÇIKARIMI YAPILMAZ**; üsluptan "kaygılı görünüyor" çıkarmak YASAK — yalnız "çekincem/kaygım şu" gibi açık beyan içerik-iddiası sayılır. "Kişi kaygılı/duygusal/negatif" tarzı kişi-atribütü üretilmez. Ses-tonu/yüz/biyometrik sinyalden çıkarım YOKTUR (`transcript_text` lexical-only). Bu, EU AI Act Art.5 duygu-tanıma tanımının (biyometrik veriden çıkarım) dışında kalır — yine de ürün çıktısı/pazarlamada **"duygu tespiti" / "kırmızı şapka" / şapka-adı etiketi KULLANILMAZ**; jenerik "çekince/itiraz perspektifi", "risk perspektifi" adları kullanılır.
3. **Tek-aday oturumu netliği:** tek-aday mülakatta çıktı YALNIZ o oturumdaki cevap/rubric kapsaması bulgusudur; **cross-session kişi profili / trend / trait** ("risk-körü", "yaratıcı tip", "analitik tip" gibi kalıcı etiket) ÜRETİLEMEZ; aggregation yalnız session/rubric düzeyinde kalır; bulgu **tek başına aday aleyhine karar üretmez** (insan-inceleme + citation zorunlu, [[human-oversight-standard]]).

**Enforcement (bu iddianın mekanizması):** registry satırının not-hücresi guard'da **LITERAL-PİN** + sınır-token seti + input/output pini (`transcript_text, rubric` → `coverage, citation`) + 3 kayma-vektörlü self-test (kişi-profilleme kayması / sınır-silme / sentiment-proxy kayması) — CI `analysis-dimensions-guard`.

**Adlandırma:** ürün yüzeyinde jenerik **"perspektif kapsaması"**; "Altı Şapka / Six Thinking Hats" (de Bono) referansı dokümantasyonda metodoloji-atfı (nominative use) olarak kalır, ürün/özellik adı olarak kullanılmaz.

## Sonuçlar

**Olumlu:** owner'ın toplantı-verimliliği ihtiyacı yasal-güvenli içerik düzleminde karşılanır; rubric'e bağlanabilir (hangi perspektifler beklenirdi); citation'lı kanıt üretir; mülakatta "adayın cevabı hangi perspektifleri kapsadı" iş-ilişkili kullanımına da uzanır (rubric şartıyla).
**Olumsuz:** kişi-bazlı "şapka profili" bilinçli olarak YOK (personality_inference dışlaması) — bazı kullanıcılar kişi-analizi bekleyebilir; sınır satışta anlatılır.

## Değerlendirilen alternatifler

- **(A) Kişi-bazlı şapka-profili** ("Ali kırmızı-ağırlıklı") — RED: `personality_inference` = yüksek-risk profilleme ([[ATS-0012]] §2); işe-alım bağlamında ayrımcılık yüzeyi.
- **(B) Hiç eklememe** — owner'ın açık isteği masada kalırdı; içerik-tabanlı süreç analizi meşru ve düşük-riskli.
- **(C) Süreç-düzeyi perspektif-kapsama (seçilen).**

## Gate disiplini

ADR + registry satırı + guard allowlist güncellemesi **gate-safe**. Analiz runtime'ı **P1, G0=GO sonrası**. "çalışıyor" DENMEZ.

## Bağlantı

- [[interview-analysis-dimensions]] (registry; allowlist 5→6) · [[ATS-0012]] (çerçeve + dışlamalar) · [[ATS-0005]] (affect yasağı) · rubric-standard (iş-ilişkili kriter) · [[human-oversight-standard]] (insan-final).
