# ATS-0017 — P1 STT/diarization sağlayıcısı: Faz 24 self-host motoru (AIProvider portu arkasında)

- **Durum:** **Accepted — standing-autonomy kaydı (2026-07-02, Codex 019f23a6 AGREE):** provider seçimi owner'a İKİ KEZ açıkça sunuldu; owner genel "onaylıyorum / tam otonom devam" beyanı + kalıcı "Codex MCP mutabakatı kullanıcı kararı sayılır, beklemeden uygula" çalışma kuralı kapsamında ilerleme yetkisi verdi. **Kabul kapsamı DAR:** mevcut Faz 24 self-host motoru; yeni harcama/vendor/subprocessor YOK; `transfer=self-host-only`; port-reversible. **Kalite/pilot-ready iddiası DEĞİL** — Gate C golden-fixture + kalibrasyon şartı ve owner veto hakkı sürer. **Standing-autonomy SINIRI:** cloud fallback / yeni ücret / yeni subprocessor / gerçek aday verisi / pilot-open / "WER-DER yeterli" iddiası çıkarsa isim-özel owner onayı ŞART.
- **Tarih:** 2026-07-02
- **Bağlam kaynağı:** PRD-P1 F2 (Türkçe STT + diarization) · [[ATS-0004]] (eval-gate; provider açık-sorusu) · ai/README (Faz 24 motoru varsayımı) · ADR-0002/[[ATS-0006]] (TR-residency/on-prem kabiliyeti)

## Bağlam

Slice-2 transkripsiyon orkestrasyonu `AIProvider` portu arkasında sağlayıcı-bağımsız landed. Gerçek sağlayıcı bağlantı slice'ı öncesi seçim gerekiyor. Aday uzayı: (A) Faz 24 self-host motoru, (B) cloud STT (Azure/Google/OpenAI), (C) yeni model eğitimi.

## Karar (önerilen)

**P1 STT+diarization = Faz 24 self-host motorunun yeniden kullanımı** — Türkçe STT (faster-whisper) + diarization (pyannote), `ats-ai` FastAPI servisi olarak `AIProvider` sözleşmesi arkasında (kopya değil, provider-entegrasyon; ADR-0008).

**Gerekçe:** (1) niş vaadiyle bire-bir: Türkçe + on-prem/TR-residency + **üçüncü-taraf subprocessor'a çıkış YOK** — [[data-lifecycle-register]] `ai_provider_payload` canonical `transfer=self-host-only` düzlemi korunur; (2) Faz 24'te ÇALIŞIR durumda (canlı meeting-transcript hattı + GPU host mevcut); (3) maliyet: mevcut varlık, yeni sözleşme/harcama yok; (4) eval-rig (Gate C WER/DER) zaten bu motor için tasarlandı.

**Sınırlar (dürüst):** kalite iddiası YOK — golden Türkçe fixture + Gate C kalibrasyonu olmadan WER/DER "yeterli" DENMEZ (eşikler `uncalibrated`); GPU kapasite/ölçek planı pilot-open öncesi ayrı iş; **pilot-cloud fallback** (B) yalnız owner kararı + subprocessor-register güncellemesi + aday-verisi-cloud-yasak kuralı ([[ATS-0006]]) korunarak açılabilir.

## Değerlendirilen alternatifler

- **(B) Cloud STT** — RED (default): aday ses verisi yurtdışı/subprocessor rejimine girer; on-prem/KVKK-niş anlatısıyla çelişir; vendor maliyet+lock-in. Fallback-opsiyon olarak kayıtlı (owner-gated).
- **(C) Yeni model eğitimi** — RED: maliyet/süre P1 ölçeğinde savunulamaz; mevcut motor yeterli başlangıç.
- **(A) Faz 24 self-host (önerilen).**

## Gate disiplini

Bu ADR seçim kaydıdır; gerçek servis bağlantısı ayrı slice (ATS-0016 sınırları: bugün port + fake). Kalite kanıtı = Gate C, golden fixture sonrası.

## Bağlantı

[[ATS-0004]] · [[ATS-0008]] · [[ATS-0016]] (slice sırası) · ai/eval-harness (Gate C) · subprocessor-register (PRIVATE; transfer=none korunur).

## Amendment — 2026-07-03 canlı wire-contract keşfi (slice-33)

Motorun gerçek HTTP sözleşmesi canlı `/openapi.json`'dan read-only keşfedildi (FastAPI
`live-stt-service` v0.1.0, faster-whisper). Keşif, slice-7 `HttpAIProvider`'ın
varsayımsal sözleşmesini **yanlışladı**; düzeltilmiş gerçekler:

| Boyut | Slice-7 varsayımı | Keşfedilen gerçek (v0.1.0) |
|---|---|---|
| Yol | `POST /v1/transcribe` | `POST /transcribe` (v1 prefix yok) |
| Giriş | JSON `{"audio_ref"}` | **multipart/form-data**, zorunlu binary alan `audio`; opsiyonel `language` query (ISO 639-1) |
| Zaman | `start_ms`/`end_ms` int | `start`/`end` **float saniye** |
| Konuşmacı | segment başına `speaker` | **YOK** — spec: "Diarization separate" |
| Hata haritası | — | 400/413/422 giriş reddi · 503 OOM · 504 inference timeout |

**Overclaim düzeltmesi:** bu ADR'ın başlığındaki "STT/diarization" ifadesi motorun
bugünkü yüzeyi için fazla iddialıdır — **live-stt v0.1.0 diarization SUNMAZ**;
diarization ayrı bileşen/dilim işidir. Adaptör (`Faz24LiveSttProvider`) bu yüzden tüm
segmentlere tek sentinel provider-label `undiarized_stream` verir (SegmentSanitizer →
S1); bu bir diarization sonucu değil, tek-akış fallback'idir ([[ATS-0013]]).

**Adaptör kararları (Codex REVISE absorb):** kanonik transport mTLS reverse-proxy →
public constructor `https` zorunlu (plaintext yalnız loopback test constructor'ı);
`AudioSource` portu yalnız üst katmanda (tenant + consent + WORM ingest-kanıtı)
yetkilendirilmiş opaque ref çözer — global key-lookup köprüsü DEĞİL (tenant-aware boot
kompozisyonu ayrı dilim); blank-text segment DROP değil FAIL; `cite()` bu motorda
NOT_CONFIGURED (delege yok — composite provider ayrı, açık kompozisyon dilimi);
multipart boundary collision-taramalı; contentType ingest-allowlist aynası (kapalı
küme → header-injection yapısal imkânsız). Keşfedilen spec PUBLIC-safe snapshot olarak
pinli (`ai-provider-faz24/src/test/resources/live-stt-openapi-v0.1.0.json`) +
`LiveSttOpenApiConformanceTest` adaptör varsayımlarını makine-zorlamalı doğrular.
İç ağ topolojisi/erişim detayı bu (public) repoya bilinçli yazılmaz.
