import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  OFFLINE_BUNDLE_SCHEMA_VERSION,
  OfflineBundleVerifier,
  type BundleEntryV1,
  type BundleFileV1,
  type BundleVerificationClock,
  type OfflineBundleReader,
  type OfflineSignatureVerificationInputV1,
  type OfflineSignatureVerificationReceiptV1,
  type OfflineSignatureVerifier,
  type ReleaseSubjectV1,
  type SubjectProvenanceV1,
  type SubjectSbomV1,
  type SubjectSignatureV1,
  type SyntheticOfflineBundleManifestV1,
} from "../release/offline-bundle-verifier.js";

const NOW = new Date("2026-07-13T00:00:00.000Z");
const bytes = (value: string): Uint8Array => Buffer.from(value, "utf8");
const digest = (value: Uint8Array): `sha256:${string}` =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

class FixedClock implements BundleVerificationClock {
  now(): Date {
    return new Date(NOW.getTime());
  }
}

class MemoryReader implements OfflineBundleReader {
  constructor(private readonly files: readonly BundleFileV1[]) {}
  list(): readonly BundleFileV1[] {
    return this.files;
  }
}

class SyntheticSignatureVerifier implements OfflineSignatureVerifier {
  constructor(
    private readonly mutate: (
      value: OfflineSignatureVerificationReceiptV1,
      input: OfflineSignatureVerificationInputV1,
    ) => OfflineSignatureVerificationReceiptV1 = (value) => value,
  ) {}

  verify(input: OfflineSignatureVerificationInputV1): OfflineSignatureVerificationReceiptV1 {
    return this.mutate(
      {
        tool: input.tool,
        subjectDigest: input.subjectDigest,
        expectedIdentityRef: input.expectedIdentityRef,
        trustRootRef: input.trustRootRef,
        revocationSnapshotRef: input.revocationSnapshotRef,
        signatureEnvelopeDigest: digest(input.signatureEnvelopeBytes),
        trustRootDigest: digest(input.trustRootBytes),
        revocationSnapshotDigest: digest(input.revocationSnapshotBytes),
        signatureVerified: true,
        identityMatched: true,
        revocationStatus: "GOOD",
        offline: true,
        networkAllowed: false,
        networkUsed: false,
      },
      input,
    );
  }
}

interface MutableManifest
  extends Omit<
    SyntheticOfflineBundleManifestV1,
    "releaseRef" | "entries" | "subjects" | "sboms" | "provenance" | "signatures" | "securityDisposition"
  > {
  releaseRef: string;
  entries: BundleEntryV1[];
  subjects: ReleaseSubjectV1[];
  sboms: SubjectSbomV1[];
  provenance: SubjectProvenanceV1[];
  signatures: SubjectSignatureV1[];
  securityDisposition: {
    critical: number;
    high: number;
    licensePolicyViolations: number;
    secretFindings: number;
  };
}

interface Fixture {
  files: BundleFileV1[];
  manifest: MutableManifest;
}

