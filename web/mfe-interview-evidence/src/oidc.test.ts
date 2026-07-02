/** oidc.ts saf-fonksiyon testleri (node env; WebCrypto global). */
import { describe, expect, it } from "vitest";
import { buildAuthorizeUrl, exchangeCode, pkceCookieAttributes, randomToken, s256Challenge } from "./oidc";

const CFG = { issuer: "http://idp.test", clientId: "ats-mfe", redirectUri: "http://app.test/", scope: "openid ats.transcript.read" };

describe("pkce", () => {
  it("randomToken url-safe ve yeterince uzun", () => {
    const t = randomToken(48);
    expect(t).toMatch(/^[A-Za-z0-9_-]{60,}$/);
    expect(randomToken(48)).not.toBe(t);
  });

  it("s256Challenge RFC7636 test vektörü", async () => {
    // RFC 7636 appendix B
    expect(await s256Challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"))
        .toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});

describe("buildAuthorizeUrl", () => {
  it("zorunlu parametreler + S256", () => {
    const u = new URL(buildAuthorizeUrl("http://idp.test/authorize", CFG, "st-1", "ch-1"));
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("client_id")).toBe("ats-mfe");
    expect(u.searchParams.get("state")).toBe("st-1");
    expect(u.searchParams.get("code_challenge")).toBe("ch-1");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
  });
});

describe("exchangeCode", () => {
  const okFetch = (body: unknown, status = 200) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("happy path: form-encoded POST + bearer token döner", async () => {
    let captured: { url: string; body: string } | null = null;
    const fetchFn = (async (url: RequestInfo | URL, init?: RequestInit) => {
      captured = { url: String(url), body: String(init?.body) };
      return new Response(JSON.stringify({ access_token: "tok-1", token_type: "Bearer" }), { status: 200 });
    }) as unknown as typeof fetch;
    const tok = await exchangeCode("http://idp.test/token", CFG, "code-1", "ver-1", fetchFn);
    expect(tok).toBe("tok-1");
    expect(captured!.url).toBe("http://idp.test/token");
    expect(captured!.body).toContain("grant_type=authorization_code");
    expect(captured!.body).toContain("code_verifier=ver-1");
  });

  it("non-200 fail-closed", async () => {
    await expect(exchangeCode("http://idp.test/token", CFG, "c", "v", okFetch({ error: "invalid_grant" }, 400)))
        .rejects.toThrow("token exchange başarısız: 400");
  });

  it("access_token'sız yanıt fail-closed", async () => {
    await expect(exchangeCode("http://idp.test/token", CFG, "c", "v", okFetch({ token_type: "Bearer" })))
        .rejects.toThrow("token yanıtı geçersiz");
  });

  it("token_type EKSİKSE fail-closed (Bearer varsayılmaz)", async () => {
    await expect(exchangeCode("http://idp.test/token", CFG, "c", "v",
        okFetch({ access_token: "t" }))).rejects.toThrow("token yanıtı geçersiz");
  });

  it("bearer-dışı token_type fail-closed", async () => {
    await expect(exchangeCode("http://idp.test/token", CFG, "c", "v",
        okFetch({ access_token: "t", token_type: "MAC" }))).rejects.toThrow("token yanıtı geçersiz");
  });
});

describe("pkceCookieAttributes", () => {
  it("https'te Secure ZORUNLU, http-dev'de yok", () => {
    expect(pkceCookieAttributes("https:")).toContain("; Secure");
    expect(pkceCookieAttributes("http:")).not.toContain("Secure");
    expect(pkceCookieAttributes("https:")).toContain("SameSite=Lax");
  });
});
