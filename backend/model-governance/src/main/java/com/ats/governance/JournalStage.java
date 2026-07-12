package com.ats.governance;

/**
 * gov1-1d journal yaşam-döngüsü aşaması (kapalı küme; WORM payload {@code stage} token'ı). Hem
 * adapter (yazım) hem projeksiyon (okuma/state-machine) bu kanonik token'ı paylaşır — vokabüler
 * drift YASAK. {@code terminal()} = authorized-olmayan (yaşam-döngüsü sonu); {@code postProvider()}
 * = sağlayıcı çağrıldıktan SONRAKİ terminal (crash-gap projeksiyonu için ayrım).
 */
enum JournalStage {

    /** Çağrı-öncesi authorized (provider'dan hemen önce). */
    AUTHORIZED("authorized", false, false),
    /** Terminal, pre-provider: preflight RED (provider hiç çağrılmadı). */
    PREFLIGHT_REJECTED("preflight_rejected", true, false),
    /** Terminal, post-provider: provider çağrısı başarısız. */
    PROVIDER_REJECTED("provider_rejected", true, true),
    /** Terminal, post-provider: sonuç-sonrası doğrulama DENY. */
    VERIFICATION_REJECTED("verification_rejected", true, true),
    /** Terminal, post-provider: doğrulanmış ALLOW. */
    ATTESTED("attested", true, true);

    private final String token;
    private final boolean terminal;
    private final boolean postProvider;

    JournalStage(String token, boolean terminal, boolean postProvider) {
        this.token = token;
        this.terminal = terminal;
        this.postProvider = postProvider;
    }

    String token() {
        return token;
    }

    boolean terminal() {
        return terminal;
    }

    boolean postProvider() {
        return postProvider;
    }

    /** Token → aşama; bilinmeyen token → null (çağıran bozuk-satır olarak ele alır, fail-closed). */
    static JournalStage fromToken(String token) {
        if (token == null) {
            return null;
        }
        for (JournalStage s : values()) {
            if (s.token.equals(token)) {
                return s;
            }
        }
        return null;
    }
}
