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

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderPanel(onErased = vi.fn()) {
  render(<DsarPanel token="t" interviewId="iv-1" transcriptKey="iv-1/tr-1" onErased={onErased} />);
  return onErased;
}

describe("DSAR intake — reason zorunlu (backend sözleşmesi)", () => {
  it("subjectRef dolu ama reason boşken buton disabled; reason girilince enabled", () => {
    renderPanel();
    const btn = screen.getByTestId("dsar-receive-button") as HTMLButtonElement;
    fireEvent.change(screen.getByTestId("dsar-subject-input"), { target: { value: "subj-1" } });
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("dsar-reason-input"), { target: { value: "kvkk-madde-7" } });
    expect(btn.disabled).toBe(false);
  });
});

describe("erasure — iki-adımlı yıkıcı onay", () => {
  async function intake() {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { dsarKey: "iv-1/dsar-x" }));
    fireEvent.change(screen.getByTestId("dsar-subject-input"), { target: { value: "subj-1" } });
    fireEvent.change(screen.getByTestId("dsar-reason-input"), { target: { value: "kvkk-madde-7" } });
    fireEvent.click(screen.getByTestId("dsar-receive-button"));
    await screen.findByTestId("dsar-key");
  }

  it("ilk tık SİLMEZ: fetch çağrılmaz, uyarı görünür, buton onay metnine döner", async () => {
    renderPanel();
    await intake();
    expect(fetchMock).toHaveBeenCalledTimes(1); // yalnız intake

    fireEvent.click(screen.getByTestId("dsar-erase-button"));
    expect(fetchMock).toHaveBeenCalledTimes(1); // erasure ÇAĞRILMADI
    expect(screen.getByTestId("dsar-erase-warning").textContent).toContain("YIKICI");
    expect(screen.getByTestId("dsar-erase-button").textContent).toContain("Eminim");
  });

  it("ikinci tık yürütür: scope yalnız görüntülenen transkript + onErased receipt alır", async () => {
    const onErased = renderPanel();
    await intake();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {
      dsarKey: "iv-1/dsar-x", tombstoneCount: 0, deletedContentCount: 1, caseTransitioned: false,
    }));
    fireEvent.click(screen.getByTestId("dsar-erase-button")); // 1. tık: onay modu
    fireEvent.click(screen.getByTestId("dsar-erase-button")); // 2. tık: yürüt
    await vi.waitFor(() => expect(onErased).toHaveBeenCalledTimes(1));

    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.scope.transcriptKeys).toEqual(["iv-1/tr-1"]);
    expect(body.scope.tombstoneTargetEvidenceIds).toEqual([]); // bu ekran hedefli tombstone üretmez
    expect(onErased.mock.calls[0][0].deletedContentCount).toBe(1);
  });
});
