package com.ats.provider;

import com.ats.kernel.JsonValue;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * No-dep, fail-closed minimal JSON parser → shared-kernel {@link JsonValue}.
 * Sağlayıcı cevabı GÜVENİLMEZ girdidir: derinlik sınırı (64), NaN/Infinity yok,
 * duplicate-key reddi, trailing-garbage reddi — hepsi {@link JsonParseException} fırlatır
 * (çağıran fail-closed Outcome'a çevirir). Vendor JSON kütüphanesi bilinçli YOK
 * (slice-1 no-new-dependency sınırı; repo'nun no-dep validator kalıbıyla tutarlı).
 */
final class JsonParse {

    static final class JsonParseException extends RuntimeException {
        JsonParseException(String message) {
            super(message);
        }
    }

    private static final int MAX_DEPTH = 64;

    private final String s;
    private int i;

    private JsonParse(String s) {
        this.s = s;
    }

    static JsonValue parse(String text) {
        if (text == null || text.isBlank()) {
            throw new JsonParseException("boş gövde");
        }
        JsonParse p = new JsonParse(text);
        p.ws();
        JsonValue v = p.value(0);
        p.ws();
        if (p.i != text.length()) {
            throw new JsonParseException("trailing garbage @" + p.i);
        }
        return v;
    }

    private JsonValue value(int depth) {
        if (depth > MAX_DEPTH) {
            throw new JsonParseException("derinlik sınırı aşıldı");
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
                throw new JsonParseException("duplicate key: " + key);
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
                throw new JsonParseException("object'te ',' veya '}' bekleniyordu @" + (i - 1));
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
                throw new JsonParseException("array'de ',' veya ']' bekleniyordu @" + (i - 1));
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
                            throw new JsonParseException("kısa \\u escape");
                        }
                        sb.append((char) Integer.parseInt(s.substring(i, i + 4), 16));
                        i += 4;
                    }
                    default -> throw new JsonParseException("geçersiz escape: \\" + e);
                }
            } else if (c < 0x20) {
                throw new JsonParseException("string içinde kontrol karakteri");
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
        double d;
        try {
            d = Double.parseDouble(raw);
        } catch (NumberFormatException e) {
            throw new JsonParseException("geçersiz sayı: " + raw);
        }
        if (Double.isNaN(d) || Double.isInfinite(d)) {
            throw new JsonParseException("non-finite sayı reddedilir: " + raw);
        }
        return new JsonValue.JsonNumber(d);
    }

    private JsonValue literal(String lit, JsonValue v) {
        if (!s.startsWith(lit, i)) {
            throw new JsonParseException("geçersiz literal @" + i);
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
            throw new JsonParseException("beklenmedik son");
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
            throw new JsonParseException("'" + c + "' bekleniyordu @" + (i - 1));
        }
    }
}
