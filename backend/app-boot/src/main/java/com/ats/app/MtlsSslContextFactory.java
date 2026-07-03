package com.ats.app;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManagerFactory;

/**
 * slice-38: live-stt kanonik mTLS yolu için SSLContext üreticisi (JDK KeyStore —
 * vendor SDK yok). PKCS12-only (Codex: PEM key-parsing ayrı slice riski); keystore
 * (client cert+key) + truststore (server-CA). Parola/path/subject/fingerprint
 * LOGLANMAZ; hostname-verification bu katmanda KAPATILMAZ (adaptör JDK default'unu
 * kullanır — server SAN ↔ URL host eşleşmeli).
 */
final class MtlsSslContextFactory {

    private MtlsSslContextFactory() {
    }

    static SSLContext fromPkcs12(Path keyStorePath, String keyStorePassword, Path trustStorePath) {
        if (keyStorePath == null || trustStorePath == null) {
            throw new IllegalStateException(
                    "mTLS required: ats.ai.mtls.key-store-path + trust-store-path zorunlu (fail-closed)");
        }
        if (keyStorePassword == null || keyStorePassword.isBlank()) {
            throw new IllegalStateException(
                    "mTLS required: ats.ai.mtls.key-store-password zorunlu (fail-closed)");
        }
        try {
            char[] pass = keyStorePassword.toCharArray();
            KeyStore keyStore = loadPkcs12(keyStorePath, pass);
            KeyManagerFactory kmf =
                    KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
            kmf.init(keyStore, pass);
            KeyStore trustStore = loadPkcs12(trustStorePath, pass);
            TrustManagerFactory tmf =
                    TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
            tmf.init(trustStore);
            SSLContext ctx = SSLContext.getInstance("TLS");
            ctx.init(kmf.getKeyManagers(), tmf.getTrustManagers(), null);
            return ctx;
        } catch (Exception e) {
            // Mesaj redacted: yol/parola/subject sızdırmaz, yalnız hata sınıfı.
            throw new IllegalStateException(
                    "mTLS SSLContext kurulamadı (fail-closed): " + e.getClass().getSimpleName());
        }
    }

    private static KeyStore loadPkcs12(Path path, char[] pass) throws Exception {
        if (!Files.isReadable(path)) {
            throw new IllegalStateException("PKCS12 okunamıyor (fail-closed)");
        }
        KeyStore ks = KeyStore.getInstance("PKCS12");
        try (InputStream in = Files.newInputStream(path)) {
            ks.load(in, pass);
        }
        return ks;
    }
}
