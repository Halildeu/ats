package com.ats.provider;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.kernel.JsonValue;
import org.junit.jupiter.api.Test;

class JsonParseTest {

    @Test
    void parses_nested_structures_and_escapes() {
        JsonValue v = JsonParse.parse("""
                {"a":[1,2.5,-3],"b":{"c":"x\\n\\"y\\u0041"},"d":true,"e":null}""");
        JsonValue.JsonObject o = (JsonValue.JsonObject) v;
        assertEquals(3, ((JsonValue.JsonArray) o.values().get("a")).items().size());
        JsonValue.JsonObject b = (JsonValue.JsonObject) o.values().get("b");
        assertEquals("x\n\"yA", ((JsonValue.JsonString) b.values().get("c")).value());
        assertTrue(((JsonValue.JsonBool) o.values().get("d")).value());
    }

    @Test
    void fail_closed_negative_vectors() {
        for (String bad : new String[] {
                "", "   ",
                "{",
                "{\"a\":1,}",
                "{\"a\":1}garbage",
                "{\"a\":NaN}",
                "{\"a\":Infinity}",
                "{\"a\":1,\"a\":2}",
                "[1,2",
                "\"kapanmayan",
                "{\"a\":tru}",
                "{'tek':1}"}) {
            assertThrows(JsonParse.JsonParseException.class, () -> JsonParse.parse(bad),
                    "fail-closed reddedilmeliydi: " + bad);
        }
    }

    @Test
    void depth_limit_enforced() {
        String deep = "[".repeat(80) + "]".repeat(80);
        assertThrows(JsonParse.JsonParseException.class, () -> JsonParse.parse(deep),
                "derinlik sınırı (64) güvenilmez girdiye karşı zorlanmalı");
    }

    @Test
    void control_char_in_string_rejected() {
        assertThrows(JsonParse.JsonParseException.class, () -> JsonParse.parse("{\"a\":\"xy\"}"));
    }
}
