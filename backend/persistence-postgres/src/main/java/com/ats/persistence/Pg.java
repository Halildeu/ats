package com.ats.persistence;

import com.ats.application.ApplicationIntakeService;
import com.ats.kernel.JsonCodec;
import com.ats.kernel.JsonValue;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** slice-8b adapter ortak yardımcıları (paket-içi). */
final class Pg {

    private Pg() {}

    static <T> Outcome<T> sqlFail(SQLException ex) {
        // içerik sızdırmaz: yalnız SQLState
        return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "DB hatası (fail-closed): " + ex.getSQLState());
    }

    static String newKey(String interviewId, String prefix) {
        return interviewId + "/" + prefix + "-" + UUID.randomUUID();
    }

    /**
     * #215: yapısal deneyim girdileri kanonik JSON dizisine. Boş alanlar yazılmaz —
     * aday yalnız unvan girdiyse satır {"title": "..."} olur, beş boş anahtar taşımaz.
     */
    static String experienceEntriesToJson(
            List<ApplicationIntakeService.ExperienceEntry> entries) {
        List<JsonValue> items = new ArrayList<>();
        for (var e : entries) {
            Map<String, JsonValue> row = new LinkedHashMap<>();
            putIfPresent(row, "title", e.title());
            putIfPresent(row, "company", e.company());
            putIfPresent(row, "startDate", e.startDate());
            putIfPresent(row, "endDate", e.endDate());
            putIfPresent(row, "description", e.description());
            items.add(new JsonValue.JsonObject(row));
        }
        return JsonCodec.canonical(new JsonValue.JsonArray(items));
    }

    /** #215: yapısal eğitim girdileri; gerekçe {@link #experienceEntriesToJson} ile aynı. */
    static String educationEntriesToJson(
            List<ApplicationIntakeService.EducationEntry> entries) {
        List<JsonValue> items = new ArrayList<>();
        for (var e : entries) {
            Map<String, JsonValue> row = new LinkedHashMap<>();
            putIfPresent(row, "school", e.school());
            putIfPresent(row, "degree", e.degree());
            putIfPresent(row, "field", e.field());
            putIfPresent(row, "startYear", e.startYear());
            putIfPresent(row, "endYear", e.endYear());
            putIfPresent(row, "description", e.description());
            items.add(new JsonValue.JsonObject(row));
        }
        return JsonCodec.canonical(new JsonValue.JsonArray(items));
    }

    private static void putIfPresent(Map<String, JsonValue> row, String key, String value) {
        if (value != null && !value.isEmpty()) row.put(key, JsonValue.of(value));
    }

    static String stringsToJson(List<String> values) {
        List<JsonValue> items = new ArrayList<>();
        for (String v : values) {
            items.add(JsonValue.of(v));
        }
        return JsonCodec.canonical(new JsonValue.JsonArray(items));
    }

    static List<String> stringsFromJson(String json) throws SQLException {
        try {
            if (!(JsonCodec.parse(json) instanceof JsonValue.JsonArray arr)) {
                throw new SQLException("jsonb array bekleniyordu");
            }
            List<String> out = new ArrayList<>();
            for (JsonValue item : arr.items()) {
                if (!(item instanceof JsonValue.JsonString s)) {
                    throw new SQLException("jsonb string-array bekleniyordu");
                }
                out.add(s.value());
            }
            return out;
        } catch (JsonCodec.JsonCodecException e) {
            throw new SQLException("jsonb parse edilemedi: " + e.getMessage());
        }
    }

    static String intsToJson(List<Integer> values) {
        List<JsonValue> items = new ArrayList<>();
        for (Integer v : values) {
            items.add(JsonValue.of((double) v));
        }
        return JsonCodec.canonical(new JsonValue.JsonArray(items));
    }

    static List<Integer> intsFromJson(String json) throws SQLException {
        try {
            if (!(JsonCodec.parse(json) instanceof JsonValue.JsonArray arr)) {
                throw new SQLException("jsonb array bekleniyordu");
            }
            List<Integer> out = new ArrayList<>();
            for (JsonValue item : arr.items()) {
                if (!(item instanceof JsonValue.JsonNumber n) || n.value() != Math.rint(n.value())) {
                    throw new SQLException("jsonb int-array bekleniyordu");
                }
                out.add((int) n.value());
            }
            return out;
        } catch (JsonCodec.JsonCodecException e) {
            throw new SQLException("jsonb parse edilemedi: " + e.getMessage());
        }
    }
}
