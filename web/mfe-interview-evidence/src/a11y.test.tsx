// @vitest-environment jsdom
/**
 * a11y smoke — ATS-0011 (WCAG 2.2 AA) DOM-level makine denetimi: ana UI
 * yüzeyleri axe-core'dan İHLALSİZ geçer. DÜRÜST SINIR: color-contrast kuralı
 * jsdom'da hesaplanamaz (layout/canvas yok) ve kapalıdır — kontrast zaten
 * scripts/check-web-foundation.mjs'te token-level HESAPLANIR (çift değil,
 * tamamlayıcı katman). Bu test tek-seferlik smoke değil, CI'da sürekli guard.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { ConsentRecordingPanel } from "./ConsentRecordingPanel";
import { DsarPanel } from "./DsarPanel";
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

async function expectNoViolations(container: Element) {
  const results = await axe.run(container, {
    rules: {
      // jsdom sınırı: layout/render olmadan kontrast hesaplanamaz —
      // kontrast token-level check-web-foundation.mjs'te makine-denetimli.
      "color-contrast": { enabled: false },
    },
  });
  const summary = results.violations
      .map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)
      .join("\n");
  expect(results.violations, summary).toEqual([]);
}

describe("a11y smoke (axe-core; color-contrast hariç — jsdom sınırı)", () => {
  it("App — dev-paste giriş formu ihlalsiz", async () => {
    const { container } = render(<App />);
    await expectNoViolations(container);
  });

  it("ConsentRecordingPanel — rıza + yükleme yüzeyi ihlalsiz", async () => {
    const { container } = render(<ConsentRecordingPanel token="t" interviewId="iv-1" onTranscribed={() => {}} />);
    await expectNoViolations(container);
  });

  it("DsarPanel — intake + onay-modu uyarısı ihlalsiz", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ dsarKey: "iv-1/dsar-1" }),
        { status: 201, headers: { "Content-Type": "application/json" } }));
    const { container } = render(
        <DsarPanel token="t" interviewId="iv-1" onErased={() => {}} />);
    fireEvent.change(screen.getByTestId("dsar-subject-input"), {
      target: { value: "550e8400-e29b-41d4-a716-446655440000" },
    });
    fireEvent.click(screen.getByTestId("dsar-receive-button"));
    await screen.findByTestId("dsar-key");
    fireEvent.click(screen.getByTestId("dsar-erase-button")); // onay modu: role=alert uyarı görünür
    const warning = screen.getByTestId("dsar-erase-warning");
    expect(document.activeElement).toBe(warning);
    expect(screen.getByTestId("dsar-erase-button").getAttribute("aria-describedby"))
      .toBe("dsar-erase-warning");
    await expectNoViolations(container);
  });

  it("SELF-TEST (negatif): kasıtlı ihlalli DOM'u axe YAKALAR — guard dişli", async () => {
    // label'sız form input + alt'sız img: WCAG ihlali; axe bunları bulamıyorsa
    // yukarıdaki "ihlalsiz" iddiaları anlamsızdır (fail-closed self-test).
    const bad = document.createElement("div");
    bad.innerHTML = '<form><input type="text" /></form><img src="x.png" />';
    document.body.appendChild(bad);
    const results = await axe.run(bad);
    bad.remove();
    expect(results.violations.length).toBeGreaterThan(0);
    expect(results.violations.map((v) => v.id)).toContain("image-alt");
  });

  it("ReviewWorkspace — citation + insan-yolları yüzeyi ihlalsiz", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      evidenceId: "ev-1", resolvedRefCount: 1, entailment: "SUPPORTED", citationKey: "iv-1/cit-1",
    }), { status: 201, headers: { "Content-Type": "application/json" } }));
    const { container } = render(
        <ReviewWorkspace token="t" interviewId="iv-1" transcriptKey="iv-1/tr-1" />);
    fireEvent.change(screen.getByTestId("claim-input"), { target: { value: "iddia" } });
    fireEvent.click(screen.getByTestId("cite-button"));
    await screen.findByTestId("citation-result");
    await expectNoViolations(container);
  });
});
