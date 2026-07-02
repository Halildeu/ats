package com.ats.kernel;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * No-dep, fail-closed JSON codec — {@link JsonValue} için KANONİK serileştirme (sorted-keys,
 * deterministik; hash/digest girdisi) + güvenilmez-girdi parse'ı (derinlik-64, RFC 8259 sayı
 * grameri, NaN/Infinity red, duplicate-key red, trailing-garbage red, ham kontrol-karakteri red,
 * unicode-escape hex'inin explicit doğrulaması). ATS-0018 persistence adapter'ı için kernel'e
 * alındı; ai-provider/export'taki yerel kopyaların konsolidasyonu follow-up (davranış birebir).
 */
public final class JsonCodec {

    public static final class JsonCodecException extends RuntimeException {
        public JsonCodecException(String message) {
            super(message);
        }
    }

    private static final int MAX_DEPTH = 64;
    private static final java.util.regex.Pattern NUMBER_GRAMMAR =
            java.util.regex.Pattern.compile("-?(0|[1-9][0-9]*)(\\.[0-9]+)?([eE][+-]?[0-9]+)?");

    private final String s;
    private int i;

    private JsonCodec(String s) {
        this.s = s;
    }

    // ---------- canonical serialize ----------

    public static String canonical(JsonValue v) {
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
                for (int k = 0; k < a.items().size(); k++) {
                    if (k > 0) {
                        sb.append(',');
                    }
                    write(a.items().get(k), sb);
                }
                sb.append(']');
            }
            case JsonValue.JsonString str -> writeString(str.value(), sb);
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

    private static void writeString(String str, StringBuilder sb) {
        sb.append('"');
        for (int k = 0; k < str.length(); k++) {
            char c = str.charAt(k);
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

    // ---------- fail-closed parse ----------

    public static JsonValue parse(String text) {
        if (text == null || text.isBlank()) {
            throw new JsonCodecException("boş gövde");
        }
        JsonCodec p = new JsonCodec(text);
        p.ws();
        JsonValue v = p.value(0);
        p.ws();
        if (p.i != text.length()) {
            throw new JsonCodecException("trailing garbage @" + p.i);
        }
        return v;
    }

    private JsonValue value(int depth) {
        if (depth > MAX_DEPTH) {
            throw new JsonCodecException("derinlik sınırı aşıldı");
        }
        char c = peek();
        return switch (c) {
            case '{' -> object(depth);
            case '[' -> array(depth);
            case '"' -> new JsonValue.JsonString(string());
            case 't' -> literal("true", new JsonValue.JsonBool(true));
            case 'f' -> literal("false", new JsonValue.JsonBool(false));
            case 'n' -> literal("null", new JsonValue.JsonNull());
            default -> number();
        };
    }

    private JsonValue object(int depth) {
        expect('{');
        ws();
        Map<String, JsonValue> m = new LinkedHashMap<>();
        if (peek() == '}') {
            i++;
            return JsonValue.object(m);
        }
        while (true) {
            ws();
            String key = string();
            if (m.containsKey(key)) {
                throw new JsonCodecException("duplicate key: " + key);
            }
            ws();
            expect(':');
            ws();
            m.put(key, value(depth + 1));
            ws();
            char c = next();
            if (c == '}') {
                return JsonValue.object(m);
            }
            if (c != ',') {
                throw new JsonCodecException("object'te ',' veya '}' bekleniyordu @" + (i - 1));
            }
        }
    }

    private JsonValue array(int depth) {
        expect('[');
        ws();
        List<JsonValue> items = new ArrayList<>();
        if (peek() == ']') {
            i++;
            return new JsonValue.JsonArray(items);
        }
        while (true) {
            ws();
            items.add(value(depth + 1));
            ws();
            char c = next();
            if (c == ']') {
                return new JsonValue.JsonArray(items);
            }
            if (c != ',') {
                throw new JsonCodecException("array'de ',' veya ']' bekleniyordu @" + (i - 1));
            }
        }
    }

    private String string() {
        expect('"');
        StringBuilder sb = new StringBuilder();
        while (true) {
            char c = next();
            if (c == '"') {
                return sb.toString();
            }
            if (c == '\\') {
                char e = next();
                switch (e) {
                    case '"' -> sb.append('"');
                    case '\\' -> sb.append('\\');
                    case '/' -> sb.append('/');
                    case 'b' -> sb.append('\b');
                    case 'f' -> sb.append('\f');
                    case 'n' -> sb.append('\n');
                    case 'r' -> sb.append('\r');
                    case 't' -> sb.append('\t');
                    case 'u' -> {
                        if (i + 4 > s.length()) {
                            throw new JsonCodecException("kısa u-escape");
                        }
                        String hex = s.substring(i, i + 4);
                        for (int h = 0; h < 4; h++) {
                            char hc = hex.charAt(h);
                            boolean okHex = (hc >= '0' && hc <= '9') || (hc >= 'a' && hc <= 'f') || (hc >= 'A' && hc <= 'F');
                            if (!okHex) {
                                throw new JsonCodecException("geçersiz u-escape hex: " + hex);
                            }
                        }
                        sb.append((char) Integer.parseInt(hex, 16));
                        i += 4;
                    }
                    default -> throw new JsonCodecException("geçersiz escape: \\" + e);
                }
            } else if (c < 0x20) {
                throw new JsonCodecException("string içinde ham kontrol karakteri");
            } else {
                sb.append(c);
            }
        }
    }

    private JsonValue number() {
        int start = i;
        if (peek() == '-') {
            i++;
        }
        while (i < s.length() && "0123456789.eE+-".indexOf(s.charAt(i)) >= 0) {
            i++;
        }
        String raw = s.substring(start, i);
        if (!NUMBER_GRAMMAR.matcher(raw).matches()) {
            throw new JsonCodecException("RFC 8259 dışı sayı: " + raw);
        }
        double d;
        try {
            d = Double.parseDouble(raw);
        } catch (NumberFormatException e) {
            throw new JsonCodecException("geçersiz sayı: " + raw);
        }
        if (Double.isNaN(d) || Double.isInfinite(d)) {
            throw new JsonCodecException("non-finite sayı reddedilir: " + raw);
        }
        return new JsonValue.JsonNumber(d);
    }

    private JsonValue literal(String lit, JsonValue v) {
        if (!s.startsWith(lit, i)) {
            throw new JsonCodecException("geçersiz literal @" + i);
        }
        i += lit.length();
        return v;
    }

    private void ws() {
        while (i < s.length() && Character.isWhitespace(s.charAt(i))) {
            i++;
        }
    }

    private char peek() {
        if (i >= s.length()) {
            throw new JsonCodecException("beklenmedik son");
        }
        return s.charAt(i);
    }

    private char next() {
        char c = peek();
        i++;
        return c;
    }

    private void expect(char c) {
        if (next() != c) {
            throw new JsonCodecException("'" + c + "' bekleniyordu @" + (i - 1));
        }
    }
}
