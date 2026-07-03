# mfe-interview-evidence — P1 ürün yüzeyi

`@ats/ui` tüketen uygulama. P1 F1–F10 akışının UI yüzeyi tek sayfada:

- **Kimlik**: OIDC Authorization-Code+PKCE (IdP-nötr; token YALNIZ bellekte — yenilemede düşer).
- **F1/F2**: rıza kaydı (aydınlatma + operatör-kaydı beyanı; ön-seçili state YOK) + kayıt yükleme
  (consent-gate'li — GRANTED değilse sunucu fail-closed reddeder).
- **F3**: transkript liste/seçim (pointer-only özet) + zaman-damgalı segment görünümü
  (S1..Sn takma-ad rozetleri — ATS-0013; mm:ss).
- **F4/F5**: claim → citation (entailment rozeti; kanıt-kapısı: yalnız SUPPORTED+kaynaklı
  vaka açar) → üç insan yolu (NO_CHANGE/EDIT/REJECT) → rationale → FINALIZE;
  **vaka listesi + resume** (yenileme sonrası kalınan state'ten devam; AI_SUGGESTED için START).
- **F7**: FINALIZED vakadan kanıt-paketi export'u (criterion + job-relatedness ref;
  dev-bağlam uyarısı görünür; `import.meta.env.PROD`'da bu yol fail-closed kapalıdır).
- **F10**: DSAR intake (subjectRef OPAK — PII girilmez) + iki-adımlı yıkıcı erasure
  (bu ekran hedefli WORM tombstone üretmez; silme privacy-event'leriyle kayıtlanır).

## Lokal uçtan-uca zincir (5 servis)

Aşağıdaki komutlar canlı doğrulanmış hâlleridir (2026-07-03 browser-verify oturumları).

```bash
# 1) PostgreSQL 16 (:55432)
docker run -d --name ats-pg-dev -e POSTGRES_PASSWORD=dev -p 55432:5432 postgres:16

# 2) Dev-IdP (:9451 — discovery + authorize + token + JWKS; yalnız lokal)
node dev/jwt-dev-server.mjs

# 3) AI stub (:9452 — /v1/cite; claim'de "desteklenmeyen"→NOT_SUPPORTED,
#    "yetersiz"→INSUFFICIENT dalları; aksi SUPPORTED)
node dev/ai-stub.mjs

# 4) app-boot (:8080) — backend/ dizininde; önce `mvn install -DskipTests`
#    (kardeş modüller ~/.m2'de olmalı; -pl tek başına ilk seferde yetmez)
SPRING_APPLICATION_JSON='{"ats":{"db":{"url":"jdbc:postgresql://127.0.0.1:55432/postgres","username":"postgres","password":"dev"},"ai":{"baseUrl":"http://127.0.0.1:9452","connectTimeoutMs":2000,"requestTimeoutMs":8000},"security":{"jwksUri":"http://127.0.0.1:9451/jwks.json","issuer":"https://dev-issuer.local","audience":"ats-api"},"ingest":{"maxUploadBytes":10485760}}}' \
  mvn -pl app-boot spring-boot:run
# sağlık: curl http://127.0.0.1:8080/healthz  → 200

# 5) MFE (:5183) — packages/ui içinde de `npm install` gerekir (file: bağımlılık)
VITE_OIDC_ISSUER=http://127.0.0.1:9451 npm run dev
# probe: http://localhost:5183 (localhost'a bind eder; 127.0.0.1 curl'ü 000 verebilir)
```

## Seed reçeteleri (dev)

```bash
TOKEN=$(curl -s http://127.0.0.1:9451/token)   # düz JWT string döner (JSON değil)

# Rıza (DİKKAT: path /recording-consent — /consent bilinmeyen yüzeydir → denyAll 403)
curl -X PUT http://127.0.0.1:8080/api/v1/interviews/iv-demo-1/recording-consent \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'X-ATS-Idempotency-Key: seed-1' \
  -d '{"subjectRef":"subj-ref-1","state":"GRANTED"}'          # → 204

# Transkript (tablo: transcript; segment alanları SNAKE_CASE — camelCase fail-closed reddedilir)
docker exec -i ats-pg-dev psql -U postgres <<'SQL'
INSERT INTO transcript (tenant_id, transcript_key, interview_id, source_object_key, language, segments)
VALUES ('dev-tenant', 'iv-demo-1/tr-0001', 'iv-demo-1', 'obj/iv-demo-1/rec-1', 'tr-TR',
'[{"index":0,"speaker_label":"S1","start_ms":0,"end_ms":4000,"text":"Soru..."},
  {"index":1,"speaker_label":"S2","start_ms":4000,"end_ms":9000,"text":"Yanit..."}]'::jsonb)
ON CONFLICT DO NOTHING;
SQL
```

Not: kayıt yükleme (F2) UI'dan da yapılabilir — transcript üretimi ayrı süreçtir
(transcription orchestration); dev'de transkript yukarıdaki SQL ile seed edilir.

## Bilinen tuzaklar

| Belirti | Kök sebep / çözüm |
|---|---|
| Tüm istekler 401 | `jwksUri` **`/jwks.json`** olmalı (`/jwks` sessiz imza-hatası üretir) |
| Consent 403 | Path `/recording-consent` (`/consent` bilinmeyen yüzey → `denyAll`) |
| Transcript GET 200 ama segment yok / parse hatası | Seed'de segment alanları snake_case olmalı (`speaker_label`, `start_ms`, `end_ms`) |
| Citation `consent_record_missing` | O mülakat için GRANTED consent yok — gate citation'da da çalışır (fail-closed) |
| Login sonrası istekler yenilemede 401 | Token YALNIZ bellekte (tasarım) — yeniden login |
| `vite` porta geldi ama `curl 127.0.0.1:5183` 000 | vite `localhost`'a bind eder — `http://localhost:5183` kullan |
| `npx tsc` "not the tsc command" | O dizinde `npm install` eksik (taze checkout'ta `packages/ui` + burada) |

**KİMLİK:** dev-IdP + dev-token aracı YALNIZ lokal geliştirme içindir (anahtar bellekte,
kalıcı sır yok); prod'da gerçek kurumsal IdP bağlanır (deploy-wiring). PKCE cookie HTTPS'te
Secure flag'iyle set edilir — prod serving HTTPS olmalı. "Çalışıyor" iddiası browser-verify
kanıtına bağlıdır; export'un dev-bağlam ref'leri prod denetim paketi DEĞİLDİR (PROD'da yol kapalı).
