import { createHash } from "node:crypto";
import { posix } from "node:path";

export const OFFLINE_BUNDLE_SCHEMA_VERSION = "offline-bundle/v1" as const;

export type BundleEntryKind =
  | "OCI_IMAGE_ARCHIVE"
  | "MODEL_ARTIFACT"
  | "SBOM"
  | "PROVENANCE"
  | "SIGNATURE_ENVELOPE"
  | "TRUST_ROOT"
  | "REVOCATION_SNAPSHOT"
  | "CHECKSUM_MANIFEST"
  | "CONFIG";

export interface BundleEntryV1 {
  readonly path: string;
  readonly kind: BundleEntryKind;
  readonly digest: `sha256:${string}`;
  readonly sizeBytes: number;
  readonly mediaType: string;
}

export interface ReleaseSubjectV1 {
  readonly kind: "OCI_IMAGE" | "MODEL";
  readonly name: string;
  readonly artifactPath: string;
  readonly artifactDigest: `sha256:${string}`;
  readonly immutableSubjectDigest: `sha256:${string}`;
}

export interface SubjectSbomV1 {
  readonly subjectDigest: `sha256:${string}`;
  readonly path: string;
  readonly format: "SPDX_2_3" | "CYCLONEDX_1_6";
}

export interface SubjectProvenanceV1 {
  readonly path: string;
  readonly predicateType: "SLSA_PROVENANCE_V1" | "IN_TOTO_V1";
  readonly subjectDigests: readonly `sha256:${string}`[];
  readonly builderRef: string;
  readonly sourceRepoRef: string;
  readonly sourceCommit: string;
}

export interface SubjectSignatureV1 {
  readonly subjectDigest: `sha256:${string}`;
  readonly tool: "COSIGN" | "NOTATION";
  readonly envelopePath: string;
  readonly expectedIdentityRef: string;
  readonly trustRootPath: string;
  readonly trustRootRef: string;
  readonly trustRootGeneratedAt: string;
  readonly revocationSnapshotPath: string;
  readonly revocationSnapshotRef: string;
  readonly revocationSnapshotGeneratedAt: string;
}

export interface SyntheticOfflineBundleManifestV1 {
  readonly schemaVersion: typeof OFFLINE_BUNDLE_SCHEMA_VERSION;
  readonly synthetic: true;
  readonly releaseRef: string;
  readonly generatedAt: string;
  readonly checksumManifestPath: string;
  readonly entries: readonly BundleEntryV1[];
  readonly subjects: readonly ReleaseSubjectV1[];
  readonly sboms: readonly SubjectSbomV1[];
  readonly provenance: readonly SubjectProvenanceV1[];
  readonly signatures: readonly SubjectSignatureV1[];
  readonly securityDisposition: {
    readonly critical: 0;
    readonly high: 0;
    readonly licensePolicyViolations: 0;
    readonly secretFindings: 0;
  };
}

export interface BundleFileV1 {
  readonly path: string;
  readonly type: "FILE" | "SYMLINK";
  readonly bytes: Uint8Array;
}

export interface OfflineBundleReader {
  list(): readonly BundleFileV1[];
}

export interface OfflineSignatureVerificationInputV1 {
  readonly tool: "COSIGN" | "NOTATION";
  readonly subjectDigest: `sha256:${string}`;
  readonly signatureEnvelopeBytes: Uint8Array;
  readonly expectedIdentityRef: string;
  readonly trustRootBytes: Uint8Array;
  readonly trustRootRef: string;
  readonly revocationSnapshotBytes: Uint8Array;
  readonly revocationSnapshotRef: string;
  readonly networkAllowed: false;
}

export interface OfflineSignatureVerificationReceiptV1 {
  readonly tool: "COSIGN" | "NOTATION";
  readonly subjectDigest: `sha256:${string}`;
  readonly expectedIdentityRef: string;
  readonly trustRootRef: string;
  readonly revocationSnapshotRef: string;
  readonly signatureEnvelopeDigest: `sha256:${string}`;
  readonly trustRootDigest: `sha256:${string}`;
  readonly revocationSnapshotDigest: `sha256:${string}`;
  readonly signatureVerified: true;
  readonly identityMatched: true;
  readonly revocationStatus: "GOOD";
  readonly offline: true;
  readonly networkAllowed: false;
  readonly networkUsed: false;
}

