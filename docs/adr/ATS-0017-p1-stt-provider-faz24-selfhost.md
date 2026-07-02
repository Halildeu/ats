# ATS-0017 — P1 STT/diarization sağlayıcısı: Faz 24 self-host motoru (AIProvider portu arkasında)

- **Durum:** Önerildi — cross-AI review (Codex, bu PR) + **OWNER ONAYI bekliyor** (model/ürün-seçimi kuralı: cross-AI mutabakat + kullanıcıya sunum; owner reddederse port sayesinde değişim ucuz)
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
