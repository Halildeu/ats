package com.ats.kernel;

import java.util.List;
import java.util.Map;

/**
 * JSON-uyumlu, derin-immutable değer tipi (TS contracts/ JsonValue mirror'ı,
 * Codex WS-3 blocker #2). Contract payload'ları yalnız bunlardan oluşur →
 * Date/Map/class/function tip seviyesinde imkânsız + WORM derin-immutable
 * (JsonObject/JsonArray compact ctor copyOf; tüm değerler immutable record).
 */
public sealed interface JsonValue
        permits JsonValue.JsonObject, JsonValue.JsonArray, JsonValue.JsonString,
                JsonValue.JsonNumber, JsonValue.JsonBool, JsonValue.JsonNull {

    record JsonObject(Map<String, JsonValue> values) implements JsonValue {
        public JsonObject {
            values = Map.copyOf(values); // immutable; değerler de immutable JsonValue
        }
    }

    record JsonArray(List<JsonValue> items) implements JsonValue {
        public JsonArray {
            items = List.copyOf(items);
        }
    }

    record JsonString(String value) implements JsonValue {}

    record JsonNumber(double value) implements JsonValue {}

    record JsonBool(boolean value) implements JsonValue {}

    record JsonNull() implements JsonValue {}

    // --- okunaklı kurucular ---
    static JsonValue of(String v) { return new JsonString(v); }
    static JsonValue of(double v) { return new JsonNumber(v); }
    static JsonValue of(boolean v) { return new JsonBool(v); }
    static JsonObject object(Map<String, JsonValue> values) { return new JsonObject(values); }
}
