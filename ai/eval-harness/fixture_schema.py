"""Minimal no-dep JSON-Schema validator (fixtures/schema.json subset · Codex round-3 #2).

Golden fixture'ı şemaya karşı FAIL-CLOSED doğrular. Desteklenen keyword'ler:
type, required, additionalProperties(bool), properties, items, $ref(#/$defs/x), oneOf,
$defs. Desteklenmeyen keyword görürse hata verir (silent under-validation guard).

jsonschema bağımlılığı YOK (repo no-extra-dep ethos; ai-eval CI yalnız pytest kurar).
"""
from __future__ import annotations

_KNOWN = {"$schema", "$id", "$defs", "$ref", "title", "description", "type",
          "required", "properties", "additionalProperties", "items", "oneOf"}
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
        return isinstance(inst, py) and not isinstance(inst, bool)
    if t == "object":
        return isinstance(inst, dict)
    if t == "boolean":
        return isinstance(inst, bool)
    return isinstance(inst, py)


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