export interface OfflineSignatureVerifier {
  verify(input: OfflineSignatureVerificationInputV1): OfflineSignatureVerificationReceiptV1;
}

export interface OfflineBundleVerifierLimitsV1 {
  readonly maxFileCount: number;
  readonly maxFileSizeBytes: number;
  readonly maxTotalSizeBytes: number;
  readonly maxTrustRootAgeSeconds: number;
  readonly maxRevocationAgeSeconds: number;
}

export interface BundleVerificationClock {
  now(): Date;
}

export interface OfflineBundleVerificationReceiptV1 {
  readonly schemaVersion: typeof OFFLINE_BUNDLE_SCHEMA_VERSION;
  readonly synthetic: true;
  readonly disposition: "SYNTHETIC_BUNDLE_CONSISTENT";
  readonly releaseRef: string;
  readonly manifestDigest: `sha256:${string}`;
  readonly verifiedAt: string;
  readonly fileCount: number;
  readonly totalSizeBytes: number;
  readonly subjectCount: number;
  readonly inventoryClosed: true;
  readonly allDigestsMatch: true;
  readonly sbomCoverageComplete: true;
  readonly provenanceCoverageComplete: true;
  readonly signatureCoverageComplete: true;
  readonly trustAndRevocationFresh: true;
  readonly noSecretMaterial: true;
  readonly networkAllowed: false;
  readonly networkUsed: false;
  readonly deployReadyClaim: false;
}

