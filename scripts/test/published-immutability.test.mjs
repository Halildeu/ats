import test from "node:test";
import assert from "node:assert/strict";
import {
  isPublishedImmutablePath,
  publishedInventory,
  resolveBaseRef,
  verifyPublishedImmutability,
} from "../check-published-immutability.mjs";

const V1 = "backend/persistence-postgres/src/main/resources/db/migration/V1__base.sql";
const V2 = "backend/persistence-postgres/src/main/resources/db/migration/V2__next.sql";
const V2_1 = "backend/persistence-postgres/src/main/resources/db/migration/V2_1__hotfix.sql";
const V2_DOT_2 = "backend/persistence-postgres/src/main/resources/db/migration/V2.2__forward.sql";
const POLICY = "contracts/policies/dsar-input-contract.v1.json";

function fakeRunner(contents) {
  return (_command, args) => {
    if (args[0] === "cat-file") return { status: 0, stdout: "", stderr: "" };
    if (args[0] === "ls-tree") {
      return { status: 0, stdout: `${Object.keys(contents).join("\n")}\n`, stderr: "" };
    }
    if (args[0] === "show") {
      const path = args[1].slice(args[1].indexOf(":") + 1);
      return path in contents
        ? { status: 0, stdout: contents[path], stderr: "" }
        : { status: 128, stdout: "", stderr: "missing" };
    }
    throw new Error(`unexpected git args: ${args.join(" ")}`);
  };
}

test("immutable envanter candidate generator path sabitlerinden bağımsızdır", () => {
  assert.equal(isPublishedImmutablePath(V1), true);
  assert.equal(isPublishedImmutablePath(V2_1), true);
  assert.equal(isPublishedImmutablePath(V2_DOT_2), true);
  assert.equal(isPublishedImmutablePath(POLICY), true);
  assert.equal(isPublishedImmutablePath("contracts/policies/dsar-input-contract.v2.json"), true);
  assert.equal(isPublishedImmutablePath("scripts/generate-dsar-input-contract.mjs"), false);
  assert.equal(isPublishedImmutablePath("backend/x/V1__base.sql"), false);
  assert.equal(isPublishedImmutablePath(
    "backend/persistence-postgres/src/main/resources/db/migration/V2x1__invalid.sql",
  ), false);

  const inventory = publishedInventory({
    repositoryRoot: "/repo",
    baseRef: "exact-base",
    runner: fakeRunner({ [V1]: "v1\n", [POLICY]: "policy\n", "README.md": "x" }),
  });
  assert.deepEqual(inventory.paths, [V1, POLICY]);
});

test("base'te yayımlanmış migration/policy değişikliği veya silinmesi fail olur", () => {
  const contents = { [V1]: "v1\n", [POLICY]: "policy\n" };
  const changed = verifyPublishedImmutability({
    repositoryRoot: "/repo",
    baseRef: "exact-base",
    runner: fakeRunner(contents),
    readCurrent: (path) => path === V1 ? "changed\n" : contents[path],
  });
  assert.deepEqual(changed.errors, [`${V1}: exact-base üzerindeki yayımlanmış içerik değişmiş`]);

  const deleted = verifyPublishedImmutability({
    repositoryRoot: "/repo",
    baseRef: "exact-base",
    runner: fakeRunner(contents),
    readCurrent: (path) => {
      if (path === POLICY) throw new Error("missing");
      return contents[path];
    },
  });
  assert.deepEqual(deleted.errors, [`${POLICY}: yayımlanmış immutable dosya silinmiş`]);
});

test("base envanterinde olmayan yeni forward dosya first-publication olarak serbesttir", () => {
  const contents = { [V1]: "v1\n" };
  const result = verifyPublishedImmutability({
    repositoryRoot: "/repo",
    baseRef: "exact-base",
    runner: fakeRunner(contents),
    readCurrent: (path) => ({ ...contents, [V2]: "v2\n" })[path],
  });
  assert.equal(result.checked, 1);
  assert.deepEqual(result.errors, []);
});

test("CI exact base ref erişilemiyorsa fallback yapmadan fail-closed durur", () => {
  const unavailable = () => ({ status: 128, stdout: "", stderr: "missing" });
  assert.throws(() => resolveBaseRef({
    repositoryRoot: "/repo",
    baseRef: "missing-base",
    runner: unavailable,
  }), /zorunlu exact base ref erişilemiyor/);
});