function fixture(): Fixture {
  const content: Record<string, Uint8Array> = {
    "images/ats.oci.tar": bytes("synthetic-oci-image-archive"),
    "models/stt.bin": bytes("synthetic-model-artifact"),
    "signatures/image.sig": bytes("synthetic-cosign-envelope"),
    "signatures/model.sig": bytes("synthetic-notation-envelope"),
    "trust/root.json": bytes('{"syntheticTrustRoot":true}'),
    "trust/revocation.json": bytes('{"status":"GOOD"}'),
  };
  const imageSubject = `sha256:${"a".repeat(64)}` as const;
  const modelSubject = `sha256:${"b".repeat(64)}` as const;
  content["sbom/image.cdx.json"] = bytes(
    JSON.stringify({
      bomFormat: "CycloneDX",
      specVersion: "1.6",
      metadata: {
        component: {
          hashes: [{ alg: "SHA-256", content: imageSubject.slice(7) }],
        },
      },
    }),
  );
  content["sbom/model.spdx.json"] = bytes(
    JSON.stringify({
      spdxVersion: "SPDX-2.3",
      packages: [
        {
          checksums: [
            { algorithm: "SHA256", checksumValue: modelSubject.slice(7) },
          ],
        },
      ],
    }),
  );
  content["provenance/release.intoto.json"] = bytes(
    JSON.stringify({
      _type: "https://in-toto.io/Statement/v1",
      predicateType: "https://slsa.dev/provenance/v1",
      subject: [
        { digest: { sha256: imageSubject.slice(7) } },
        { digest: { sha256: modelSubject.slice(7) } },
      ],
    }),
  );
  content["checksums/sha256.txt"] = bytes(
    `${Object.entries(content)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, value]) => `${digest(value).slice(7)}  ${path}`)
      .join("\n")}\n`,
  );
  const kindByPath: Record<string, BundleEntryV1["kind"]> = {
    "images/ats.oci.tar": "OCI_IMAGE_ARCHIVE",
    "models/stt.bin": "MODEL_ARTIFACT",
    "sbom/image.cdx.json": "SBOM",
    "sbom/model.spdx.json": "SBOM",
    "provenance/release.intoto.json": "PROVENANCE",
    "signatures/image.sig": "SIGNATURE_ENVELOPE",
    "signatures/model.sig": "SIGNATURE_ENVELOPE",
    "trust/root.json": "TRUST_ROOT",
    "trust/revocation.json": "REVOCATION_SNAPSHOT",
    "checksums/sha256.txt": "CHECKSUM_MANIFEST",
  };
  const entries = Object.entries(content).map(([path, value]) => ({
    path,
    kind: kindByPath[path]!,
    digest: digest(value),
    sizeBytes: value.byteLength,
    mediaType: "application/vnd.ats.synthetic",
  }));
  return {
    files: Object.entries(content).map(([path, value]) => ({
      path,
      type: "FILE",
      bytes: value,
    })),
    manifest: {
      schemaVersion: OFFLINE_BUNDLE_SCHEMA_VERSION,
      synthetic: true,
      releaseRef: "ats-release:2026.07.0",
      generatedAt: "2026-07-12T23:00:00.000Z",
      checksumManifestPath: "checksums/sha256.txt",
      entries,
      subjects: [
        {
          kind: "OCI_IMAGE",
          name: "ats-api",
          artifactPath: "images/ats.oci.tar",
          artifactDigest: digest(content["images/ats.oci.tar"]!),
          immutableSubjectDigest: imageSubject,
        },
        {
          kind: "MODEL",
          name: "stt-tr-v1",
          artifactPath: "models/stt.bin",
          artifactDigest: digest(content["models/stt.bin"]!),
          immutableSubjectDigest: modelSubject,
        },
      ],
      sboms: [
        {
          subjectDigest: imageSubject,
          path: "sbom/image.cdx.json",
          format: "CYCLONEDX_1_6",
        },
        {
          subjectDigest: modelSubject,
          path: "sbom/model.spdx.json",
          format: "SPDX_2_3",
        },
      ],
      provenance: [
        {
          path: "provenance/release.intoto.json",
          predicateType: "SLSA_PROVENANCE_V1",
          subjectDigests: [imageSubject, modelSubject],
          builderRef: "builder.synthetic.isolated",
          sourceRepoRef: "github.com/Halildeu/ats",
          sourceCommit: "a1b2c3d4e5f6",
        },
      ],
      signatures: [
        signature(imageSubject, "COSIGN", "signatures/image.sig"),
        signature(modelSubject, "NOTATION", "signatures/model.sig"),
      ],
      securityDisposition: {
        critical: 0,
        high: 0,
        licensePolicyViolations: 0,
        secretFindings: 0,
      },
    },
  };
}

function signature(
  subjectDigest: `sha256:${string}`,
  tool: "COSIGN" | "NOTATION",
  envelopePath: string,
): SubjectSignatureV1 {
  return {
    subjectDigest,
    tool,
    envelopePath,
    expectedIdentityRef: "identity.synthetic.release-signer",
    trustRootPath: "trust/root.json",
    trustRootRef: "trust.synthetic.root.v1",
    trustRootGeneratedAt: "2026-07-12T00:00:00.000Z",
    revocationSnapshotPath: "trust/revocation.json",
    revocationSnapshotRef: "revocation.synthetic.2026-07-12",
    revocationSnapshotGeneratedAt: "2026-07-12T23:30:00.000Z",
  };
}

