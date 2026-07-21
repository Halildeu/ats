#!/usr/bin/env node
/**
 * Published history guard independent from any candidate generator constants.
 *
 * Exact base commit'te bulunan bütün versioned policy vN JSON dosyaları ve Flyway
 * VN migration'ları byte-for-byte immutable'dır. Yeni vN+1/VN+1 dosyası eklenebilir;
 * base'te yayımlanmış bir dosya değiştirilemez veya silinemez.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_BASE_REFS = Object.freeze(["origin/main", "main"]);
const INVENTORY_ROOTS = Object.freeze([
  "backend/persistence-postgres/src/main/resources/db/migration",
  "contracts/policies",
]);

function fail(message) {
  throw new Error(`Published immutability guard: ${message}`);
}

function git(runner, args, repositoryRoot) {
  const result = runner("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  return result;
}

export function isPublishedImmutablePath(path) {
  // Flyway version'ları V8 yanında V8_1 / V8.1 gibi ileri sürümleri de
  // destekleyebilir. Base envanterindeki bu biçimlerin hiçbiri guard dışına düşmez.
  return /^backend\/persistence-postgres\/src\/main\/resources\/db\/migration\/V[0-9]+(?:[._][0-9]+)*__[^/]+\.sql$/.test(path)
    || /^contracts\/policies\/[^/]+\.v[0-9]+\.json$/.test(path);
}

export function resolveBaseRef({
  repositoryRoot = REPO,
  baseRef = process.env.PUBLISHED_IMMUTABILITY_BASE_REF?.trim() || "",
  runner = spawnSync,
} = {}) {
  const refs = baseRef ? [baseRef] : DEFAULT_BASE_REFS;
  for (const ref of refs) {
    const result = git(runner, ["cat-file", "-e", `${ref}^{commit}`], repositoryRoot);
    if (result.status === 0) return ref;
    if (baseRef) fail(`zorunlu exact base ref erişilemiyor: ${ref}`);
  }
  fail("origin/main veya main baseline ref'i bulunamadı");
}

export function publishedInventory({
  repositoryRoot = REPO,
  baseRef = "",
  runner = spawnSync,
} = {}) {
  const resolvedBaseRef = resolveBaseRef({ repositoryRoot, baseRef, runner });
  const listing = git(runner,
    ["ls-tree", "-r", "--name-only", resolvedBaseRef, "--", ...INVENTORY_ROOTS],
    repositoryRoot);
  if (listing.status !== 0) {
    fail(`${resolvedBaseRef} immutable envanteri okunamadı (git status=${listing.status})`);
  }
  const paths = listing.stdout.split("\n").filter(isPublishedImmutablePath).sort();
  return Object.freeze({ baseRef: resolvedBaseRef, paths: Object.freeze(paths) });
}

export function verifyPublishedImmutability({
  repositoryRoot = REPO,
  baseRef = process.env.PUBLISHED_IMMUTABILITY_BASE_REF?.trim() || "",
  runner = spawnSync,
  readCurrent = (path) => readFileSync(join(repositoryRoot, path), "utf8"),
} = {}) {
  const inventory = publishedInventory({ repositoryRoot, baseRef, runner });
  const errors = [];
  for (const path of inventory.paths) {
    const published = git(runner, ["show", `${inventory.baseRef}:${path}`], repositoryRoot);
    if (published.status !== 0) {
      errors.push(`${path}: base içeriği okunamadı (git status=${published.status})`);
      continue;
    }
    let current;
    try {
      current = readCurrent(path);
    } catch {
      errors.push(`${path}: yayımlanmış immutable dosya silinmiş`);
      continue;
    }
    if (current !== published.stdout) {
      errors.push(`${path}: ${inventory.baseRef} üzerindeki yayımlanmış içerik değişmiş`);
    }
  }
  return Object.freeze({
    baseRef: inventory.baseRef,
    checked: inventory.paths.length,
    errors: Object.freeze(errors),
  });
}

export function run() {
  const result = verifyPublishedImmutability();
  if (result.errors.length > 0) {
    console.error(`Published immutability guard FAILED — base=${result.baseRef}`);
    for (const error of result.errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Published immutability OK — base=${result.baseRef} checked=${result.checked}`);
}

const invokedDirectly = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) run();
