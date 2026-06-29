/**
 * ATS-0001 contract-surface extractor (TS canonical → language-neutral tokens).
 *
 * Amaç: PARITY.md'nin "yalnız metot-adı" sınırını kaldırmak. Bu extractor TS
 * sözleşme kaynağından **tam yüzeyi** (metot param/return tipleri, DTO alan
 * tipleri, enum üyeleri) AST node'larından çıkarır ve **dilden-bağımsız token**
 * vocabulary'sine normalize eder. Aynı token'ları Java reflection extractor da
 * üretir → tip/DTO/enum drift'i iki tarafta da makine-yakalanır (codegen-grade).
 *
 * Token vocabulary (her iki dil aynı üretir):
 *   string | number | boolean | void | Json
 *   id:<Brand>            (TenantId/ActorId/... ↔ Ids.<Brand>)
 *   array:<elem>          (readonly X[] ↔ List<X>)
 *   outcome:<inner>       (Outcome<X>)
 *   dto:<SimpleName>      (TranscriptResult ↔ record TranscriptResult)
 *   enum:<a|b|c>          (string-literal union ↔ Java enum; isim-bağımsız, üye-set)
 *
 * Sadece AST node text'i kullanır (type-checker / program YOK) → hızlı, çözünürlük
 * sorunu yok, kırılgan değil.
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

export interface MethodSig {
  readonly name: string;
  readonly params: readonly string[];
  readonly returns: string;
}
export interface FieldSig {
  readonly name: string;
  readonly type: string;
  readonly optional: boolean;
}
export interface Surface {
  readonly contracts: Record<string, MethodSig[]>;
  readonly dtos: Record<string, FieldSig[]>;
  readonly enums: Record<string, string[]>;
}

const SRC_DIR = path.join(fileURLToPath(new URL(".", import.meta.url)), "..", "src");

const SOURCE_FILES = [
  "types.ts",
  "identity-tenant.ts",
  "evidence-ledger.ts",
  "ai-provider.ts",
  "ats-connector.ts",
];

/** Named string-literal-union alias → enum token (OutcomeCode, ExportTarget). */
type EnumAliases = Map<string, { token: string; members: string[] }>;

function stringLiteralUnionMembers(node: ts.TypeNode): string[] | null {
  if (!ts.isUnionTypeNode(node)) return null;
  const members: string[] = [];
  for (const m of node.types) {
    if (
      ts.isLiteralTypeNode(m) &&
      m.literal.kind === ts.SyntaxKind.StringLiteral
    ) {
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

  // readonly X[]  (TypeOperator READONLY)
  if (ts.isTypeOperatorNode(node) && node.operator === ts.SyntaxKind.ReadonlyKeyword) {
    return canonNode(node.type, enums);
  }
  if (ts.isArrayTypeNode(node)) {
    return "array:" + canonNode(node.elementType, enums);
  }

  // Union: string-literal enum, or nullable (T | null)
  if (ts.isUnionTypeNode(node)) {
    const lits = stringLiteralUnionMembers(node);
    if (lits) return enumToken(lits);
    // nullable: strip null/undefined, canon the remaining single type
    const nonNull = node.types.filter(
      (t) =>
        !(ts.isLiteralTypeNode(t) && t.literal.kind === ts.SyntaxKind.NullKeyword) &&
        t.kind !== ts.SyntaxKind.UndefinedKeyword,
    );
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
    // any other named reference within our contracts = a DTO interface
    return "dto:" + name;
  }

  throw new Error(`Unsupported type node (${ts.SyntaxKind[node.kind]}): ${node.getText()}`);
}

export function extractSurface(): Surface {
  const contracts: Record<string, MethodSig[]> = {};
  const dtosRaw: Record<string, { fields: FieldSig[]; extends: string[] }> = {};
  const enums: EnumAliases = new Map();
  const enumsOut: Record<string, string[]> = {};

  const sources = SOURCE_FILES.map((f) => {
    const full = path.join(SRC_DIR, f);
    return ts.createSourceFile(f, fs.readFileSync(full, "utf8"), ts.ScriptTarget.Latest, true);
  });

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

  // Pass 2: interfaces → contracts (methods) or DTOs (properties).
  for (const sf of sources) {
    sf.forEachChild((node) => {
      if (!ts.isInterfaceDeclaration(node)) return;
      const name = node.name.text;
      // JsonObject is a primitive (index signature) mapped to the "Json" token; not a DTO.
      if (name === "JsonObject") return;
      const methods: MethodSig[] = [];
      const fields: FieldSig[] = [];

      for (const member of node.members) {
        if (ts.isMethodSignature(member) && member.type) {
          methods.push({
            name: (member.name as ts.Identifier).text,
            params: member.parameters.map((p) =>
              canonNode(p.type as ts.TypeNode, enums),
            ),
            returns: canonNode(member.type, enums),
          });
        } else if (ts.isPropertySignature(member) && member.type) {
          fields.push({
            name: (member.name as ts.Identifier).text,
            type: canonNode(member.type, enums),
            optional: member.questionToken !== undefined,
          });
        }
      }

      if (methods.length > 0) {
        contracts[name] = methods.sort((a, b) => a.name.localeCompare(b.name));
      } else {
        const ext: string[] = [];
        const heritage = node.heritageClauses ?? [];
        for (const h of heritage) {
          for (const t of h.types) ext.push(t.expression.getText());
        }
        dtosRaw[name] = { fields, extends: ext };
      }
    });
  }

  // Flatten `extends` for DTOs (LedgerEntry extends EvidenceEvent).
  const dtos: Record<string, FieldSig[]> = {};
  const resolve = (name: string, seen: Set<string>): FieldSig[] => {
    if (seen.has(name)) throw new Error(`circular extends: ${name}`);
    seen.add(name);
    const raw = dtosRaw[name];
    if (!raw) throw new Error(`unknown DTO in extends: ${name}`);
    const inherited = raw.extends.flatMap((e) => resolve(e, new Set(seen)));
    const own = raw.fields;
    const merged = [...inherited, ...own];
    return merged.sort((a, b) => a.name.localeCompare(b.name));
  };
  for (const name of Object.keys(dtosRaw)) dtos[name] = resolve(name, new Set());

  return { contracts, dtos, enums: enumsOut };
}

/**
 * Cross-language, parser-free projection (one sorted line per surface element).
 * Java tarafı bunu `Files.readAllLines` ile (JSON dep'siz) okuyup reflection
 * token'larıyla karşılaştırır. NOT: optional/nullable işareti taşımaz — Java
 * record'ları opsiyonelliği ifade edemez; opsiyonellik TS json deep-equal ile
 * (TS-only) kilitlenir, isim+tip cross-language bu projeksiyonla kilitlenir.
 *   C <Iface>.<method>(<p1>,<p2>,...):<ret>
 *   D <Dto>.<field>:<type>
 *   E <Enum>=<m1|m2|...>
 */
export function surfaceToTokens(s: Surface): string[] {
  const lines: string[] = [];
  for (const [iface, methods] of Object.entries(s.contracts)) {
    for (const m of methods) {
      lines.push(`C ${iface}.${m.name}(${m.params.join(",")}):${m.returns}`);
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
