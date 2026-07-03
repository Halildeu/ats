#!/usr/bin/env node
/**
 * DEV kimlik aracı + MİNİMAL DEV-IdP (yalnız lokal geliştirme; PROD'da GERÇEK
 * kurumsal OIDC IdP): node:crypto RSA-2048; :9451'de JWKS + OIDC discovery +
 * authorize (otomatik-onay dev sayfası) + token (PKCE S256 doğrulamalı,
 * TEK-KULLANIMLIK 60sn kod). Bağımlılık YOK; anahtar bellekte (kalıcı sır yok).
 *
 * Kullanım: node dev/jwt-dev-server.mjs [tenant] [sub] [scopes...]
 */
import { createServer } from "node:http";
import { createHash, createSign, generateKeyPairSync, randomUUID } from "node:crypto";

const tenant = process.argv[2] ?? "dev-tenant";
const sub = process.argv[3] ?? "dev-reviewer";
const scope = process.argv.slice(4).join(" ")
    || "ats.consent.write ats.recording.write ats.transcription.write ats.transcript.read ats.citation.write ats.review.write ats.review.read ats.export.write ats.dsar.write ats.erasure.execute";

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

// tek-kullanımlık authorization code'lar: code -> {challenge, exp}
const codes = new Map();

function b64urlSha256(input) {
  return createHash("sha256").update(input).digest("base64url");
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
}

createServer(async (req, res) => {
  // DEV CORS: SPA (vite :5183) discovery+token'ı cross-origin çağırır — yalnız lokal araç
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (url.pathname === "/.well-known/openid-configuration") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      issuer: ISSUER,
      authorization_endpoint: `http://127.0.0.1:${PORT}/authorize`,
      token_endpoint: `http://127.0.0.1:${PORT}/token`,
      jwks_uri: `http://127.0.0.1:${PORT}/jwks.json`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
    }));
    return;
  }
  if (url.pathname === "/authorize") {
    // DEV otomatik-onay: gerçek IdP'de login/consent ekranı olurdu
    const challenge = url.searchParams.get("code_challenge");
    const state = url.searchParams.get("state");
    const redirectUri = url.searchParams.get("redirect_uri");
    if (!challenge || !state || !redirectUri
        || url.searchParams.get("code_challenge_method") !== "S256"
        || url.searchParams.get("response_type") !== "code") {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("authorize: eksik/gecersiz parametre (PKCE S256 zorunlu)");
      return;
    }
    const code = randomUUID();
    codes.set(code, { challenge, exp: Date.now() + 60_000 });
    const back = new URL(redirectUri);
    back.searchParams.set("code", code);
    back.searchParams.set("state", state);
    res.writeHead(302, { Location: back.toString() });
    res.end();
    return;
  }
  if (url.pathname === "/token" && req.method === "POST") {
    const form = new URLSearchParams(await readBody(req));
    const code = form.get("code");
    const verifier = form.get("code_verifier");
    const entry = code ? codes.get(code) : undefined;
    codes.delete(code); // TEK kullanımlık — başarısız denemede de tüketilir
    if (!entry || entry.exp < Date.now()
        || form.get("grant_type") !== "authorization_code"
        || !verifier || b64urlSha256(verifier) !== entry.challenge) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_grant" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ access_token: mintToken(), token_type: "Bearer", expires_in: 3600 }));
    return;
  }
  if (url.pathname === "/jwks.json") {
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
