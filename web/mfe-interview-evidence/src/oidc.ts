/**
 * OIDC Authorization Code + PKCE (S256) — IdP-NÖTR, bağımlılıksız (WebCrypto).
 * Sözleşme:
 *  - Token YALNIZ bellekte yaşar (localStorage/sessionStorage YASAK — bundle-guard da tarar);
 *    sayfa yenilenince düşer, yeniden login (P1 bilinçli sınır; refresh-token kapsam dışı).
 *  - PKCE verifier redirect'i atlatmak zorunda (tam sayfa dönüşünde bellek ölür):
 *    verifier+state çifti KISA-ÖMÜRLÜ (5 dk) SameSite=Lax cookie'de taşınır ve
 *    callback'te HEMEN silinir. localStorage/sessionStorage BİLİNÇLE kullanılmaz
 *    (bundle-guard da yasaklar); verifier tek-kullanımlık PKCE değeridir,
 *    kişisel veri/credential değildir; access-token ASLA depolanmaz.
 *  - state CSRF koruması: rastgele, callback'te birebir doğrulanır.
 */

export type OidcConfig = {
  issuer: string;
  clientId: string;
  redirectUri: string;
  scope: string;
};

type Discovery = {
  authorization_endpoint: string;
  token_endpoint: string;
};

const PKCE_COOKIE = "ats_oidc_pkce"; // {state,verifier} b64url-JSON — callback'te hemen silinir

/** Saf: cookie öznitelikleri — HTTPS'te Secure ZORUNLU (dev http://localhost istisnası). */
export function pkceCookieAttributes(protocol: string): string {
  return `Max-Age=300; Path=/; SameSite=Lax${protocol === "https:" ? "; Secure" : ""}`;
}

function setPkceCookie(value: string): void {
  document.cookie = `${PKCE_COOKIE}=${value}; ${pkceCookieAttributes(window.location.protocol)}`;
}

function readAndClearPkceCookie(): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${PKCE_COOKIE}=([^;]*)`));
  document.cookie = `${PKCE_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`; // tek kullanımlık
  return m ? m[1] : null;
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function randomToken(byteLen = 32): string {
  const bytes = new Uint8Array(byteLen);
  crypto.getRandomValues(bytes);
  return b64url(bytes);
}

export async function s256Challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

export async function discover(issuer: string, fetchFn: typeof fetch = fetch): Promise<Discovery> {
  const resp = await fetchFn(`${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`);
  if (!resp.ok) {
    throw new Error(`OIDC discovery başarısız: ${resp.status}`);
  }
  const doc = (await resp.json()) as Partial<Discovery>;
  if (!doc.authorization_endpoint || !doc.token_endpoint) {
    throw new Error("OIDC discovery eksik alan (authorization_endpoint/token_endpoint)");
  }
  return doc as Discovery;
}

export function buildAuthorizeUrl(
  authorizationEndpoint: string,
  cfg: OidcConfig,
  state: string,
  challenge: string,
): string {
  const u = new URL(authorizationEndpoint);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("scope", cfg.scope);
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}

/** Login başlat: PKCE üret, {state,verifier}'ı kısa-ömürlü sakla, IdP'ye yönlen. */
export async function startLogin(cfg: OidcConfig): Promise<void> {
  const disco = await discover(cfg.issuer);
  const verifier = randomToken(48);
  const state = randomToken(16);
  setPkceCookie(b64url(new TextEncoder().encode(JSON.stringify({ state, verifier }))));
  window.location.assign(buildAuthorizeUrl(disco.authorization_endpoint, cfg, state, await s256Challenge(verifier)));
}

export type CallbackResult = { accessToken: string } | null;

/**
 * Callback işleme: URL'de code+state varsa doğrula, verifier'ı TÜKET (sil),
 * token'ı değiş ve URL'i temizle. code/state yoksa null (normal sayfa yükü).
 */
export async function handleCallback(
  cfg: OidcConfig,
  fetchFn: typeof fetch = fetch,
): Promise<CallbackResult> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) {
    return null;
  }
  const cookieRaw = readAndClearPkceCookie(); // tek kullanımlık — hata olsa da tüketilir
  const storedRaw = cookieRaw
      ? new TextDecoder().decode(Uint8Array.from(
          atob(cookieRaw.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0)))
      : null;
  window.history.replaceState(null, "", cfg.redirectUri); // code URL'de kalmaz
  if (!storedRaw) {
    throw new Error("PKCE durumu yok (yeni sekme/expired) — yeniden giriş yapın");
  }
  const stored = JSON.parse(storedRaw) as { state: string; verifier: string };
  if (stored.state !== state) {
    throw new Error("state uyuşmuyor (CSRF korunması) — yeniden giriş yapın");
  }
  const disco = await discover(cfg.issuer, fetchFn);
  return { accessToken: await exchangeCode(disco.token_endpoint, cfg, code, stored.verifier, fetchFn) };
}

export async function exchangeCode(
  tokenEndpoint: string,
  cfg: OidcConfig,
  code: string,
  verifier: string,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
    client_id: cfg.clientId,
    code_verifier: verifier,
  });
  const resp = await fetchFn(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!resp.ok) {
    throw new Error(`token exchange başarısız: ${resp.status}`);
  }
  const json = (await resp.json()) as { access_token?: string; token_type?: string };
  // token_type OAuth'ta ZORUNLU alandır — eksikse de fail-closed (Bearer varsayılmaz)
  if (!json.access_token || json.token_type?.toLowerCase() !== "bearer") {
    throw new Error("token yanıtı geçersiz (access_token/token_type zorunlu; yalnız Bearer)");
  }
  return json.access_token;
}

/** Config env'den; issuer boşsa OIDC kapalıdır (dev-paste fallback görünür). */
export function oidcConfigFromEnv(): OidcConfig | null {
  const issuer = import.meta.env.VITE_OIDC_ISSUER as string | undefined;
  if (!issuer) {
    return null;
  }
  return {
    issuer,
    clientId: (import.meta.env.VITE_OIDC_CLIENT_ID as string | undefined) ?? "ats-mfe",
    redirectUri: (import.meta.env.VITE_OIDC_REDIRECT_URI as string | undefined)
        ?? window.location.origin + "/",
    scope: (import.meta.env.VITE_OIDC_SCOPE as string | undefined)
        ?? "openid ats.transcript.read",
  };
}