function refreshChecksums(value: Fixture): void {
  const checksumPath = value.manifest.checksumManifestPath;
  const checksumBytes = bytes(
    `${value.manifest.entries
      .filter((entry) => entry.path !== checksumPath)
      .sort((left, right) => left.path.localeCompare(right.path))
      .map((entry) => `${entry.digest.slice(7)}  ${entry.path}`)
      .join("\n")}\n`,
  );
  const fileIndex = value.files.findIndex((item) => item.path === checksumPath);
  const entryIndex = value.manifest.entries.findIndex(
    (item) => item.path === checksumPath,
  );
  value.files[fileIndex] = { ...value.files[fileIndex]!, bytes: checksumBytes };
  value.manifest.entries[entryIndex] = {
    ...value.manifest.entries[entryIndex]!,
    digest: digest(checksumBytes),
    sizeBytes: checksumBytes.byteLength,
  };
}

function replaceFile(value: Fixture, path: string, content: Uint8Array): void {
  const fileIndex = value.files.findIndex((item) => item.path === path);
  const entryIndex = value.manifest.entries.findIndex((item) => item.path === path);
  value.files[fileIndex] = { ...value.files[fileIndex]!, bytes: content };
  value.manifest.entries[entryIndex] = {
    ...value.manifest.entries[entryIndex]!,
    digest: digest(content),
    sizeBytes: content.byteLength,
  };
  refreshChecksums(value);
}

function replaceChecksumFile(value: Fixture, content: Uint8Array): void {
  const path = value.manifest.checksumManifestPath;
  const fileIndex = value.files.findIndex((item) => item.path === path);
  const entryIndex = value.manifest.entries.findIndex((item) => item.path === path);
  value.files[fileIndex] = { ...value.files[fileIndex]!, bytes: content };
  value.manifest.entries[entryIndex] = {
    ...value.manifest.entries[entryIndex]!,
    digest: digest(content),
    sizeBytes: content.byteLength,
  };
}

function verifier(
  overrides: Partial<ConstructorParameters<typeof OfflineBundleVerifier>[1]> = {},
): OfflineBundleVerifier {
  return new OfflineBundleVerifier(new FixedClock(), {
    maxFileCount: 100,
    maxFileSizeBytes: 1_000_000,
    maxTotalSizeBytes: 10_000_000,
    maxTrustRootAgeSeconds: 172_800,
    maxRevocationAgeSeconds: 86_400,
    ...overrides,
  });
}

function verify(
  value: Fixture,
  signatureVerifier: OfflineSignatureVerifier = new SyntheticSignatureVerifier(),
) {
  return verifier().verify(
    value.manifest as SyntheticOfflineBundleManifestV1,
    new MemoryReader(value.files),
    signatureVerifier,
  );
}

