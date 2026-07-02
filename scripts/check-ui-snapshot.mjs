#!/usr/bin/env node
/**
 * @ats/ui snapshot bütünlük guard'ı (Codex #67 plan şartları; MFE START GATE):
 *  1. YASAK token taraması (dosya İÇERİĞİ): ag-grid/ag-charts/x-data-grid/x-charts/
 *     @mfe/* (shared-http, shared-types dahil TÜM upstream paket adları)/
 *     @tanstack/react-query/axios/@figma — sessizce giremez.
 *  2. YASAK path adları: advanced/data-grid, components/charts, lib/grid-variants,
 *     catalog, performance, __visual__, __tests__, *.stories.*, *.figma.*
 *  3. Import-closure: tüm relative importlar packages/ui/src İÇİNDE çözülmeli
 *     (kopya-set dışına kaçış = curation sınırı delindi).
 *  4. Dependency-surface: her bare-import package.json dep/peer/devDep'te OLMALI
 *     (unresolved) VE dependencies'teki her paket src'de gerçekten import edilmeli
 *     (unused). "Belki lazım olur" bağımlılığı yasak.
 *  + gömülü self-test (negatif vektörler fail eder).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const UI = join(REPO, "packages/ui");
const SRC = join(UI, "src");

const FORBIDDEN_CONTENT = [
  /ag-grid/i, /ag-charts/i, /AgGrid/, /AgCharts/, /x-data-grid/, /x-charts/,
  /@mfe\//, /@tanstack\/react-query/, /(?<![A-Za-z.])axios/, /@figma\//,
];
const FORBIDDEN_PATH = [
  /advanced\/data-grid/, /components\/charts/, /lib\/grid-variants/,
  /\/catalog\//, /\/performance\//, /__visual__/, /__tests__/,
  /\.stories\./, /\.figma\./,
];
// Node builtin'leri bare-import sayılmaz
const NODE_BUILTINS = new Set(["react", "react-dom", "react/jsx-runtime", "react-dom/client"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|css)$/.test(name)) out.push(p);
  }
  return out;
}

function bareRoot(spec) {
  return spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
}

export function runChecks(files, pkg) {
  const errors = [];
  const bareImports = new Set();

  for (const f of files) {
    const rel = f.path;
    for (const re of FORBIDDEN_PATH) {
      if (re.test(rel)) errors.push(`YASAK path snapshot'ta: ${rel}`);
    }
    const content = f.content;
    for (const re of FORBIDDEN_CONTENT) {
      const m = content.match(re);
      if (m) errors.push(`YASAK token "${m[0]}" (${rel})`);
    }
    // import taraması yorum-soyulmuş metinde (JSDoc/migration-notu prose'u sahte-import üretmesin);
    // YASAK-token taraması yukarıda TAM metinde koşuyor (yorumda bile geçemez — bilinçli sıkılık).
    const codeOnly = content.replace(/\/\*[^]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const specs = [];
    for (const im of codeOnly.matchAll(/(?:^|\n)\s*(?:import|export)[^;]*?from\s+['"]([^'"]+)['"]/g)) specs.push(im[1]);
    // require("...") + dynamic import("...") + side-effect import "..." da closure'a tabidir (Codex #67 blocker-1)
    for (const im of codeOnly.matchAll(/(?:require|import)\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.push(im[1]);
    for (const im of codeOnly.matchAll(/(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g)) specs.push(im[1]);
    for (const spec of specs) {
      if (spec.startsWith(".")) {
        const base = resolve(dirname(join(SRC, rel)), spec);
        if (!base.startsWith(SRC)) {
          errors.push(`relative import kopya-set DIŞINA çıkıyor: ${spec} (${rel})`);
        } else if (f.fs && ![".ts", ".tsx", "/index.ts", "/index.tsx", ".css", ""].some(
            (ext) => existsSync(base + ext) || existsSync(join(base, "index.ts"))
                  || existsSync(join(base, "index.tsx")) || existsSync(base))) {
          errors.push(`relative import çözülemiyor: ${spec} (${rel})`);
        }
      } else {
        bareImports.add(bareRoot(spec));
      }
    }
  }

  const declared = new Set([
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.peerDependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ]);
  for (const b of bareImports) {
    if (!declared.has(b) && !NODE_BUILTINS.has(b) && b !== "@ats/ui") {
      errors.push(`unresolved bare import (package.json'da yok): ${b}`);
    }
  }
  for (const dep of Object.keys(pkg.dependencies || {})) {
    if (![...bareImports].some((b) => b === dep)) {
      errors.push(`unused dependency (src'de import edilmiyor — "belki lazım" yasak): ${dep}`);
    }
  }
  return errors;
}

function collect() {
  return walk(SRC).map((p) => ({
    path: p.slice(SRC.length + 1),
    content: readFileSync(p, "utf8"),
    fs: true,
  }));
}

function selfTest(realFiles, realPkg) {
  const failed = [];
  const cases = [
    ["aggrid-token", [{ path: "x.ts", content: 'import g from "ag-grid-enterprise";' }], realPkg],
    ["mfe-shared-token", [{ path: "x.ts", content: 'import t from "@mfe/shared-types";' }], realPkg],
    ["axios-token", [{ path: "x.ts", content: 'import a from "axios";' }], realPkg],
    ["forbidden-path", [{ path: "components/charts/BarChart.tsx", content: "export {};" }], realPkg],
    ["escape-import", [{ path: "a/b.ts", content: 'export * from "../../../outside";' }], realPkg],
    ["unresolved-bare", [{ path: "x.ts", content: 'import q from "left-pad";' }], realPkg],
    ["require-escape", [{ path: "a/b.ts", content: 'const j = require("../../../outside.json");' }], realPkg],
    ["dynamic-import-escape", [{ path: "a/b.ts", content: 'const m = import("../../../outside");' }], realPkg],
    ["sideeffect-import-escape", [{ path: "a/b.ts", content: 'import "../../../outside.css";' }], realPkg],
    ["unused-dep", realFiles, { ...realPkg, dependencies: { ...realPkg.dependencies, "kullanilmayan-paket": "1.0.0" } }],
  ];
  for (const [name, files, pkg] of cases) {
    if (runChecks(files, pkg).length === 0) failed.push(name);
  }
  return failed;
}

const pkg = JSON.parse(readFileSync(join(UI, "package.json"), "utf8"));
const files = collect();
const errors = runChecks(files, pkg);
for (const n of selfTest(files, pkg)) errors.push(`SELF-TEST kaçtı: ${n}`);

if (errors.length > 0) {
  console.error("ui-snapshot guard FAILED:");
  for (const e of errors.slice(0, 30)) console.error("  - " + e);
  process.exit(1);
}
console.log(`ui-snapshot OK — ${files.length} dosya: yasak token/path yok, import-closure kapalı, `
    + `dependency-surface birebir (unused/unresolved yok); self-test 10 negatif vektör fail ediyor.`);
