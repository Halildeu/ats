"""Minimal no-dep JSON-Schema validator (fixtures/schema.json subset · Codex round-3 #2).

Golden fixture'ı şemaya karşı FAIL-CLOSED doğrular. Desteklenen keyword'ler:
type, required, additionalProperties(bool), properties, items, $ref(#/$defs/x), oneOf,
$defs. Desteklenmeyen keyword görürse hata verir (silent under-validation guard).

jsonschema bağımlılığı YOK (repo no-extra-dep ethos; ai-eval CI yalnız pytest kurar).
"""
from __future__ import annotations

import math
import re

_KNOWN = {"$schema", "$id", "$defs", "$ref", "title", "description", "type",
          "required", "properties", "additionalProperties", "items", "oneOf"}
_REF_RE = re.compile(r"^#/\$defs/[A-Za-z0-9_]+$")
_TYPES = {
    "object": dict, "array": list, "string": str, "boolean": bool,
    "number": (int, float), "null": type(None),
}


def _resolve(ref: str, root: dict):
    node = root
    for part in ref.lstrip("#/").split("/"):
        node = node[part]
    return node


def _check_type(inst, t: str) -> bool:
    py = _TYPES[t]
    if t == "number":
        # non-finite (NaN/Infinity/-Infinity) number sayılmaz — false-pass guard (Codex 019f1905).
        return isinstance(inst, py) and not isinstance(inst, bool) and math.isfinite(inst)
    if t == "object":
        return isinstance(inst, dict)
    if t == "boolean":
        return isinstance(inst, bool)
    return isinstance(inst, py)


def validate_schema(schema, root: dict | None = None, path: str = "$") -> list[str]:
    """Instance'dan BAĞIMSIZ schema preflight: tüm node'larda unsupported keyword + $ref
    format/target kontrolü (gelecekte optional/empty branch'a eklenen desteklenmeyen keyword
    sessiz kalamaz — Codex 019f1905)."""
    root = root if root is not None else schema
    errors: list[str] = []
    if not isinstance(schema, dict):
        return [f"{path}: schema node dict değil"]
    for k in schema:
        if k not in _KNOWN:
            errors.append(f"{path}: desteklenmeyen schema keyword '{k}'")
    if "$ref" in schema:
        if not _REF_RE.match(schema["$ref"]):
            errors.append(f"{path}: geçersiz $ref formatı '{schema['$ref']}'")
        else:
            try:
                _resolve(schema["$ref"], root)
            except Exception:
                errors.append(f"{path}: $ref hedefi yok '{schema['$ref']}'")
    for key, sub in schema.get("properties", {}).items():
        errors += validate_schema(sub, root, f"{path}.{key}")
    if "items" in schema:
        errors += validate_schema(schema["items"], root, f"{path}[]")
    for i, sub in enumerate(schema.get("oneOf", [])):
        errors += validate_schema(sub, root, f"{path}|oneOf[{i}]")
    for key, sub in schema.get("$defs", {}).items():
        errors += validate_schema(sub, root, f"{path}.$defs.{key}")
    return errors


def validate(inst, schema: dict, root: dict | None = None, path: str = "$") -> list[str]:
    root = root if root is not None else schema
    errors: list[str] = []
    if "$ref" in schema:
        return validate(inst, _resolve(schema["$ref"], root), root, path)
    for k in schema:
        if k not in _KNOWN:
            errors.append(f"{path}: desteklenmeyen schema keyword '{k}' (under-validation riski)")
    if "oneOf" in schema:
        n = sum(1 for sub in schema["oneOf"] if not validate(inst, sub, root, path))
        if n != 1:
            errors.append(f"{path}: oneOf tam 1 eşleşme bekler (eşleşen={n})")
        return errors
    if "type" in schema:
        types = schema["type"] if isinstance(schema["type"], list) else [schema["type"]]
        if not any(_check_type(inst, t) for t in types):
            errors.append(f"{path}: tip '{type(inst).__name__}' ∉ {types}")
            return errors
    if isinstance(inst, dict):
        for req in schema.get("required", []):
            if req not in inst:
                errors.append(f"{path}: required '{req}' eksik")
        props = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            for key in inst:
                if key not in props:
                    errors.append(f"{path}: izinsiz property '{key}' (additionalProperties:false)")
        for key, sub in props.items():
            if key in inst:
                errors += validate(inst[key], sub, root, f"{path}.{key}")
    if isinstance(inst, list) and "items" in schema:
        for i, el in enumerate(inst):
            errors += validate(el, schema["items"], root, f"{path}[{i}]")
    return errors