describe("P5.2 offline bundle verifier", () => {
  it("verifies exact synthetic closure without a deploy-ready claim", () => {
    const receipt = verify(fixture());
    expect(receipt).toMatchObject({
      disposition: "SYNTHETIC_BUNDLE_CONSISTENT",
      inventoryClosed: true,
      allDigestsMatch: true,
      sbomCoverageComplete: true,
      provenanceCoverageComplete: true,
      signatureCoverageComplete: true,
      networkAllowed: false,
      networkUsed: false,
      deployReadyClaim: false,
      fileCount: 10,
      subjectCount: 2,
    });
    expect(JSON.stringify(receipt)).not.toMatch(/DEPLOY_READY|PRODUCTION_READY|CERTIFIED/);
  });

  it("is deterministic for identical manifest and bytes", () => {
    const value = fixture();
    expect(verify(value)).toEqual(verify(value));
  });

  it("canonicalizes provenance subject order in the manifest digest", () => {
    const first = fixture();
    const second = fixture();
    second.manifest.provenance[0] = {
      ...second.manifest.provenance[0]!,
      subjectDigests: [...second.manifest.provenance[0]!.subjectDigests].reverse(),
    };
    expect(verify(second).manifestDigest).toBe(verify(first).manifestDigest);
  });

  it.each([
    "../../etc/passwd",
    "foo/../../../bar",
    "foo/./bar",
    "foo\u0000bar",
    "/absolute/file",
    "windows\\path",
  ])("rejects unsafe path %j", (path) => {
    const value = fixture();
    value.manifest.entries[0] = { ...value.manifest.entries[0]!, path };
    expect(() => verify(value)).toThrow("UNSAFE_PATH");
  });

  it("rejects symlinks and duplicate bundle paths", () => {
    const link = fixture();
    link.files[0] = { ...link.files[0]!, type: "SYMLINK" };
    expect(() => verify(link)).toThrow("SYMLINK_FORBIDDEN");

    const duplicate = fixture();
    duplicate.files.push(duplicate.files[0]!);
    expect(() => verify(duplicate)).toThrow("BUNDLE_PATH_DUPLICATE");
  });

  it("rejects missing and phantom inventory files", () => {
    const missing = fixture();
    missing.files.pop();
    expect(() => verify(missing)).toThrow("INVENTORY_MISSING_FILE");

    const extra = fixture();
    extra.files.push({ path: "extra/file.txt", type: "FILE", bytes: bytes("extra") });
    expect(() => verify(extra)).toThrow("INVENTORY_EXTRA_FILE");
  });

  it("rejects size mismatch and one-byte digest corruption", () => {
    const size = fixture();
    size.files[0] = { ...size.files[0]!, bytes: bytes("synthetic-oci-image-archive!") };
    expect(() => verify(size)).toThrow("SIZE_MISMATCH");

    const changed = fixture();
    const sameSize = Buffer.from(changed.files[0]!.bytes);
    sameSize[0] = sameSize[0]! ^ 1;
    changed.files[0] = { ...changed.files[0]!, bytes: sameSize };
    expect(() => verify(changed)).toThrow("DIGEST_MISMATCH");
  });

  it("rejects incomplete SBOM, provenance and signature coverage", () => {
    const sbom = fixture();
    sbom.manifest.sboms.pop();
    expect(() => verify(sbom)).toThrow("SBOM_SUBJECT_UNCOVERED");

    const provenance = fixture();
    provenance.manifest.provenance[0] = {
      ...provenance.manifest.provenance[0]!,
      subjectDigests: [provenance.manifest.subjects[0]!.immutableSubjectDigest],
    };
    replaceFile(
      provenance,
      "provenance/release.intoto.json",
      bytes(
        JSON.stringify({
          _type: "https://in-toto.io/Statement/v1",
          predicateType: "https://slsa.dev/provenance/v1",
          subject: [
            {
              digest: {
                sha256: provenance.manifest.subjects[0]!.immutableSubjectDigest.slice(7),
              },
            },
          ],
        }),
      ),
    );
    expect(() => verify(provenance)).toThrow("PROVENANCE_SUBJECT_UNCOVERED");

    const signed = fixture();
    signed.manifest.signatures.pop();
    expect(() => verify(signed)).toThrow("SIGNATURE_SUBJECT_UNCOVERED");
  });

  it.each([
    ["sbom/model.spdx.json", { spdxVersion: "SPDX-2.2" }],
    ["sbom/image.cdx.json", { bomFormat: "CycloneDX", specVersion: "1.5" }],
  ] as const)("rejects unsupported SBOM at %s", (path, badContent) => {
    const value = fixture();
    const changed = bytes(JSON.stringify(badContent));
    replaceFile(value, path, changed);
    expect(() => verify(value)).toThrow("SBOM_VERSION_UNSUPPORTED");
  });

  it("binds SBOM and provenance content to manifest subjects", () => {
    const sbom = fixture();
    replaceFile(
      sbom,
      "sbom/image.cdx.json",
      bytes(
        JSON.stringify({
          bomFormat: "CycloneDX",
          specVersion: "1.6",
          metadata: {
            component: {
              hashes: [{ alg: "SHA-256", content: "f".repeat(64) }],
            },
          },
        }),
      ),
    );
    expect(() => verify(sbom)).toThrow("SBOM_SUBJECT_MISMATCH");

    const provenance = fixture();
    replaceFile(
      provenance,
      "provenance/release.intoto.json",
      bytes(
        JSON.stringify({
          _type: "https://in-toto.io/Statement/v1",
          predicateType: "https://slsa.dev/provenance/v1",
          subject: [{ digest: { sha256: "f".repeat(64) } }],
        }),
      ),
    );
    expect(() => verify(provenance)).toThrow(
      "PROVENANCE_CONTENT_SUBJECT_MISMATCH",
    );
  });

  it("rejects malformed or mismatched checksum manifest content", () => {
    const malformed = fixture();
    replaceChecksumFile(malformed, bytes("not-a-checksum\n"));
    expect(() => verify(malformed)).toThrow("CHECKSUM_MANIFEST_INVALID");

    const mismatch = fixture();
    const checksumPath = mismatch.manifest.checksumManifestPath;
    const changed = Buffer.from(
      mismatch.files.find((item) => item.path === checksumPath)!.bytes,
    )
      .toString("utf8")
      .replace(/^[a-f0-9]{64}/, "f".repeat(64));
    replaceChecksumFile(mismatch, bytes(changed));
    expect(() => verify(mismatch)).toThrow("CHECKSUM_MISMATCH");

    const selfReference = fixture();
    replaceChecksumFile(
      selfReference,
      bytes(`${"f".repeat(64)}  checksums/sha256.txt\n`),
    );
    expect(() => verify(selfReference)).toThrow(
      "CHECKSUM_SELF_REFERENCE_FORBIDDEN",
    );
  });

  it("rejects invalid SBOM and provenance JSON", () => {
    const sbom = fixture();
    replaceFile(sbom, "sbom/image.cdx.json", bytes("not-json"));
    expect(() => verify(sbom)).toThrow("SBOM_JSON_INVALID");

    const provenance = fixture();
    replaceFile(provenance, "provenance/release.intoto.json", bytes("not-json"));
    expect(() => verify(provenance)).toThrow("PROVENANCE_JSON_INVALID");
  });

  it("rejects duplicate and unknown evidence subjects", () => {
    const duplicateSbom = fixture();
    duplicateSbom.manifest.sboms.push({ ...duplicateSbom.manifest.sboms[0]! });
    expect(() => verify(duplicateSbom)).toThrow("SBOM_SUBJECT_DUPLICATE");

    const unknownSbom = fixture();
    unknownSbom.manifest.sboms[0] = {
      ...unknownSbom.manifest.sboms[0]!,
      subjectDigest: `sha256:${"f".repeat(64)}`,
    };
    expect(() => verify(unknownSbom)).toThrow("SBOM_UNKNOWN_SUBJECT");

    const unknownProvenance = fixture();
    unknownProvenance.manifest.provenance[0] = {
      ...unknownProvenance.manifest.provenance[0]!,
      subjectDigests: [`sha256:${"f".repeat(64)}`],
    };
    expect(() => verify(unknownProvenance)).toThrow("PROVENANCE_UNKNOWN_SUBJECT");

    const unknownSignature = fixture();
    unknownSignature.manifest.signatures[0] = {
      ...unknownSignature.manifest.signatures[0]!,
      subjectDigest: `sha256:${"f".repeat(64)}`,
    };
    expect(() => verify(unknownSignature)).toThrow("SIGNATURE_UNKNOWN_SUBJECT");
  });

  it("rejects subject-to-artifact kind mismatch", () => {
    const value = fixture();
    value.manifest.subjects[0] = {
      ...value.manifest.subjects[0]!,
      kind: "MODEL",
    };
    expect(() => verify(value)).toThrow("SUBJECT_ARTIFACT_KIND_MISMATCH");
  });

  it.each([
    ["tls.key", "synthetic", "SECRET_FILE_DETECTED"],
    ["config.pem", "synthetic", "SECRET_FILE_DETECTED"],
    [".env.production", "synthetic", "SECRET_FILE_DETECTED"],
    ["notes.txt", "-----BEGIN PRIVATE KEY-----\nsynthetic", "SECRET_CONTENT_DETECTED"],
    ["notes.txt", "access_token=synthetic", "SECRET_CONTENT_DETECTED"],
    ["notes.json", '{"access_token":"synthetic"}', "SECRET_CONTENT_DETECTED"],
  ])("rejects secret material %s", (path, content, code) => {
    const value = fixture();
    const payload = bytes(content);
    value.files.push({ path, type: "FILE", bytes: payload });
    value.manifest.entries.push({
      path,
      kind: "CONFIG",
      digest: digest(payload),
      sizeBytes: payload.byteLength,
      mediaType: "text/plain",
    });
    expect(() => verify(value)).toThrow(code);
  });

  it("rejects stale and future trust/revocation snapshots", () => {
    const cases = [
      ["trustRootGeneratedAt", "2026-07-10T00:00:00.000Z", "TRUST_ROOT_STALE"],
      [
        "revocationSnapshotGeneratedAt",
        "2026-07-11T00:00:00.000Z",
        "REVOCATION_SNAPSHOT_STALE",
      ],
      ["trustRootGeneratedAt", "2026-07-13T00:00:01.000Z", "TRUST_ROOT_FROM_FUTURE"],
      [
        "revocationSnapshotGeneratedAt",
        "2026-07-13T00:00:01.000Z",
        "REVOCATION_FROM_FUTURE",
      ],
    ] as const;
    for (const [field, timestamp, code] of cases) {
      const value = fixture();
      value.manifest.signatures[0] = {
        ...value.manifest.signatures[0]!,
        [field]: timestamp,
      };
      expect(() => verify(value)).toThrow(code);
    }
  });

  it.each([
    ["network", { networkUsed: true }, "OFFLINE_NETWORK_VIOLATION"],
    ["network allowed", { networkAllowed: true }, "OFFLINE_NETWORK_VIOLATION"],
    ["verify", { signatureVerified: false }, "SIGNATURE_VERIFICATION_FAILED"],
    ["identity", { identityMatched: false }, "SIGNATURE_VERIFICATION_FAILED"],
    ["revocation", { revocationStatus: "REVOKED" }, "SIGNATURE_VERIFICATION_FAILED"],
    ["subject", { subjectDigest: `sha256:${"f".repeat(64)}` }, "SIGNATURE_SUBJECT_MISMATCH"],
    ["envelope digest", { signatureEnvelopeDigest: `sha256:${"f".repeat(64)}` }, "SIGNATURE_ENVELOPE_DIGEST_MISMATCH"],
    ["trust digest", { trustRootDigest: `sha256:${"f".repeat(64)}` }, "TRUST_ROOT_DIGEST_MISMATCH"],
    ["revocation digest", { revocationSnapshotDigest: `sha256:${"f".repeat(64)}` }, "REVOCATION_SNAPSHOT_DIGEST_MISMATCH"],
  ])("rejects bad signature receipt %s", (_name, delta, code) => {
    const value = fixture();
    const adapter = new SyntheticSignatureVerifier((receipt) =>
      ({ ...receipt, ...delta }) as unknown as OfflineSignatureVerificationReceiptV1,
    );
    expect(() => verify(value, adapter)).toThrow(code);
  });

  it("enforces file count, per-file and total-size limits", () => {
    const value = fixture();
    expect(() =>
      verifier({ maxFileCount: 9 }).verify(
        value.manifest as SyntheticOfflineBundleManifestV1,
        new MemoryReader(value.files),
        new SyntheticSignatureVerifier(),
      ),
    ).toThrow("BUNDLE_FILE_COUNT_EXCEEDED");
    expect(() =>
      verifier({ maxFileSizeBytes: 5, maxTotalSizeBytes: 100 }).verify(
        value.manifest as SyntheticOfflineBundleManifestV1,
        new MemoryReader(value.files),
        new SyntheticSignatureVerifier(),
      ),
    ).toThrow("BUNDLE_FILE_SIZE_EXCEEDED");
    expect(() =>
      verifier({ maxFileSizeBytes: 100, maxTotalSizeBytes: 100 }).verify(
        value.manifest as SyntheticOfflineBundleManifestV1,
        new MemoryReader(value.files),
        new SyntheticSignatureVerifier(),
      ),
    ).toThrow("BUNDLE_TOTAL_SIZE_EXCEEDED");
  });

  it.each([
    [{ maxFileCount: 0 }, "FILE_COUNT_LIMIT_INVALID"],
    [{ maxFileSizeBytes: 0 }, "FILE_SIZE_LIMIT_INVALID"],
    [
      { maxFileSizeBytes: 100, maxTotalSizeBytes: 99 },
      "TOTAL_SIZE_LIMIT_INVALID",
    ],
    [{ maxTrustRootAgeSeconds: 0 }, "TRUST_ROOT_AGE_LIMIT_INVALID"],
    [{ maxRevocationAgeSeconds: 0 }, "REVOCATION_AGE_LIMIT_INVALID"],
  ])("rejects invalid verifier limits %#", (limits, code) => {
    expect(() => verifier(limits)).toThrow(code);
  });

  it("rejects moving references and blocked security disposition", () => {
    const moving = fixture();
    moving.manifest.releaseRef = "ats-release:latest";
    expect(() => verify(moving)).toThrow("RELEASE_REF_INVALID");

    const blocked = fixture();
    blocked.manifest.securityDisposition.high = 1;
    expect(() => verify(blocked)).toThrow("SECURITY_DISPOSITION_BLOCKED");
  });

  it("rejects empty readers, future manifests and moving subject names", () => {
    const empty = fixture();
    expect(() =>
      verifier().verify(
        empty.manifest as SyntheticOfflineBundleManifestV1,
        new MemoryReader([]),
        new SyntheticSignatureVerifier(),
      ),
    ).toThrow("INVENTORY_EMPTY");

    const future = fixture();
    (future.manifest as unknown as { generatedAt: string }).generatedAt =
      "2026-07-13T00:00:01.000Z";
    expect(() => verify(future)).toThrow("MANIFEST_FROM_FUTURE");

    const moving = fixture();
    moving.manifest.subjects[0] = {
      ...moving.manifest.subjects[0]!,
      name: "ats-api:latest",
    };
    expect(() => verify(moving)).toThrow("SUBJECT_NAME_INVALID");
  });

  it.each([
    ["entry", (m: MutableManifest) => (m.entries[0] = { ...m.entries[0]!, kind: "EVIL" as never }), "ENTRY_KIND_INVALID"],
    ["subject", (m: MutableManifest) => (m.subjects[0] = { ...m.subjects[0]!, kind: "ARCHIVE" as never }), "SUBJECT_KIND_INVALID"],
    ["sbom", (m: MutableManifest) => (m.sboms[0] = { ...m.sboms[0]!, format: "SPDX_2_2" as never }), "SBOM_FORMAT_INVALID"],
    ["provenance", (m: MutableManifest) => (m.provenance[0] = { ...m.provenance[0]!, predicateType: "UNKNOWN" as never }), "PROVENANCE_PREDICATE_INVALID"],
    ["signature", (m: MutableManifest) => (m.signatures[0] = { ...m.signatures[0]!, tool: "GPG" as never }), "SIGNATURE_TOOL_INVALID"],
  ])("rejects runtime enum widening: %s", (_name, mutate, code) => {
    const value = fixture();
    mutate(value.manifest);
    expect(() => verify(value)).toThrow(code);
  });

  it("supports in-toto statement v1 and rejects its type mismatch", () => {
    const valid = fixture();
    valid.manifest.provenance[0] = {
      ...valid.manifest.provenance[0]!,
      predicateType: "IN_TOTO_V1",
    };
    expect(verify(valid).provenanceCoverageComplete).toBe(true);

    const invalid = fixture();
    invalid.manifest.provenance[0] = {
      ...invalid.manifest.provenance[0]!,
      predicateType: "IN_TOTO_V1",
    };
    const content = JSON.parse(
      Buffer.from(
        invalid.files.find(
          (item) => item.path === "provenance/release.intoto.json",
        )!.bytes,
      ).toString("utf8"),
    ) as Record<string, unknown>;
    content._type = "https://example.invalid/Statement/v0";
    replaceFile(
      invalid,
      "provenance/release.intoto.json",
      bytes(JSON.stringify(content)),
    );
    expect(() => verify(invalid)).toThrow("PROVENANCE_PREDICATE_MISMATCH");
  });

  it("rejects schema widening and duplicate manifest identities", () => {
    const manifestUnknown = fixture();
    (manifestUnknown.manifest as unknown as Record<string, unknown>).deployReady = true;
    expect(() => verify(manifestUnknown)).toThrow(
      "MANIFEST_UNKNOWN_FIELD:deployReady",
    );

    const entryUnknown = fixture();
    (entryUnknown.manifest.entries[0] as unknown as Record<string, unknown>).mode =
      "executable";
    expect(() => verify(entryUnknown)).toThrow("ENTRY_UNKNOWN_FIELD:mode");

    const subjectUnknown = fixture();
    (subjectUnknown.manifest.subjects[0] as unknown as Record<string, unknown>).tag =
      "latest";
    expect(() => verify(subjectUnknown)).toThrow("SUBJECT_UNKNOWN_FIELD:tag");

    const duplicateEntry = fixture();
    duplicateEntry.manifest.entries.push({ ...duplicateEntry.manifest.entries[0]! });
    expect(() => verify(duplicateEntry)).toThrow("ENTRY_PATH_DUPLICATE");

    const duplicateSubject = fixture();
    duplicateSubject.manifest.subjects[1] = {
      ...duplicateSubject.manifest.subjects[1]!,
      immutableSubjectDigest:
        duplicateSubject.manifest.subjects[0]!.immutableSubjectDigest,
    };
    expect(() => verify(duplicateSubject)).toThrow("SUBJECT_DIGEST_DUPLICATE");
  });
});
