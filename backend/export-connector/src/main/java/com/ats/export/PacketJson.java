package com.ats.export;

import com.ats.kernel.JsonValue;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;

/**
 * Deterministik/kanonik JSON serileştirme (digest + leak-scan için) + fail-closed
 * yasak-anahtar taraması. Kanonik biçim: object anahtarları SIRALI, minimal escape,
 * integral sayılar tam-sayı yazımı — aynı packet her zaman aynı byte dizisi → packet_digest kararlı.
 */
final class PacketJson {

    /** evidence-packet guard'ının fail-closed yasak yüzeyinin Java mirror'ı (skor/affect/ham-içerik). */
    private static final String[] FORBIDDEN_KEY_SUBSTRINGS = {
            "score", "ranking", "rating", "affect", "emotion", "sentiment", "personality",
            "raw_text", "transcript_text", "audio", "video", "attachment_body"
    };

    private PacketJson() {}

    static String forbiddenKey(JsonValue v) {
        switch (v) {
            case JsonValue.JsonObject o -> {
                for (Map.Entry<String, JsonValue> e : o.values().entrySet()) {
                    String k = e.getKey().toLowerCase(Locale.ROOT);
                    for (String f : FORBIDDEN_KEY_SUBSTRINGS) {
                        if (k.contains(f)) {
                            return e.getKey();
                        }
                    }
                    String nested = forbiddenKey(e.getValue());
                    if (nested != null) {
                        return nested;
                    }
                }
                return null;
            }
            case JsonValue.JsonArray a -> {
                for (JsonValue item : a.items()) {
                    String nested = forbiddenKey(item);
                    if (nested != null) {
                        return nested;
                    }
                }
                return null;
            }
            default -> {
                return null;
            }
        }
    }

    static String canonical(JsonValue v) {
        StringBuilder sb = new StringBuilder();
        write(v, sb);
        return sb.toString();
    }

    private static void write(JsonValue v, StringBuilder sb) {
        switch (v) {
            case JsonValue.JsonObject o -> {
                sb.append('{');
                boolean first = true;
                for (Map.Entry<String, JsonValue> e : new TreeMap<>(o.values()).entrySet()) {
                    if (!first) {
                        sb.append(',');
                    }
                    first = false;
                    writeString(e.getKey(), sb);
                    sb.append(':');
                    write(e.getValue(), sb);
                }
                sb.append('}');
            }
            case JsonValue.JsonArray a -> {
                sb.append('[');
                for (int i = 0; i < a.items().size(); i++) {
                    if (i > 0) {
                        sb.append(',');
                    }
                    write(a.items().get(i), sb);
                }
                sb.append(']');
            }
            case JsonValue.JsonString s -> writeString(s.value(), sb);
            case JsonValue.JsonNumber n -> {
                double d = n.value();
                if (d == Math.rint(d) && !Double.isInfinite(d)) {
                    sb.append((long) d);
                } else {
                    sb.append(d);
                }
            }
            case JsonValue.JsonBool b -> sb.append(b.value());
            case JsonValue.JsonNull ignored -> sb.append("null");
        }
    }

    private static void writeString(String s, StringBuilder sb) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
                }
            }
        }
        sb.append('"');
    }
}
