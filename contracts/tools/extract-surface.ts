/**
 * ATS-0001 contract-surface extractor (TS canonical → language-neutral tokens).
 *
 * Amaç: PARITY.md'nin "yalnız metot-adı" sınırını kaldırmak. Bu extractor TS
 * sözleşme kaynağından **tam yüzeyi** (metot param/return tipleri, DTO alan
 * tipleri + opsiyonellik/nullability, enum üyeleri) AST node'larından çıkarır ve
 * **dilden-bağımsız token** vocabulary'sine normalize eder. Aynı token'ları Java
 * reflection extractor da üretir → tip/DTO/enum drift'i iki tarafta da makine-
 * yakalanır (codegen-grade).
 *
 * Token vocabulary (her iki dil aynı üretir; JSON-level numeric parity):
 *   string | number | boolean | void | Json
 *   id:<Brand>            (TenantId/ActorId/... ↔ Ids.<Brand>)
 *   array:<elem>          (readonly X[] ↔ List<X>)
 *   outcome:<inner>       (Outcome<X>)
 *   dto:<SimpleName>      (TranscriptResult ↔ record TranscriptResult)
 *   enum:<a|b|c>          (string-literal union ↔ Java enum; isim-bağımsız, üye-set)
 *
 * Codex 019f131f REVISE absorbe:
 *  - kaynak dosyalar GLOB ile keşfedilir (elle SOURCE_FILES yok → yeni dosya kaçmaz).
 *  - method param optional/nullable + field nullable JSON'da korunur (canon'da erimez).
 *  - mixed-interface / contract-inheritance / overload / desteklenmeyen üye → FAIL-FAST.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const BRAND_IDS = new Set([
  "TenantId",
  "ActorId",
  "InterviewId",
  "EvidenceId",
  "CitationId",
  "PacketId",
]);

export interface ParamSig {
  readonly type: string;
  readonly optional: boolean;
  readonly nullable: boolean;
}
export interface MethodSig {
  readonly name: string;
  readonly params: readonly ParamSig[];
  readonly returns: string;
}
export interface FieldSig {
  readonly name: string;
  readonly type: string;
  readonly optional: boolean;
  readonly nullable: boolean;
}
export interface Surface {
  readonly contracts: Record<string, MethodSig[]>;
  readonly dtos: Record<string, FieldSig[]>;
  readonly enums: Record<string, string[]>;
}

const SRC_DIR = path.join(fileURLToPath(new URL(".", import.meta.url)), "..", "src");

/** Kaynak dosyaları GLOB ile keşfet (elle liste yok → yeni contracts/src/*.ts kaçmaz). */
function discoverSourceFiles(): string[] {
  return fs
    .readdirSync(SRC_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
    .sort();
}

type EnumAliases = Map<string, { token: string; members: string[] }>;

function isNullLike(t: ts.TypeNode): boolean {
  return (
    (ts.isLiteralTypeNode(t) && t.literal.kind === ts.SyntaxKind.NullKeyword) ||
    t.kind === ts.SyntaxKind.UndefinedKeyword
  );
}

function stringLiteralUnionMembers(node: ts.TypeNode): string[] | null {
  if (!ts.isUnionTypeNode(node)) return null;
  const members: string[] = [];
  for (const m of node.types) {
    if (ts.isLiteralTypeNode(m) && m.literal.kind === ts.SyntaxKind.StringLiteral) {
      members.push((m.literal as ts.StringLiteral).text);
    } else {
      return null; // not a pure string-literal union
    }
  }
  return members.length > 0 ? members : null;
}

function enumToken(members: string[]): string {
  return "enum:" + [...members].sort().join("|");
}

function unwrap(node: ts.TypeNode): ts.TypeNode {
  if (ts.isParenthesizedTypeNode(node)) return unwrap(node.type);
  return node;
}

/** nullable = union'da null/undefined var (saf string-literal enum nullable sayılmaz). */
function isNullableType(node: ts.TypeNode): boolean {
  const n = unwrap(node);
  if (ts.isUnionTypeNode(n)) {
    if (stringLiteralUnionMembers(n)) return false;
    return n.types.some(isNullLike);
  }
  return false;
}

function canonNode(node: ts.TypeNode, enums: EnumAliases): string {
  node = unwrap(node);

  switch (node.kind) {
    case ts.SyntaxKind.StringKeyword:
      return "string";
    case ts.SyntaxKind.NumberKeyword:
      return "number";
    case ts.SyntaxKind.BooleanKeyword:
      return "boolean";
    case ts.SyntaxKind.VoidKeyword:
      return "void";
  }

  if (ts.isTypeOperatorNode(node) && node.operator === ts.SyntaxKind.ReadonlyKeyword) {
    return canonNode(node.type, enums);
  }
  if (ts.isArrayTypeNode(node)) {
    return "array:" + canonNode(node.elementType, enums);
  }

  if (ts.isUnionTypeNode(node)) {
    const lits = stringLiteralUnionMembers(node);
    if (lits) return enumToken(lits);
    const nonNull = node.types.filter((t) => !isNullLike(t));
    if (nonNull.length === 1 && nonNull[0]) return canonNode(nonNull[0], enums);
    throw new Error(`Unsupported union: ${node.getText()}`);
  }

  if (ts.isTypeReferenceNode(node)) {
    const name = node.typeName.getText();
    if (name === "Outcome" && node.typeArguments?.[0]) {
      return "outcome:" + canonNode(node.typeArguments[0], enums);
    }
    if (BRAND_IDS.has(name)) return "id:" + name;
    if (name === "JsonObject") return "Json";
    const alias = enums.get(name);
    if (alias) return alias.token;
    return "dto:" + name; // any other named reference within our contracts = a DTO
  }

  throw new Error(`Unsupported type node (${ts.SyntaxKind[node.kind]}): ${node.getText()}`);
}

export function extractSurface(): Surface {
  const contracts: Record<string, MethodSig[]> = {};
  const dtosRaw: Record<string, { fields: FieldSig[]; extends: string[] }> = {};
  const enums: EnumAliases = new Map();
  const enumsOut: Record<string, string[]> = {};

  const sources = discoverSourceFiles().map((f) =>
    ts.createSourceFile(f, fs.readFileSync(path.join(SRC_DIR, f), "utf8"), ts.ScriptTarget.Latest, true),
  );

  // Pass 1: named string-literal-union type aliases → enum registry.
  for (const sf of sources) {
    sf.forEachChild((node) => {
      if (ts.isTypeAliasDeclaration(node)) {
        const members = stringLiteralUnionMembers(node.type);
        if (members) {
          const name = node.name.text;
          const sorted = [...members].sort();
          enums.set(name, { token: enumToken(members), members: sorted });
          enumsOut[name] = sorted;
        }
      }
    });
  }

  // Pass 2: interfaces → contracts (methods) or DTOs (properties). Fail-fast on
  // mixed-member / contract-inheritance / overload / unsupported member kind.
  for (const sf of sources) {
    sf.forEachChild((node) => {
      if (!ts.isInterfaceDeclaration(node)) return;
      const name = node.name.text;
      if (name === "JsonObject") return; // primitive (index signature) → "Json" token

      const methods: MethodSig[] = [];
      const fields: FieldSig[] = [];
      const seenMethodNames = new Set<string>();

      for (const member of node.members) {
        if (ts.isMethodSignature(member) && member.type) {
          const mname = (member.name as ts.Identifier).text;
          if (seenMethodNames.has(mname)) {
            throw new Error(`overload not supported: ${name}.${mname}`);
          }
          seenMethodNames.add(mname);
          methods.push({
            name: mname,
            params: member.parameters.map((p) => {
              const pt = p.type as ts.TypeNode;
              return {
                type: canonNode(pt, enums),
                optional: p.questionToken !== undefined,
                nullable: isNullableType(pt),
              };
            }),
            returns: canonNode(member.type, enums),
          });
        } else if (ts.isPropertySignature(member) && member.type) {
          fields.push({
            name: (member.name as ts.Identifier).text,
            type: canonNode(member.type, enums),
            optional: member.questionToken !== undefined,
            nullable: isNullableType(member.type),
          });
        } else {
          throw new Error(
            `unsupported interface member in ${name}: ${ts.SyntaxKind[member.kind]}`,
          );
        }
      }

      if (methods.length > 0 && fields.length > 0) {
        throw new Error(`mixed interface (method+property) not supported: ${name}`);
      }

      if (methods.length > 0) {
        if ((node.heritageClauses?.length ?? 0) > 0) {
          throw new Error(`contract inheritance not supported: ${name}`);
        }
        contracts[name] = methods.sort((a, b) => a.name.localeCompare(b.name));
      } else {
        const ext: string[] = [];
        for (const h of node.heritageClauses ?? []) {
          for (const t of h.types) ext.push(t.expression.getText());
        }
        dtosRaw[name] = { fields, extends: ext };
      }
    });
  }

  // Flatten `extends` for DTOs (LedgerEntry extends EvidenceEvent).
  const dtos: Record<string, FieldSig[]> = {};
  const resolve = (dtoName: string, seen: Set<string>): FieldSig[] => {
    if (seen.has(dtoName)) throw new Error(`circular extends: ${dtoName}`);
    seen.add(dtoName);
    const raw = dtosRaw[dtoName];
    if (!raw) throw new Error(`unknown DTO in extends: ${dtoName}`);
    const inherited = raw.extends.flatMap((e) => resolve(e, new Set(seen)));
    return [...inherited, ...raw.fields].sort((a, b) => a.name.localeCompare(b.name));
  };
  for (const dtoName of Object.keys(dtosRaw)) dtos[dtoName] = resolve(dtoName, new Set());

  return { contracts, dtos, enums: enumsOut };
}

/**
 * Cross-language, parser-free projection (one sorted line per surface element).
 * Java tarafı bunu `Files.readAllLines` ile (JSON dep'siz) okuyup reflection
 * token'larıyla karşılaştırır. NOT: optional/nullable işareti taşımaz — Java
 * record'ları opsiyonelliği ifade edemez; opsiyonellik/nullability TS json
 * deep-equal ile (TS-only) kilitlenir, isim+tip cross-language bu projeksiyonla.
 *   C <Iface>.<method>(<p1>,<p2>,...):<ret>
 *   D <Dto>.<field>:<type>
 *   E <Enum>=<m1|m2|...>
 */
export function surfaceToTokens(s: Surface): string[] {
  const lines: string[] = [];
  for (const [iface, methods] of Object.entries(s.contracts)) {
    for (const m of methods) {
      lines.push(`C ${iface}.${m.name}(${m.params.map((p) => p.type).join(",")}):${m.returns}`);
    }
  }
  for (const [dto, fields] of Object.entries(s.dtos)) {
    for (const f of fields) lines.push(`D ${dto}.${f.name}:${f.type}`);
  }
  for (const [name, members] of Object.entries(s.enums)) {
    lines.push(`E ${name}=${[...members].sort().join("|")}`);
  }
  return lines.sort();
}

// Direct-run: regenerate the committed canonical snapshot (json + token projection).
if (import.meta.url === `file://${process.argv[1]}`) {
  const surface = extractSurface();
  const base = path.join(SRC_DIR, "..");
  const jsonOut = path.join(base, "contract-surface.json");
  const txtOut = path.join(base, "contract-surface.tokens.txt");
  fs.writeFileSync(jsonOut, JSON.stringify(surface, null, 2) + "\n", "utf8");
  fs.writeFileSync(txtOut, surfaceToTokens(surface).join("\n") + "\n", "utf8");
  process.stdout.write(`wrote ${jsonOut}\nwrote ${txtOut}\n`);
}
