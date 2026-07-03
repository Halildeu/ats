// @vitest-environment jsdom
/**
 * ConsentRecordingPanel davranış testleri — Codex #77 blocker'larının KALICI
 * regression guard'ları: ön-seçili state YOK (açık-rıza UX) + aydınlatma
 * beyandan önce görünür + idempotency-key başarıda yenilenir.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsentRecordingPanel } from "./ConsentRecordingPanel";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPanel() {
  render(<ConsentRecordingPanel token="t" interviewId="iv-1" />);
}

describe("açık-rıza UX", () => {
  it("aydınlatma + operatör-kaydı beyanı, kaydet aksiyonundan ÖNCE görünür", () => {
    renderPanel();
    const d = screen.getByTestId("consent-disclosure").textContent ?? "";
    expect(d).toContain("Aydınlatma");
    expect(d).toContain("operatör tarafından kaydıdır");
  });

  it("ÖN-SEÇİLİ state YOK: subjectRef doluyken bile state seçilmeden kaydet disabled", () => {
    renderPanel();
    const select = screen.getByTestId("consent-state-select") as HTMLSelectElement;
    const save = screen.getByTestId("consent-save-button") as HTMLButtonElement;
    expect(select.value).toBe("");
    fireEvent.change(screen.getByTestId("consent-subject-input"), { target: { value: "subj-1" } });
    expect(save.disabled).toBe(true);
    fireEvent.change(select, { target: { value: "GRANTED" } });
    expect(save.disabled).toBe(false);
  });

  it("kaydet: idempotency-key header'ı gider ve BAŞARIDA YENİLENİR (yeni beyan = yeni kanıt)", async () => {
    renderPanel();
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    fireEvent.change(screen.getByTestId("consent-subject-input"), { target: { value: "subj-1" } });
    fireEvent.change(screen.getByTestId("consent-state-select"), { target: { value: "GRANTED" } });
    fireEvent.click(screen.getByTestId("consent-save-button"));
    await screen.findByTestId("consent-saved");
    fireEvent.click(screen.getByTestId("consent-save-button"));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const key1 = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    const key2 = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
    expect(key1["X-ATS-Idempotency-Key"]).toBeTruthy();
    expect(key2["X-ATS-Idempotency-Key"]).toBeTruthy();
    expect(key1["X-ATS-Idempotency-Key"]).not.toBe(key2["X-ATS-Idempotency-Key"]);
  });
});

describe("kayıt yükleme", () => {
  it("dosya seçilmeden yükle disabled; upload isteği dosya Content-Type'ı + filename header'ı taşır", async () => {
    renderPanel();
    const uploadBtn = screen.getByTestId("upload-button") as HTMLButtonElement;
    expect(uploadBtn.disabled).toBe(true);

    const file = new File([new Uint8Array(64)], "kayit.wav", { type: "audio/wav" });
    fireEvent.change(screen.getByTestId("upload-file-input"), { target: { files: [file] } });
    expect(uploadBtn.disabled).toBe(false);

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(
        { objectKey: "obj/x", evidenceId: "ev-1", ledgerSequence: 7 }),
        { status: 201, headers: { "Content-Type": "application/json" } }));
    fireEvent.click(uploadBtn);
    await screen.findByTestId("upload-receipt");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/interviews/iv-1/recordings");
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("audio/wav");
    expect(headers["X-ATS-Filename"]).toBe("kayit.wav");
    expect(screen.getByTestId("upload-receipt").textContent).toContain("ev-1");
  });
});
