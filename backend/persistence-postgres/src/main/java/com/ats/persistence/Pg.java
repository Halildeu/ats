package com.ats.persistence;

import com.ats.application.ApplicationIntakeService;
import com.ats.application.ResumeImportService;
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
            // #242 C: süregelenlik yalnız DOĞRU olduğunda yazılır — "false" değeri
            // her satıra eklemek, eski satırlarla yeni satırları ayırt edilemez
            // kılar ve boş-alan-yazmama kuralını bozar.
            if (e.ongoing()) row.put("ongoing", JsonValue.of(true));
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
            if (e.ongoing()) row.put("ongoing", JsonValue.of(true));
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

    /**
     * #215 C: JSONB girdilerini okur. Alan YOKSA boş dize verilir — record'un
     * compact constructor'ı `trimToEmpty` uyguladığı için yazma tarafı zaten boş
     * alanı hiç yazmıyor (`putIfPresent`), yani eksik anahtar normal durumdur.
     * Beklenmeyen ŞEKİL (dizi değil, öğe nesne değil) sessizce yutulmaz: okuma
     * fail eder, çünkü İK'ya eksik veri göstermek yanlış veri göstermekten iyi değil.
     */
    private static Map<String, String> entryFields(JsonValue item) throws SQLException {
        if (!(item instanceof JsonValue.JsonObject obj)) {
            throw new SQLException("jsonb girdi nesnesi bekleniyordu");
        }
        Map<String, String> out = new LinkedHashMap<>();
        for (var e : obj.values().entrySet()) {
            if (e.getValue() instanceof JsonValue.JsonString str) out.put(e.getKey(), str.value());
        }
        return out;
    }

    private static List<JsonValue> entryItems(String json) throws SQLException {
        try {
            if (json == null || json.isBlank()) return List.of();
            if (!(JsonCodec.parse(json) instanceof JsonValue.JsonArray arr)) {
                throw new SQLException("jsonb array bekleniyordu");
            }
            return arr.items();
        } catch (JsonCodec.JsonCodecException e) {
            throw new SQLException("jsonb parse edilemedi: " + e.getMessage());
        }
    }

    /**
     * #242 C: {@code ongoing} JSON'da boolean'dır. {@link #entryFields} yalnız
     * dizeleri topladığı için ayrı okunur — aksi hâlde bayrak SESSİZCE düşerdi
     * ve süregelen iş, bitişi bilinmeyen iş gibi görünürdü (hesap onu yok sayar).
     */
    private static boolean entryFlag(JsonValue item, String key) {
        return item instanceof JsonValue.JsonObject obj
                && obj.values().get(key) instanceof JsonValue.JsonBool b
                && b.value();
    }

    static List<ApplicationIntakeService.ExperienceEntry> experienceEntriesFromJson(String json)
            throws SQLException {
        List<ApplicationIntakeService.ExperienceEntry> out = new ArrayList<>();
        for (JsonValue item : entryItems(json)) {
            Map<String, String> f = entryFields(item);
            out.add(new ApplicationIntakeService.ExperienceEntry(
                    f.get("title"), f.get("company"), f.get("startDate"),
                    f.get("endDate"), entryFlag(item, "ongoing"), f.get("description")));
        }
        return out;
    }

    static List<ApplicationIntakeService.EducationEntry> educationEntriesFromJson(String json)
            throws SQLException {
        List<ApplicationIntakeService.EducationEntry> out = new ArrayList<>();
        for (JsonValue item : entryItems(json)) {
            Map<String, String> f = entryFields(item);
            out.add(new ApplicationIntakeService.EducationEntry(
                    f.get("school"), f.get("degree"), f.get("field"),
                    f.get("startYear"), f.get("endYear"), entryFlag(item, "ongoing"),
                    f.get("description")));
        }
        return out;
    }

    /**
     * #218: ayrıştırıcının gruplayıp yayınladığı kayıt önerileri. Boş alan
     * yazılmaz ({@link #putIfPresent}), yani eksik anahtar normal durumdur.
     */
    static String proposedEntriesToJson(List<ResumeImportService.ProposedEntry> entries) {
        List<JsonValue> items = new ArrayList<>();
        for (var e : entries) {
            Map<String, JsonValue> row = new LinkedHashMap<>();
            putIfPresent(row, "title", e.title());
            putIfPresent(row, "subtitle", e.subtitle());
            putIfPresent(row, "dateText", e.dateText());
            putIfPresent(row, "description", e.description());
            items.add(new JsonValue.JsonObject(row));
        }
        return JsonCodec.canonical(new JsonValue.JsonArray(items));
    }

    /**
     * #218: {@code NULL} ile boş dizi AYNI ŞEY DEĞİL. {@code NULL} "bu öneri
     * gruplamadan önce yazıldı ya da gruplama güvenilir değildi" demektir ve
     * tüketici tek-blob davranışına düşer; boş dizi ise "gruplandı, sonuç boş"
     * anlamına gelirdi ve o durum hiç yazılmaz. Bu yüzden {@code null} girdi
     * sessizce boş listeye çevrilmez — çağıran ayrımı görsün diye boş liste
     * döner ama sütun okunurken null kontrolü çağırana bırakılır.
     */
    static List<ResumeImportService.ProposedEntry> proposedEntriesFromJson(String json)
            throws SQLException {
        if (json == null) return List.of();
        List<ResumeImportService.ProposedEntry> out = new ArrayList<>();
        for (JsonValue item : entryItems(json)) {
            Map<String, String> f = entryFields(item);
            out.add(new ResumeImportService.ProposedEntry(
                    f.get("title"), f.get("subtitle"), f.get("dateText"), f.get("description")));
        }
        return out;
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
