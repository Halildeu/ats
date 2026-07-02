#!/usr/bin/env node
/**
 * DEV kimlik aracı (yalnız lokal geliştirme; PROD'da GERÇEK OIDC IdP — ayrı dilim):
 * node:crypto ile RSA-2048 üretir, JWKS'i :9451'de yayınlar, RS256 dev-JWT basar.
 * Bağımlılık YOK. Anahtar bellekte — process ölünce yok (kalıcı sır üretmez).
 *
 * Kullanım: node dev/jwt-dev-server.mjs [tenant] [sub] [scopes...]
 */
import { createServer } from "node:http";
import { createSign, generateKeyPairSync, randomUUID } from "node:crypto";

const tenant = process.argv[2] ?? "dev-tenant";
const sub = process.argv[3] ?? "dev-reviewer";
const scope = process.argv.slice(4).join(" ")
    || "ats.consent.write ats.recording.write ats.transcript.read ats.citation.write ats.review.write ats.review.read ats.export.write ats.dsar.write ats.erasure.execute";

const ISSUER = "https://dev-issuer.local";
const AUDIENCE = "ats-api";
const PORT = 9451;

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = publicKey.export({ format: "jwk" });
const kid = randomUUID();
const jwks = JSON.stringify({ keys: [{ ...jwk, kid, alg: "RS256", use: "sig" }] });

const b64u = (buf) => Buffer.from(buf).toString("base64url");
function mintToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64u(JSON.stringify({ alg: "RS256", typ: "JWT", kid }));
  const payload = b64u(JSON.stringify({
    iss: ISSUER, aud: AUDIENCE, sub, tenant, scope, iat: now, exp: now + 3600,
  }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${b64u(signer.sign(privateKey))}`;
}

createServer((req, res) => {
  if (req.url === "/jwks.json") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(jwks);
    return;
  }
  if (req.url === "/token") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(mintToken());
    return;
  }
  res.writeHead(404);
  res.end();
}).listen(PORT, "127.0.0.1", () => {
  console.log(`JWKS:  http://127.0.0.1:${PORT}/jwks.json`);
  console.log(`Token: http://127.0.0.1:${PORT}/token  (tenant=${tenant} sub=${sub})`);
  console.log(`ENV:   ATS_JWKS_URI=http://127.0.0.1:${PORT}/jwks.json ATS_JWT_ISSUER=${ISSUER} ATS_JWT_AUDIENCE=${AUDIENCE}`);
  console.log("");
  console.log(mintToken());
});
