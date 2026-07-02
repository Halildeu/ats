# mfe-interview-evidence — F3 segment görünümü (P1)

`@ats/ui` tüketen ilk uygulama: JWT'li `GET /api/v1/interviews/{id}/transcript?key=` çağrısıyla
zaman-damgalı segment listesi (S1..Sn takma-ad rozetleri — ATS-0013; mm:ss; metin).

## Lokal uçtan-uca (dev)
1. PG: `docker run --rm -d --name ats-pg -e POSTGRES_PASSWORD=dev -p 55432:5432 postgres:16-alpine`
2. Dev kimlik: `node dev/jwt-dev-server.mjs` (JWKS :9451 + konsola dev-JWT basar)
3. app-boot (ayrı terminal, backend/):
   `ATS_DB_URL=jdbc:postgresql://127.0.0.1:55432/postgres ATS_DB_USERNAME=postgres ATS_DB_PASSWORD=dev \
    ATS_AI_BASE_URL=http://127.0.0.1:9 ATS_JWKS_URI=http://127.0.0.1:9451/jwks.json \
    ATS_JWT_ISSUER=https://dev-issuer.local ATS_JWT_AUDIENCE=ats-api \
    mvn -pl app-boot spring-boot:run`
4. MFE: `npm install && npm run dev` → http://localhost:5183 (vite `/api` proxy'si :8080'e)
5. Konsoldaki token'ı yapıştır; consent PUT + transcript seed için README-dev akışına bak.

**KİMLİK:** OIDC Authorization-Code+PKCE akışı LANDED (VITE_OIDC_ISSUER set → login butonu;
token yalnız bellekte; PKCE cookie HTTPS'te Secure flag'iyle set edilir — prod serving HTTPS olmalı).
dev-IdP + dev-token aracı YALNIZ lokal geliştirme içindir (anahtar bellekte, kalıcı sır yok);
prod'da gerçek kurumsal IdP bağlanır (deploy-wiring). "Çalışıyor" iddiası browser-verify kanıtına bağlıdır.
