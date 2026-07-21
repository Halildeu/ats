// @vitest-environment jsdom
/**
 * DsarPanel davranış testleri — Codex #76/#77 blocker'larının KALICI regression
 * guard'ları: reason-zorunluluğu (backend sözleşmesi UI'da) + iki-adımlı yıkıcı
 * onay (ilk tık ASLA silmez). fetch mock'lu; ağ yok.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DsarPanel } from "./DsarPanel";

const fetchMock = vi.fn();
const VALID_SUBJECT_REF = "550e8400-e29b-41d4-a716-446655440000";

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function renderPanel(onErased = vi.fn()) {
  render(<DsarPanel token="t" interviewId="iv-1" onErased={onErased} />);
  return onErased;
}

describe("DSAR intake — kapalı erasure türü + opak ref sözleşmesi", () => {
  it("serbest reason alanı göstermez; geçerli subjectRef ile kapalı türü kullanır", () => {
    renderPanel();
    const btn = screen.getByTestId("dsar-receive-button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.queryByTestId("dsar-reason-input")).toBeNull();
    expect(screen.getByTestId("dsar-request-type").textContent).toContain("Legal-DPO");
    fireEvent.change(screen.getByTestId("dsar-subject-input"), {
      target: { value: VALID_SUBJECT_REF },
    });
    expect(btn.disabled).toBe(false);
  });

  it("yaygın PII biçimlerini fetch öncesi fail-closed keser", () => {
    renderPanel();
    const subject = screen.getByTestId("dsar-subject-input");
    const btn = screen.getByTestId("dsar-receive-button") as HTMLButtonElement;

    fireEvent.change(subject, { target: { value: "candidate@example.com" } });
    expect(btn.disabled).toBe(true);
    expect(screen.getByText(/yalnız UUIDv4 veya subj-\/subject-/i)).toBeTruthy();

    fireEvent.change(subject, { target: { value: "11111111110" } });
    expect(btn.disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("UUIDv4 ile yalnız kapalı reasonCode'u gönderir ve extra alan üretmez", async () => {
    renderPanel();
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { dsarKey: "iv-1/dsar-uuid" }));
    fireEvent.change(screen.getByTestId("dsar-subject-input"), {
      target: { value: VALID_SUBJECT_REF },
    });
    fireEvent.click(screen.getByTestId("dsar-receive-button"));
    await screen.findByTestId("dsar-key");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      subjectRef: "550e8400-e29b-41d4-a716-446655440000",
      reasonCode: "DATA_SUBJECT_ERASURE",
    });
  });
});

describe("erasure — iki-adımlı yıkıcı onay", () => {
  async function intake() {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { dsarKey: "iv-1/dsar-x" }));
    fireEvent.change(screen.getByTestId("dsar-subject-input"), {
      target: { value: VALID_SUBJECT_REF },
    });
    fireEvent.click(screen.getByTestId("dsar-receive-button"));
    await screen.findByTestId("dsar-key");
  }

  it("ilk tık SİLMEZ: fetch çağrılmaz, uyarı görünür, buton onay metnine döner", async () => {
    renderPanel();
    await intake();
    expect(fetchMock).toHaveBeenCalledTimes(1); // yalnız intake

    fireEvent.click(screen.getByTestId("dsar-erase-button"));
    expect(fetchMock).toHaveBeenCalledTimes(1); // erasure ÇAĞRILMADI
    const warning = screen.getByTestId("dsar-erase-warning");
    const button = screen.getByTestId("dsar-erase-button");
    expect(warning.textContent).toContain("YIKICI");
    expect(button.textContent).toContain("Eminim");
    expect(document.activeElement).toBe(warning);
    expect(button.getAttribute("aria-describedby")).toBe("dsar-erase-warning");
  });

  it("ikinci tık yalnız dsarKey gönderir ve onErased receipt alır", async () => {
    const onErased = renderPanel();
    await intake();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {
      dsarKey: "iv-1/dsar-x", tombstoneCount: 0, deletedContentCount: 1,
      objectDeleteIssuedCount: 1, caseTransitioned: false, replayed: false,
    }));
    fireEvent.click(screen.getByTestId("dsar-erase-button")); // 1. tık: onay modu
    fireEvent.click(screen.getByTestId("dsar-erase-button")); // 2. tık: yürüt
    await vi.waitFor(() => expect(onErased).toHaveBeenCalledTimes(1));

    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({ dsarKey: "iv-1/dsar-x" });
    expect(Object.keys(body)).toEqual(["dsarKey"]); // caller scope/target kesinlikle yok
    expect(onErased.mock.calls[0][0].deletedContentCount).toBe(1);
    expect(onErased.mock.calls[0][0].objectDeleteIssuedCount).toBe(1);
    expect(onErased.mock.calls[0][0].replayed).toBe(false);
  });

  it("confirm çift-click aynı tickte yalnız bir yıkıcı POST ve bir receipt üretir", async () => {
    const onErased = renderPanel();
    await intake();
    let resolveErasure!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => {
      resolveErasure = resolve;
    }));

    fireEvent.click(screen.getByTestId("dsar-erase-button"));
    await vi.waitFor(() => expect(screen.getByTestId("dsar-erase-button").textContent)
      .toContain("Eminim"));
    const confirmButton = screen.getByTestId("dsar-erase-button");
    // React disabled render'ı araya girmeden aynı tickte iki click üret:
    // in-flight ref ikinci yıkıcı çağrıyı senkron olarak kesmeli.
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2)); // intake + tek erasure POST

    resolveErasure(jsonResponse(200, {
      dsarKey: "iv-1/dsar-x", tombstoneCount: 1, deletedContentCount: 2,
      objectDeleteIssuedCount: 1, caseTransitioned: false, replayed: false,
    }));
    await vi.waitFor(() => expect(onErased).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("dsar-error")).toBeNull();
  });

  it("409 canlı lease durumunu salt-okunur status ile gösterir ve terminal receipt'i geri alır", async () => {
    const onErased = renderPanel();
    await intake();
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: "CONFLICT", reason: "execution başka canlı worker lease'inde",
      }), { status: 409, headers: { "Content-Type": "application/json", "Retry-After": "12" } }))
      .mockResolvedValueOnce(jsonResponse(200, {
        dsarKey: "iv-1/dsar-x", state: "RUNNING", completedStepCount: 3,
        totalStepCount: 8, retryAfterSeconds: 1,
      }, { "Retry-After": "1" }));

    fireEvent.click(screen.getByTestId("dsar-erase-button"));
    fireEvent.click(screen.getByTestId("dsar-erase-button"));
    const progress = await screen.findByTestId("dsar-progress");
    expect(progress.textContent).toContain("3/8");
    expect(fetchMock).toHaveBeenCalledTimes(3); // intake + POST + GET status
    expect(onErased).not.toHaveBeenCalled();
    expect((screen.getByTestId("dsar-erase-button") as HTMLButtonElement).disabled).toBe(true);
    const reconcile = screen.getByTestId("dsar-reconcile-button") as HTMLButtonElement;
    expect(reconcile.disabled).toBe(true);
    fireEvent.click(reconcile);
    expect(fetchMock).toHaveBeenCalledTimes(3); // Retry-After dolmadan GET yok
    await vi.waitFor(() => expect(reconcile.disabled).toBe(false), { timeout: 1_500 });

    fetchMock.mockResolvedValueOnce(jsonResponse(200, {
      dsarKey: "iv-1/dsar-x", state: "FULFILLED", completedStepCount: 8,
      totalStepCount: 8, retryAfterSeconds: 0,
      receipt: {
        dsarKey: "iv-1/dsar-x", tombstoneCount: 2, deletedContentCount: 4,
        objectDeleteIssuedCount: 1, caseTransitioned: true,
      },
    }));
    fireEvent.click(reconcile);
    await vi.waitFor(() => expect(onErased).toHaveBeenCalledTimes(1));
    expect(onErased.mock.calls[0][0].replayed).toBe(true);
  });

  it("Retry-After taşımayan 409'u lease sanıp status oracle'ına dönüştürmez", async () => {
    const onErased = renderPanel();
    await intake();
    fetchMock.mockResolvedValueOnce(jsonResponse(409, {
      error: "CONFLICT", reason: "execution farklı tür ile bağlı",
    }));

    fireEvent.click(screen.getByTestId("dsar-erase-button"));
    fireEvent.click(screen.getByTestId("dsar-erase-button"));
    const error = await screen.findByTestId("dsar-error");
    expect(error.textContent).toContain("farklı tür");
    expect(fetchMock).toHaveBeenCalledTimes(2); // intake + POST; recovery GET yok
    expect(screen.queryByTestId("dsar-progress")).toBeNull();
    expect(onErased).not.toHaveBeenCalled();
  });

  it("POST replay body/header birbiriyle çelişirse makbuzu fail-closed reddeder", async () => {
    const onErased = renderPanel();
    await intake();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {
      dsarKey: "iv-1/dsar-x", tombstoneCount: 1, deletedContentCount: 2,
      objectDeleteIssuedCount: 1, caseTransitioned: false, replayed: false,
    }, { "X-ATS-Replay": "true" }));

    fireEvent.click(screen.getByTestId("dsar-erase-button"));
    fireEvent.click(screen.getByTestId("dsar-erase-button"));
    const error = await screen.findByTestId("dsar-error");
    expect(error.textContent).toContain("tutarsız");
    expect(onErased).not.toHaveBeenCalled();
  });

  it("POST network cevabı kaybolursa terminal receipt'i GET ile yan etkisiz reconcile eder", async () => {
    const onErased = renderPanel();
    await intake();
    fetchMock
      .mockRejectedValueOnce(new TypeError("network drop after commit"))
      .mockResolvedValueOnce(jsonResponse(200, {
        dsarKey: "iv-1/dsar-x", state: "FULFILLED", completedStepCount: 8,
        totalStepCount: 8, retryAfterSeconds: 0,
        receipt: {
          dsarKey: "iv-1/dsar-x", tombstoneCount: 2, deletedContentCount: 4,
          objectDeleteIssuedCount: 1, caseTransitioned: false,
        },
      }));

    fireEvent.click(screen.getByTestId("dsar-erase-button"));
    fireEvent.click(screen.getByTestId("dsar-erase-button"));
    await vi.waitFor(() => expect(onErased).toHaveBeenCalledTimes(1));
    expect(onErased.mock.calls[0][0].replayed).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3); // intake + belirsiz POST + GET status
  });
});
