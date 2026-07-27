package com.ats.persistence;

import com.ats.application.ApplicationStatus;
import com.ats.application.CandidateLoginStore;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import javax.sql.DataSource;

/** #235 aday girişi adapter'ı — plain JDBC, V19 tabloları. */
public final class PostgresCandidateLoginStore implements CandidateLoginStore {

    private final DataSource ds;

    public PostgresCandidateLoginStore(DataSource ds) {
        this.ds = ds;
    }

    @Override
    public Outcome<Integer> countChallengesSince(String emailNormalized, String sinceIso) {
        String sql = """
                SELECT count(*) FROM ats_candidate_login_challenge
                 WHERE email_normalized = ? AND created_at >= ?
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, emailNormalized);
            ps.setTimestamp(2, timestamp(sinceIso));
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return Outcome.ok(rs.getInt(1));
            }
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<Boolean> hasApplications(String emailNormalized) {
        // #229 İK "diğer başvurular" eşleşmesiyle aynı kural: normalize e-posta,
        // silinmiş kayıtlar (personal_data_erased_at) yok sayılır.
        String sql = """
                SELECT EXISTS (
                    SELECT 1 FROM ats_application a
                     WHERE lower(btrim(a.email)) = ?
                       AND btrim(a.email) <> ''
                       AND a.personal_data_erased_at IS NULL)
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, emailNormalized);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return Outcome.ok(rs.getBoolean(1));
            }
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<Void> insertChallenge(
            String emailNormalized, String codeDigest, String createdAtIso, String expiresAtIso) {
        String sql = """
                INSERT INTO ats_candidate_login_challenge
                    (email_normalized, code_digest, created_at, expires_at)
                VALUES (?, ?, ?, ?)
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, emailNormalized);
            ps.setString(2, codeDigest);
            ps.setTimestamp(3, timestamp(createdAtIso));
            ps.setTimestamp(4, timestamp(expiresAtIso));
            ps.executeUpdate();
            return Outcome.ok(null);
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<VerifyState> verifyChallenge(
            String emailNormalized, String codeDigest, String nowIso, int maxAttempts) {
        // Tek transaction: en yeni aktif challenge FOR UPDATE ile kilitlenir,
        // sayaç HER denemede artar, digest ancak bütçe içindeyse karşılaştırılır.
        // Kilit olmadan iki paralel deneme aynı attempt_count'u okur ve bütçe aşılır.
        String select = """
                SELECT id, code_digest, attempt_count
                  FROM ats_candidate_login_challenge
                 WHERE email_normalized = ? AND consumed_at IS NULL AND expires_at > ?
                 ORDER BY created_at DESC, id DESC
                 LIMIT 1
                 FOR UPDATE
                """;
        try (Connection c = ds.getConnection()) {
            c.setAutoCommit(false);
            try {
                long id;
                String storedDigest;
                int attempts;
                try (PreparedStatement ps = c.prepareStatement(select)) {
                    ps.setString(1, emailNormalized);
                    ps.setTimestamp(2, timestamp(nowIso));
                    try (ResultSet rs = ps.executeQuery()) {
                        if (!rs.next()) {
                            c.rollback();
                            return Outcome.ok(VerifyState.INVALID);
                        }
                        id = rs.getLong(1);
                        storedDigest = rs.getString(2);
                        attempts = rs.getInt(3);
                    }
                }
                if (attempts >= maxAttempts) {
                    // Sayaç zaten tavanda — artırmadan kilidi raporla.
                    c.commit();
                    return Outcome.ok(VerifyState.LOCKED);
                }
                boolean matched = constantTimeEquals(storedDigest, codeDigest);
                try (PreparedStatement ps = c.prepareStatement(
                        "UPDATE ats_candidate_login_challenge SET attempt_count = ?, "
                                + "consumed_at = ? WHERE id = ?")) {
                    ps.setInt(1, attempts + 1);
                    ps.setTimestamp(2, matched ? timestamp(nowIso) : null);
                    ps.setLong(3, id);
                    ps.executeUpdate();
                }
                c.commit();
                if (matched) {
                    return Outcome.ok(VerifyState.VERIFIED);
                }
                return Outcome.ok(
                        attempts + 1 >= maxAttempts ? VerifyState.LOCKED : VerifyState.INVALID);
            } catch (SQLException inner) {
                c.rollback();
                throw inner;
            } finally {
                c.setAutoCommit(true);
            }
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<Void> insertSession(
            String tokenDigest, String emailNormalized, String createdAtIso, String expiresAtIso) {
        String sql = """
                INSERT INTO ats_candidate_session
                    (token_digest, email_normalized, created_at, expires_at)
                VALUES (?, ?, ?, ?)
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tokenDigest);
            ps.setString(2, emailNormalized);
            ps.setTimestamp(3, timestamp(createdAtIso));
            ps.setTimestamp(4, timestamp(expiresAtIso));
            ps.executeUpdate();
            return Outcome.ok(null);
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<String> findSessionEmail(String tokenDigest, String nowIso) {
        String sql = """
                SELECT email_normalized FROM ats_candidate_session
                 WHERE token_digest = ? AND expires_at > ?
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tokenDigest);
            ps.setTimestamp(2, timestamp(nowIso));
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return Outcome.fail(OutcomeCode.NOT_FOUND, "session not found");
                }
                return Outcome.ok(rs.getString(1));
            }
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<List<CandidateApplicationRow>> listApplicationsByEmail(String emailNormalized) {
        // Slug/title ilan tablosundan gelir (ats_application'da job_slug KOLONU
        // YOK — #229 sorgusuyla aynı JOIN). INNER: her başvuru bir ilana bağlı.
        String sql = """
                SELECT a.public_ref, j.slug, j.title, a.status, a.created_at, a.updated_at
                  FROM ats_application a
                  JOIN ats_job_posting j
                    ON j.tenant_id = a.tenant_id AND j.job_id = a.job_id
                 WHERE lower(btrim(a.email)) = ?
                   AND btrim(a.email) <> ''
                   AND a.personal_data_erased_at IS NULL
                 ORDER BY a.created_at DESC, a.public_ref
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, emailNormalized);
            List<CandidateApplicationRow> rows = new ArrayList<>();
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    rows.add(new CandidateApplicationRow(
                            rs.getString(1),
                            rs.getString(2),
                            rs.getString(3),
                            ApplicationStatus.valueOf(rs.getString(4)),
                            rs.getTimestamp(5).toInstant().toString(),
                            rs.getTimestamp(6).toInstant().toString()));
                }
            }
            return Outcome.ok(List.copyOf(rows));
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    /**
     * Digest karşılaştırması sabit zamanlı — kod digest'i saldırgan girdisinden
     * türese de kısa devre eşitlik zamanlama kanalı bırakmasın.
     */
    private static boolean constantTimeEquals(String a, String b) {
        return MessageDigest.isEqual(
                a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }

    private static Timestamp timestamp(String iso) {
        return Timestamp.from(Instant.parse(iso));
    }
}
