package com.ats.app.operator;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.SQLFeatureNotSupportedException;
import java.util.logging.Logger;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;

class ModelGovernanceOperatorPreflightTest {

    @Test
    void only_sqlstate_08_is_worm_unavailable_and_raw_error_is_never_printed() throws Exception {
        ByteArrayOutputStream unavailableErr = new ByteArrayOutputStream();
        int unavailable = ModelGovernanceOperatorCli.preflightAndClassify(
                failingDataSource("jdbc:postgresql://secret-host/secret-db", "08001"),
                new PrintStream(unavailableErr, true, StandardCharsets.UTF_8));
        assertEquals(3, unavailable);
        assertEquals(
                "MODEL_GOVERNANCE_OPERATOR:v1 outcome=REJECTED code=WORM_UNAVAILABLE\n",
                unavailableErr.toString(StandardCharsets.UTF_8));

        ByteArrayOutputStream authorityErr = new ByteArrayOutputStream();
        int authority = ModelGovernanceOperatorCli.preflightAndClassify(
                failingDataSource("operator-password-must-not-be-printed", "28000"),
                new PrintStream(authorityErr, true, StandardCharsets.UTF_8));
        assertEquals(4, authority);
        assertEquals(
                "MODEL_GOVERNANCE_OPERATOR:v1 outcome=FAILED code=OPERATOR_FAILURE\n",
                authorityErr.toString(StandardCharsets.UTF_8));
    }

    private static DataSource failingDataSource(String message, String sqlState) {
        return new DataSource() {
            @Override
            public Connection getConnection() throws SQLException {
                throw new SQLException(message, sqlState);
            }

            @Override
            public Connection getConnection(String username, String password) throws SQLException {
                throw new SQLException(message, sqlState);
            }

            @Override
            public PrintWriter getLogWriter() {
                return null;
            }

            @Override
            public void setLogWriter(PrintWriter out) {}

            @Override
            public void setLoginTimeout(int seconds) {}

            @Override
            public int getLoginTimeout() {
                return 0;
            }

            @Override
            public Logger getParentLogger() throws SQLFeatureNotSupportedException {
                throw new SQLFeatureNotSupportedException();
            }

            @Override
            public <T> T unwrap(Class<T> iface) throws SQLException {
                throw new SQLException("not a wrapper", "0A000");
            }

            @Override
            public boolean isWrapperFor(Class<?> iface) {
                return false;
            }
        };
    }
}
