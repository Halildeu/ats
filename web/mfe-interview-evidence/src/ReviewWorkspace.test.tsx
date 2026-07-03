// @vitest-environment jsdom
/**
 * ReviewWorkspace davranış testleri — Codex #74/#79 blocker'larının KALICI
 * regression guard'ları: kanıt-kapısı (NOT_SUPPORTED karar-yoluna giremez) +
 * resume state-completeness (AI_SUGGESTED için START; FINALIZED için export).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewWorkspace } from "./ReviewWorkspace";

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

function renderWs() {
  render(<ReviewWorkspace token="t" interviewId="iv-1" transcriptKey="iv-1/tr-1" />);
}

async function cite(entailment: string, resolvedRefCount: number) {
  fetchMock.mockResolvedValueOnce(jsonResponse(201, {
    evidenceId: "ev-1", resolvedRefCount, entailment, citationKey: "iv-1/cit-1",
  }));
  fireEvent.change(screen.getByTestId("claim-input"), { target: { value: "iddia" } });
  fireEvent.click(screen.getByTestId("cite-button"));
  await screen.findByTestId("citation-result");
}

describe("kanıt-kapısı (F7 invariant'larıyla hizalı)", () => {
  it("NOT_SUPPORTED: uyarı görünür, vaka-açma YOK (karar kanıtı olamaz)", async () => {
    renderWs();
    await cite("NOT_SUPPORTED", 0);
    expect(screen.getByTestId("not-decision-evidence")).toBeTruthy();
    expect(screen.queryByTestId("open-case-button")).toBeNull();
  });

  it("SUPPORTED + kaynaklı: vaka-açma butonu VAR", async () => {
    renderWs();
    await cite("SUPPORTED", 1);
    expect(screen.queryByTestId("not-decision-evidence")).toBeNull();
    expect(screen.getByTestId("open-case-button")).toBeTruthy();
  });
});

describe("resume state-completeness", () => {
  async function resumeCase(state: string, sourceEvidenceRefs: string[]) {
    // 1) liste  2) seçilen vakanın detayı
    fetchMock.mockResolvedValueOnce(jsonResponse(200, [{ caseKey: "iv-1/case-1", state }]));
    fireEvent.click(screen.getByTestId("case-list-button"));
    const row = await screen.findByTestId("case-row");
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { state, sourceEvidenceRefs }));
    fireEvent.click(row);
    await screen.findByTestId("case-state");
  }

  it("AI_SUGGESTED satırı: START yolu render edilir (dead-end yok)", async () => {
    renderWs();
    await resumeCase("AI_SUGGESTED", ["iv-1/cit-1"]);
    expect(screen.getByTestId("case-state").textContent).toBe("AI_SUGGESTED");
    expect(screen.getByTestId("start-button")).toBeTruthy();
  });

  it("FINALIZED satırı: export formu resumedRefs'ten açılır ve export ref'i ilk kaynağı kullanır", async () => {
    renderWs();
    await resumeCase("FINALIZED", ["iv-1/cit-9"]);
    expect(screen.getByTestId("export-button")).toBeTruthy();

    fetchMock.mockResolvedValueOnce(jsonResponse(201, {
      artifactKey: "iv-1/exp-1", evidenceId: "ev-9", packetDigest: "d".repeat(64), claimCount: 1,
    }));
    // finalize-sonrası state yenilemesi (refreshState) — export akışındaki GET
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { state: "EXPORTED", sourceEvidenceRefs: ["iv-1/cit-9"] }));
    fireEvent.change(screen.getByTestId("jobrel-input"), { target: { value: "jr-1" } });
    fireEvent.click(screen.getByTestId("export-button"));
    await screen.findByTestId("export-result");

    const exportCall = fetchMock.mock.calls.find(([u]) => String(u).includes("/export"));
    expect(exportCall).toBeTruthy();
    const body = JSON.parse(String((exportCall![1] as RequestInit).body));
    expect(JSON.stringify(body)).toContain("iv-1/cit-9"); // citationKey resumedRefs[0]'dan
  });

  it("HUMAN_REVIEWING satırı: üç insan yolu render edilir", async () => {
    renderWs();
    await resumeCase("HUMAN_REVIEWING", ["iv-1/cit-1"]);
    expect(screen.getByTestId("no-change-button")).toBeTruthy();
    expect(screen.getByTestId("edit-input")).toBeTruthy();
    expect(screen.getByTestId("reject-input")).toBeTruthy();
  });
});