const ROOT = "/bundle";
const REF = /^[A-Za-z][A-Za-z0-9._:/-]{2,199}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{7,40}$/;
const MEDIA_TYPE = /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$/;
const MOVING_REF = /(^|:)(latest|main|stable|edge|dev)$/i;
const SECRET_PATH = /(^|\/)(\.env(?:\.[^/]*)?|id_rsa(?:\.[^/]*)?|[^/]*(?:secret|token)[^/]*|[^/]+\.(?:key|pem|p12|pfx|jks|keystore))$/i;
const PRIVATE_CONTENT = /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----|["']?(?:access_token|refresh_token|client_secret|password)["']?\s*[:=]/i;
const ENTRY_KINDS = new Set<BundleEntryKind>([
  "OCI_IMAGE_ARCHIVE",
  "MODEL_ARTIFACT",
  "SBOM",
  "PROVENANCE",
  "SIGNATURE_ENVELOPE",
  "TRUST_ROOT",
  "REVOCATION_SNAPSHOT",
  "CHECKSUM_MANIFEST",
  "CONFIG",
]);

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function sha256(bytes: Uint8Array | string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function iso(value: string, code: string): number {
  const parsed = Date.parse(value);
  invariant(Number.isFinite(parsed) && value.endsWith("Z"), code);
  return parsed;
}

function assertOnlyKeys(value: object, allowed: readonly string[], code: string): void {
  const set = new Set(allowed);
  for (const key of Object.keys(value)) invariant(set.has(key), `${code}:${key}`);
}

function sameStringSet(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length &&
    new Set(actual).size === actual.length &&
    new Set(expected).size === expected.length &&
    actual.every((item) => expected.includes(item));
}

function safePath(value: string): string {
  invariant(typeof value === "string" && value.length > 0, "UNSAFE_PATH");
  invariant(!value.includes("\0") && !value.includes("\\") && !posix.isAbsolute(value), "UNSAFE_PATH");
  invariant(value === posix.normalize(value) && !value.startsWith("./"), "UNSAFE_PATH");
  const resolved = posix.resolve(ROOT, value);
  invariant(resolved.startsWith(`${ROOT}/`) && resolved !== ROOT, "UNSAFE_PATH");
  return value;
}

function canonicalManifest(manifest: SyntheticOfflineBundleManifestV1): string {
  return JSON.stringify({
    ...manifest,
    entries: [...manifest.entries].sort((a, b) => a.path.localeCompare(b.path)),
    subjects: [...manifest.subjects].sort((a, b) => a.name.localeCompare(b.name)),
    sboms: [...manifest.sboms].sort((a, b) => a.subjectDigest.localeCompare(b.subjectDigest)),
    provenance: manifest.provenance
      .map((item) => ({
        ...item,
        subjectDigests: [...item.subjectDigests].sort(),
      }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    signatures: [...manifest.signatures].sort((a, b) => a.subjectDigest.localeCompare(b.subjectDigest)),
  });
}

function validateManifest(manifest: SyntheticOfflineBundleManifestV1): void {
  assertOnlyKeys(
    manifest,
    [
      "schemaVersion",
      "synthetic",
      "releaseRef",
      "generatedAt",
      "checksumManifestPath",
      "entries",
      "subjects",
      "sboms",
      "provenance",
      "signatures",
      "securityDisposition",
    ],
    "MANIFEST_UNKNOWN_FIELD",
  );
  invariant(manifest.schemaVersion === OFFLINE_BUNDLE_SCHEMA_VERSION, "SCHEMA_VERSION_UNSUPPORTED");
  invariant(manifest.synthetic === true, "SYNTHETIC_ONLY");
  invariant(REF.test(manifest.releaseRef) && !MOVING_REF.test(manifest.releaseRef), "RELEASE_REF_INVALID");
  iso(manifest.generatedAt, "GENERATED_AT_INVALID");
  safePath(manifest.checksumManifestPath);
  invariant(manifest.entries.length > 0, "INVENTORY_EMPTY");
  invariant(manifest.subjects.length > 0, "SUBJECT_REQUIRED");

  for (const entry of manifest.entries) {
    assertOnlyKeys(entry, ["path", "kind", "digest", "sizeBytes", "mediaType"], "ENTRY_UNKNOWN_FIELD");
    safePath(entry.path);
    invariant(ENTRY_KINDS.has(entry.kind), "ENTRY_KIND_INVALID");
    invariant(DIGEST.test(entry.digest), "ENTRY_DIGEST_INVALID");
    invariant(Number.isInteger(entry.sizeBytes) && entry.sizeBytes >= 0, "ENTRY_SIZE_INVALID");
    invariant(MEDIA_TYPE.test(entry.mediaType), "MEDIA_TYPE_INVALID");
  }
  invariant(new Set(manifest.entries.map((item) => item.path)).size === manifest.entries.length, "ENTRY_PATH_DUPLICATE");
  invariant(
    manifest.entries.some(
      (item) => item.path === manifest.checksumManifestPath && item.kind === "CHECKSUM_MANIFEST",
    ),
    "CHECKSUM_MANIFEST_MISSING",
  );

  for (const subject of manifest.subjects) {
    assertOnlyKeys(
      subject,
      ["kind", "name", "artifactPath", "artifactDigest", "immutableSubjectDigest"],
      "SUBJECT_UNKNOWN_FIELD",
    );
    invariant(
      subject.kind === "OCI_IMAGE" || subject.kind === "MODEL",
      "SUBJECT_KIND_INVALID",
    );
    invariant(
      REF.test(subject.name) && !MOVING_REF.test(subject.name),
      "SUBJECT_NAME_INVALID",
    );
    safePath(subject.artifactPath);
    invariant(DIGEST.test(subject.artifactDigest) && DIGEST.test(subject.immutableSubjectDigest), "SUBJECT_DIGEST_INVALID");
    const entry = manifest.entries.find((item) => item.path === subject.artifactPath);
    invariant(entry, "SUBJECT_ARTIFACT_MISSING");
    invariant(entry.digest === subject.artifactDigest, "SUBJECT_ARTIFACT_DIGEST_MISMATCH");
    invariant(
      (subject.kind === "OCI_IMAGE" && entry.kind === "OCI_IMAGE_ARCHIVE") ||
        (subject.kind === "MODEL" && entry.kind === "MODEL_ARTIFACT"),
      "SUBJECT_ARTIFACT_KIND_MISMATCH",
    );
  }
  invariant(
    new Set(manifest.subjects.map((item) => item.immutableSubjectDigest)).size ===
      manifest.subjects.length,
    "SUBJECT_DIGEST_DUPLICATE",
  );

  for (const sbom of manifest.sboms) {
    assertOnlyKeys(sbom, ["subjectDigest", "path", "format"], "SBOM_UNKNOWN_FIELD");
    invariant(DIGEST.test(sbom.subjectDigest), "SBOM_SUBJECT_INVALID");
    invariant(
      sbom.format === "SPDX_2_3" || sbom.format === "CYCLONEDX_1_6",
      "SBOM_FORMAT_INVALID",
    );
    safePath(sbom.path);
    invariant(
      manifest.entries.some((entry) => entry.path === sbom.path && entry.kind === "SBOM"),
      "SBOM_ARTIFACT_MISSING",
    );
  }

  for (const provenance of manifest.provenance) {
    assertOnlyKeys(
      provenance,
      ["path", "predicateType", "subjectDigests", "builderRef", "sourceRepoRef", "sourceCommit"],
      "PROVENANCE_UNKNOWN_FIELD",
    );
    safePath(provenance.path);
    invariant(
      provenance.predicateType === "SLSA_PROVENANCE_V1" ||
        provenance.predicateType === "IN_TOTO_V1",
      "PROVENANCE_PREDICATE_INVALID",
    );
    invariant(
      manifest.entries.some(
        (entry) => entry.path === provenance.path && entry.kind === "PROVENANCE",
      ),
      "PROVENANCE_ARTIFACT_MISSING",
    );
    invariant(provenance.subjectDigests.length > 0, "PROVENANCE_SUBJECT_REQUIRED");
    invariant(
      new Set(provenance.subjectDigests).size === provenance.subjectDigests.length &&
        provenance.subjectDigests.every((item) => DIGEST.test(item)),
      "PROVENANCE_SUBJECT_INVALID",
    );
    invariant(REF.test(provenance.builderRef) && REF.test(provenance.sourceRepoRef), "PROVENANCE_REF_INVALID");
    invariant(COMMIT.test(provenance.sourceCommit), "SOURCE_COMMIT_INVALID");
  }

  for (const signature of manifest.signatures) {
    assertOnlyKeys(
      signature,
      [
        "subjectDigest",
        "tool",
        "envelopePath",
        "expectedIdentityRef",
        "trustRootPath",
        "trustRootRef",
        "trustRootGeneratedAt",
        "revocationSnapshotPath",
        "revocationSnapshotRef",
        "revocationSnapshotGeneratedAt",
      ],
      "SIGNATURE_UNKNOWN_FIELD",
    );
    invariant(DIGEST.test(signature.subjectDigest), "SIGNATURE_SUBJECT_INVALID");
    invariant(
      signature.tool === "COSIGN" || signature.tool === "NOTATION",
      "SIGNATURE_TOOL_INVALID",
    );
    for (const path of [
      signature.envelopePath,
      signature.trustRootPath,
      signature.revocationSnapshotPath,
    ]) safePath(path);
    invariant(
      manifest.entries.some(
        (entry) =>
          entry.path === signature.envelopePath && entry.kind === "SIGNATURE_ENVELOPE",
      ),
      "SIGNATURE_ENVELOPE_MISSING",
    );
    invariant(
      manifest.entries.some(
        (entry) => entry.path === signature.trustRootPath && entry.kind === "TRUST_ROOT",
      ),
      "TRUST_ROOT_MISSING",
    );
    invariant(
      manifest.entries.some(
        (entry) =>
          entry.path === signature.revocationSnapshotPath &&
          entry.kind === "REVOCATION_SNAPSHOT",
      ),
      "REVOCATION_SNAPSHOT_MISSING",
    );
    invariant(
      REF.test(signature.expectedIdentityRef) &&
        REF.test(signature.trustRootRef) &&
        REF.test(signature.revocationSnapshotRef),
      "SIGNATURE_REF_INVALID",
    );
    iso(signature.trustRootGeneratedAt, "TRUST_ROOT_TIME_INVALID");
    iso(signature.revocationSnapshotGeneratedAt, "REVOCATION_TIME_INVALID");
  }

  assertOnlyKeys(
    manifest.securityDisposition,
    ["critical", "high", "licensePolicyViolations", "secretFindings"],
    "DISPOSITION_UNKNOWN_FIELD",
  );
  invariant(
    manifest.securityDisposition.critical === 0 &&
      manifest.securityDisposition.high === 0 &&
      manifest.securityDisposition.licensePolicyViolations === 0 &&
      manifest.securityDisposition.secretFindings === 0,
    "SECURITY_DISPOSITION_BLOCKED",
  );
}

export class OfflineBundleVerifier {
  constructor(
    private readonly clock: BundleVerificationClock,
    private readonly limits: OfflineBundleVerifierLimitsV1,
  ) {
    invariant(Number.isInteger(limits.maxFileCount) && limits.maxFileCount > 0, "FILE_COUNT_LIMIT_INVALID");
    invariant(Number.isInteger(limits.maxFileSizeBytes) && limits.maxFileSizeBytes > 0, "FILE_SIZE_LIMIT_INVALID");
    invariant(
      Number.isInteger(limits.maxTotalSizeBytes) &&
        limits.maxTotalSizeBytes >= limits.maxFileSizeBytes,
      "TOTAL_SIZE_LIMIT_INVALID",
    );
    invariant(
      Number.isInteger(limits.maxTrustRootAgeSeconds) && limits.maxTrustRootAgeSeconds > 0,
      "TRUST_ROOT_AGE_LIMIT_INVALID",
    );
    invariant(
      Number.isInteger(limits.maxRevocationAgeSeconds) && limits.maxRevocationAgeSeconds > 0,
      "REVOCATION_AGE_LIMIT_INVALID",
    );
  }

  verify(
    manifest: SyntheticOfflineBundleManifestV1,
    reader: OfflineBundleReader,
    signatureVerifier: OfflineSignatureVerifier,
  ): OfflineBundleVerificationReceiptV1 {
    invariant(Array.isArray(manifest.entries), "ENTRIES_INVALID");
    invariant(
      manifest.entries.length <= this.limits.maxFileCount,
      "BUNDLE_FILE_COUNT_EXCEEDED",
    );
    validateManifest(manifest);
    const nowMs = this.clock.now().getTime();
    invariant(
      iso(manifest.generatedAt, "GENERATED_AT_INVALID") <= nowMs,
      "MANIFEST_FROM_FUTURE",
    );
    invariant(
      manifest.subjects.length <= this.limits.maxFileCount &&
        manifest.sboms.length <= this.limits.maxFileCount &&
        manifest.provenance.length <= this.limits.maxFileCount &&
        manifest.signatures.length <= this.limits.maxFileCount,
      "BUNDLE_FILE_COUNT_EXCEEDED",
    );
    const files = reader.list();
    invariant(files.length > 0, "INVENTORY_EMPTY");
    invariant(files.length <= this.limits.maxFileCount, "BUNDLE_FILE_COUNT_EXCEEDED");

    const byPath = new Map<string, BundleFileV1>();
    let totalSizeBytes = 0;
    for (const file of files) {
      assertOnlyKeys(file, ["path", "type", "bytes"], "BUNDLE_FILE_UNKNOWN_FIELD");
      safePath(file.path);
      invariant(file.type === "FILE", "SYMLINK_FORBIDDEN");
      invariant(file.bytes instanceof Uint8Array, "FILE_BYTES_INVALID");
      invariant(!byPath.has(file.path), "BUNDLE_PATH_DUPLICATE");
      invariant(file.bytes.byteLength <= this.limits.maxFileSizeBytes, "BUNDLE_FILE_SIZE_EXCEEDED");
      totalSizeBytes += file.bytes.byteLength;
      invariant(totalSizeBytes <= this.limits.maxTotalSizeBytes, "BUNDLE_TOTAL_SIZE_EXCEEDED");
      invariant(!SECRET_PATH.test(file.path), "SECRET_FILE_DETECTED");
      const text = Buffer.from(file.bytes).toString("utf8");
      invariant(!PRIVATE_CONTENT.test(text), "SECRET_CONTENT_DETECTED");
      byPath.set(file.path, file);
    }

    const manifestPaths = new Set(manifest.entries.map((item) => item.path));
    const bundlePaths = new Set(byPath.keys());
    for (const path of manifestPaths) invariant(bundlePaths.has(path), `INVENTORY_MISSING_FILE:${path}`);
    for (const path of bundlePaths) invariant(manifestPaths.has(path), `INVENTORY_EXTRA_FILE:${path}`);

    const entries = new Map(manifest.entries.map((item) => [item.path, item]));
    for (const [path, file] of byPath) {
      const entry = entries.get(path)!;
      invariant(file.bytes.byteLength === entry.sizeBytes, `SIZE_MISMATCH:${path}`);
      invariant(sha256(file.bytes) === entry.digest, `DIGEST_MISMATCH:${path}`);
    }

    const checksumFile = byPath.get(manifest.checksumManifestPath)!;
    const checksumLines = Buffer.from(checksumFile.bytes)
      .toString("utf8")
      .split(/\r?\n/)
      .filter((line) => line.length > 0);
    const checksumByPath = new Map<string, string>();
    for (const line of checksumLines) {
      const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
      invariant(match, "CHECKSUM_MANIFEST_INVALID");
      const path = safePath(match[2]!);
      invariant(path !== manifest.checksumManifestPath, "CHECKSUM_SELF_REFERENCE_FORBIDDEN");
      invariant(!checksumByPath.has(path), "CHECKSUM_PATH_DUPLICATE");
      checksumByPath.set(path, `sha256:${match[1]}`);
    }
    const checksumExpected = manifest.entries.filter(
      (entry) => entry.path !== manifest.checksumManifestPath,
    );
    invariant(checksumByPath.size === checksumExpected.length, "CHECKSUM_COVERAGE_MISMATCH");
    for (const entry of checksumExpected) {
      invariant(checksumByPath.get(entry.path) === entry.digest, `CHECKSUM_MISMATCH:${entry.path}`);
    }

    const subjectDigests = new Set(
      manifest.subjects.map((item) => item.immutableSubjectDigest),
    );
    for (const subject of manifest.subjects) {
      const file = byPath.get(subject.artifactPath)!;
      invariant(sha256(file.bytes) === subject.artifactDigest, "SUBJECT_ARTIFACT_DIGEST_MISMATCH");
    }

    const sbomBySubject = new Map<string, SubjectSbomV1>();
    for (const sbom of manifest.sboms) {
      invariant(subjectDigests.has(sbom.subjectDigest), "SBOM_UNKNOWN_SUBJECT");
      invariant(!sbomBySubject.has(sbom.subjectDigest), "SBOM_SUBJECT_DUPLICATE");
      const raw = Buffer.from(byPath.get(sbom.path)!.bytes).toString("utf8");
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        throw new Error("SBOM_JSON_INVALID");
      }
      if (sbom.format === "SPDX_2_3") {
        invariant(parsed.spdxVersion === "SPDX-2.3", "SBOM_VERSION_UNSUPPORTED");
        const packages = Array.isArray(parsed.packages) ? parsed.packages : [];
        const expected = sbom.subjectDigest.slice(7);
        const bound = packages.some((item) => {
          if (!item || typeof item !== "object") return false;
          const checksums = Array.isArray((item as Record<string, unknown>).checksums)
            ? ((item as Record<string, unknown>).checksums as unknown[])
            : [];
          return checksums.some(
            (checksum) =>
              checksum !== null &&
              typeof checksum === "object" &&
              (checksum as Record<string, unknown>).algorithm === "SHA256" &&
              (checksum as Record<string, unknown>).checksumValue === expected,
          );
        });
        invariant(bound, "SBOM_SUBJECT_MISMATCH");
      } else {
        invariant(
          parsed.bomFormat === "CycloneDX" && parsed.specVersion === "1.6",
          "SBOM_VERSION_UNSUPPORTED",
        );
        const metadata =
          parsed.metadata && typeof parsed.metadata === "object"
            ? (parsed.metadata as Record<string, unknown>)
            : {};
        const component =
          metadata.component && typeof metadata.component === "object"
            ? (metadata.component as Record<string, unknown>)
            : {};
        const hashes = Array.isArray(component.hashes) ? component.hashes : [];
        const expected = sbom.subjectDigest.slice(7);
        invariant(
          hashes.some(
            (item) =>
              item !== null &&
              typeof item === "object" &&
              (item as Record<string, unknown>).alg === "SHA-256" &&
              (item as Record<string, unknown>).content === expected,
          ),
          "SBOM_SUBJECT_MISMATCH",
        );
      }
      sbomBySubject.set(sbom.subjectDigest, sbom);
    }
    for (const subjectDigest of subjectDigests) {
      invariant(sbomBySubject.has(subjectDigest), "SBOM_SUBJECT_UNCOVERED");
    }

    const provenanceCovered = new Set<string>();
    for (const provenance of manifest.provenance) {
      for (const subjectDigest of provenance.subjectDigests) {
        invariant(subjectDigests.has(subjectDigest), "PROVENANCE_UNKNOWN_SUBJECT");
        provenanceCovered.add(subjectDigest);
      }
      const raw = Buffer.from(byPath.get(provenance.path)!.bytes).toString("utf8");
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        throw new Error("PROVENANCE_JSON_INVALID");
      }
      invariant(
        provenance.predicateType === "SLSA_PROVENANCE_V1"
          ? parsed._type === "https://in-toto.io/Statement/v1" &&
              parsed.predicateType === "https://slsa.dev/provenance/v1"
          : parsed._type === "https://in-toto.io/Statement/v1",
        "PROVENANCE_PREDICATE_MISMATCH",
      );
      const rawSubjects = Array.isArray(parsed.subject) ? parsed.subject : [];
      const contentSubjects = rawSubjects
        .map((item) => {
          if (!item || typeof item !== "object") return undefined;
          const digestObject = (item as Record<string, unknown>).digest;
          if (!digestObject || typeof digestObject !== "object") return undefined;
          const hex = (digestObject as Record<string, unknown>).sha256;
          return typeof hex === "string" && /^[a-f0-9]{64}$/.test(hex)
            ? `sha256:${hex}`
            : undefined;
        })
        .filter((item): item is string => item !== undefined);
      invariant(
        sameStringSet(contentSubjects, provenance.subjectDigests),
        "PROVENANCE_CONTENT_SUBJECT_MISMATCH",
      );
    }
    for (const subjectDigest of subjectDigests) {
      invariant(provenanceCovered.has(subjectDigest), "PROVENANCE_SUBJECT_UNCOVERED");
    }

    const signatureCovered = new Set<string>();
    for (const signature of manifest.signatures) {
      invariant(subjectDigests.has(signature.subjectDigest), "SIGNATURE_UNKNOWN_SUBJECT");
      invariant(!signatureCovered.has(signature.subjectDigest), "SIGNATURE_SUBJECT_DUPLICATE");
      const trustAgeMs = nowMs - iso(signature.trustRootGeneratedAt, "TRUST_ROOT_TIME_INVALID");
      const revocationAgeMs =
        nowMs - iso(signature.revocationSnapshotGeneratedAt, "REVOCATION_TIME_INVALID");
      invariant(trustAgeMs >= 0, "TRUST_ROOT_FROM_FUTURE");
      invariant(revocationAgeMs >= 0, "REVOCATION_FROM_FUTURE");
      invariant(
        trustAgeMs <= this.limits.maxTrustRootAgeSeconds * 1_000,
        "TRUST_ROOT_STALE",
      );
      invariant(
        revocationAgeMs <= this.limits.maxRevocationAgeSeconds * 1_000,
        "REVOCATION_SNAPSHOT_STALE",
      );

      const result = signatureVerifier.verify({
        tool: signature.tool,
        subjectDigest: signature.subjectDigest,
        signatureEnvelopeBytes: byPath.get(signature.envelopePath)!.bytes,
        expectedIdentityRef: signature.expectedIdentityRef,
        trustRootBytes: byPath.get(signature.trustRootPath)!.bytes,
        trustRootRef: signature.trustRootRef,
        revocationSnapshotBytes: byPath.get(signature.revocationSnapshotPath)!.bytes,
        revocationSnapshotRef: signature.revocationSnapshotRef,
        networkAllowed: false,
      });
      assertOnlyKeys(
        result,
        [
          "tool",
          "subjectDigest",
          "expectedIdentityRef",
          "trustRootRef",
          "revocationSnapshotRef",
          "signatureEnvelopeDigest",
          "trustRootDigest",
          "revocationSnapshotDigest",
          "signatureVerified",
          "identityMatched",
          "revocationStatus",
          "offline",
          "networkAllowed",
          "networkUsed",
        ],
        "SIGNATURE_RECEIPT_UNKNOWN_FIELD",
      );
      invariant(result.tool === signature.tool, "SIGNATURE_TOOL_MISMATCH");
      invariant(result.subjectDigest === signature.subjectDigest, "SIGNATURE_SUBJECT_MISMATCH");
      invariant(
        result.expectedIdentityRef === signature.expectedIdentityRef,
        "SIGNATURE_IDENTITY_MISMATCH",
      );
      invariant(result.trustRootRef === signature.trustRootRef, "TRUST_ROOT_MISMATCH");
      invariant(
        result.revocationSnapshotRef === signature.revocationSnapshotRef,
        "REVOCATION_SNAPSHOT_MISMATCH",
      );
      invariant(
        result.signatureEnvelopeDigest === sha256(byPath.get(signature.envelopePath)!.bytes),
        "SIGNATURE_ENVELOPE_DIGEST_MISMATCH",
      );
      invariant(
        result.trustRootDigest === sha256(byPath.get(signature.trustRootPath)!.bytes),
        "TRUST_ROOT_DIGEST_MISMATCH",
      );
      invariant(
        result.revocationSnapshotDigest ===
          sha256(byPath.get(signature.revocationSnapshotPath)!.bytes),
        "REVOCATION_SNAPSHOT_DIGEST_MISMATCH",
      );
      invariant(
        result.signatureVerified === true &&
          result.identityMatched === true &&
          result.revocationStatus === "GOOD" &&
          result.offline === true,
        "SIGNATURE_VERIFICATION_FAILED",
      );
      invariant(
        result.networkAllowed === false && result.networkUsed === false,
        "OFFLINE_NETWORK_VIOLATION",
      );
      signatureCovered.add(signature.subjectDigest);
    }
    for (const subjectDigest of subjectDigests) {
      invariant(signatureCovered.has(subjectDigest), "SIGNATURE_SUBJECT_UNCOVERED");
    }

    return clone({
      schemaVersion: OFFLINE_BUNDLE_SCHEMA_VERSION,
      synthetic: true,
      disposition: "SYNTHETIC_BUNDLE_CONSISTENT",
      releaseRef: manifest.releaseRef,
      manifestDigest: sha256(canonicalManifest(manifest)),
      verifiedAt: this.clock.now().toISOString(),
      fileCount: files.length,
      totalSizeBytes,
      subjectCount: manifest.subjects.length,
      inventoryClosed: true,
      allDigestsMatch: true,
      sbomCoverageComplete: true,
      provenanceCoverageComplete: true,
      signatureCoverageComplete: true,
      trustAndRevocationFresh: true,
      noSecretMaterial: true,
      networkAllowed: false,
      networkUsed: false,
      deployReadyClaim: false,
    } satisfies OfflineBundleVerificationReceiptV1);
  }
}
