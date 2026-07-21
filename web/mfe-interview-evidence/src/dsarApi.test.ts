import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DATA_SUBJECT_ERASURE_REASON,
  executeErasure,
  fetchErasureStatus,
  isValidDsarSubjectRef,
  receiveDsar,
  reconcileErasure,
} from "./dsarApi";

const fetchMock = vi.fn();
const VALID_SUBJECT_REF = "550e8400-e29b-41d4-a716-446655440000";

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(
  body: unknown,
  headers: Record<string, string> = {},
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    dsarKey: "iv-1/dsar-x",
    tombstoneCount: 1,
    deletedContentCount: 2,
    objectDeleteIssuedCount: 1,
    caseTransitioned: false,
    ...overrides,
  };
}

describe("DSAR runtime response contract", () => {
  it("generated UUIDv4/prefix contract'ını consumer düzeyinde uygular", () => {
    expect(isValidDsarSubjectRef(VALID_SUBJECT_REF)).toBe(true);
    expect(isValidDsarSubjectRef(`subject:${VALID_SUBJECT_REF}`)).toBe(true);
    expect(isValidDsarSubjectRef("550e8400-e29b-51d4-a716-446655440000")).toBe(false);
    expect(isValidDsarSubjectRef("550e8400-e29b-41d4-7716-446655440000")).toBe(false);
    expect(isValidDsarSubjectRef(`${VALID_SUBJECT_REF}\n`)).toBe(false);
  });

  it("intake response'u exact ve non-empty dsarKey ile bağlar", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ dsarKey: "iv-1/dsar-x" }, {}, 201));
    await expect(receiveDsar("t", "iv-1", VALID_SUBJECT_REF, DATA_SUBJECT_ERASURE_REASON))
      .resolves.toBe("iv-1/dsar-x");

    fetchMock.mockResolvedValueOnce(jsonResponse({ dsarKey: "", extra: true }, {}, 201));
    await expect(receiveDsar("t", "iv-1", VALID_SUBJECT_REF, DATA_SUBJECT_ERASURE_REASON))
      .rejects.toThrow("response sözleşmesi geçersiz");
  });

  it("serbest reasonCode veya PII-biçimli subjectRef için fetch üretmez", async () => {
    await expect(receiveDsar("t", "iv-1", VALID_SUBJECT_REF, "kvkk-madde-7"))
      .rejects.toThrow("response sözleşmesi geçersiz");
    await expect(receiveDsar(
      "t", "iv-1", "candidate@example.com", DATA_SUBJECT_ERASURE_REASON,
    )).rejects.toThrow("response sözleşmesi geçersiz");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POST receipt'i istenen dsarKey ve non-negative integer sayaçlarla bağlar", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(
      { ...receipt(), replayed: false },
      { "X-ATS-Replay": "false" },
    ));
    await expect(executeErasure("t", "iv-1", "iv-1/dsar-x")).resolves.toMatchObject({
      dsarKey: "iv-1/dsar-x",
      deletedContentCount: 2,
      replayed: false,
    });

    fetchMock.mockResolvedValueOnce(jsonResponse(
      { ...receipt({ dsarKey: "iv-2/dsar-other" }), replayed: false },
      { "X-ATS-Replay": "false" },
    ));
    await expect(executeErasure("t", "iv-1", "iv-1/dsar-x"))
      .rejects.toThrow("receipt dsarKey istek ile eşleşmiyor");
  });

  it.each([
    ["negative", { deletedContentCount: -1 }],
    ["fractional", { tombstoneCount: 0.5 }],
    ["wrong boolean", { caseTransitioned: "false" }],
    ["unknown field", { unexpected: "value" }],
  ])("POST receipt %s bozukluğunu fail-closed reddeder", async (_label, invalid) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(
      { ...receipt(invalid), replayed: false },
      { "X-ATS-Replay": "false" },
    ));
    await expect(executeErasure("t", "iv-1", "iv-1/dsar-x"))
      .rejects.toThrow("response sözleşmesi geçersiz");
  });

  it("replay header'ı malformed veya body ile çelişkiliyse reddeder", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(
      { ...receipt(), replayed: false },
      { "X-ATS-Replay": "FALSE" },
    ));
    await expect(executeErasure("t", "iv-1", "iv-1/dsar-x"))
      .rejects.toThrow("X-ATS-Replay header true veya false olmalı");

    fetchMock.mockResolvedValueOnce(jsonResponse(
      { ...receipt(), replayed: false },
      { "X-ATS-Replay": "true" },
    ));
    await expect(executeErasure("t", "iv-1", "iv-1/dsar-x"))
      .rejects.toThrow("body/header arasında tutarsız");

    fetchMock.mockResolvedValueOnce(jsonResponse(
      receipt(),
      { "X-ATS-Replay": "false" },
    ));
    await expect(executeErasure("t", "iv-1", "iv-1/dsar-x"))
      .rejects.toThrow("execution receipt alanları eksik");
  });

  it("RUNNING status'u key, sayaç ve Retry-After header ile bağlar", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      dsarKey: "iv-1/dsar-x",
      state: "RUNNING",
      completedStepCount: 3,
      totalStepCount: 8,
      retryAfterSeconds: 7,
    }, { "Retry-After": "7" }));
    await expect(fetchErasureStatus("t", "iv-1", "iv-1/dsar-x")).resolves.toEqual({
      dsarKey: "iv-1/dsar-x",
      state: "RUNNING",
      completedStepCount: 3,
      totalStepCount: 8,
      retryAfterSeconds: 7,
    });
  });

  it.each([
    ["wrong key", { dsarKey: "iv-2/dsar-other" }, { "Retry-After": "7" }],
    ["count overflow", { completedStepCount: 9 }, { "Retry-After": "7" }],
    ["missing header", {}, {}],
    ["header mismatch", {}, { "Retry-After": "6" }],
    ["lease ceiling", { retryAfterSeconds: 31 }, { "Retry-After": "31" }],
    ["unknown field", { unexpected: true }, { "Retry-After": "7" }],
  ])("RUNNING status %s bozukluğunu reddeder", async (_label, override, headers) => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      dsarKey: "iv-1/dsar-x",
      state: "RUNNING",
      completedStepCount: 3,
      totalStepCount: 8,
      retryAfterSeconds: 7,
      ...override,
    }, headers));
    await expect(fetchErasureStatus("t", "iv-1", "iv-1/dsar-x"))
      .rejects.toThrow("response sözleşmesi geçersiz");
  });

  it("FULFILLED status'u terminal invariant ve iç receipt key'iyle bağlar", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      dsarKey: "iv-1/dsar-x",
      state: "FULFILLED",
      completedStepCount: 8,
      totalStepCount: 8,
      retryAfterSeconds: 0,
      receipt: receipt(),
    }));
    await expect(reconcileErasure("t", "iv-1", "iv-1/dsar-x")).resolves.toEqual({
      ...receipt(),
      replayed: true,
    });

    fetchMock.mockResolvedValueOnce(jsonResponse({
      dsarKey: "iv-1/dsar-x",
      state: "FULFILLED",
      completedStepCount: 7,
      totalStepCount: 8,
      retryAfterSeconds: 0,
      receipt: receipt(),
    }));
    await expect(reconcileErasure("t", "iv-1", "iv-1/dsar-x"))
      .rejects.toThrow("FULFILLED status tam adım");

    fetchMock.mockResolvedValueOnce(jsonResponse({
      dsarKey: "iv-1/dsar-x",
      state: "FULFILLED",
      completedStepCount: 8,
      totalStepCount: 8,
      retryAfterSeconds: 0,
      receipt: receipt({ dsarKey: "iv-2/dsar-other" }),
    }));
    await expect(reconcileErasure("t", "iv-1", "iv-1/dsar-x"))
      .rejects.toThrow("receipt dsarKey istek ile eşleşmiyor");
  });

  it("belirsiz POST sonrası malformed recovery kanıtını özgün ağ hatasının arkasına saklamaz", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("POST transport uncertain"))
      .mockResolvedValueOnce(jsonResponse({
        dsarKey: "iv-2/dsar-other",
        state: "FULFILLED",
        completedStepCount: 8,
        totalStepCount: 8,
        retryAfterSeconds: 0,
        receipt: receipt({ dsarKey: "iv-2/dsar-other" }),
      }));

    await expect(executeErasure("t", "iv-1", "iv-1/dsar-x"))
      .rejects.toThrow("status dsarKey istek ile eşleşmiyor");
  });
});
