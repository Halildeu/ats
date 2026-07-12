package com.ats.governance;

/**
 * gov1-1d journal yaşam-döngüsü aşaması (kapalı küme; WORM payload {@code stage} token'ı). Hem
 * adapter (yazım) hem projeksiyon (okuma/state-machine) bu kanonik token'ı paylaşır — vokabüler
 * drift YASAK. {@code terminal()} = authorized-olmayan (yaşam-döngüsü sonu); {@code postProvider()}
 * = sağlayıcı çağrıldıktan SONRAKİ terminal (COMPLETE_INVOKED sinyali); {@code requiresAuthorized()}
 * = bu terminalin ÖNCESİNDE authorized event'i beklenir mi (projeksiyon tutarlılık ekseni: preflight-red
 * authorized'sız beklenir; pre-provider/post-provider terminaller authorized'lı beklenir).
 */
enum JournalStage {

    /** Çağrı-öncesi authorized (provider'dan hemen önce). */
    AUTHORIZED("authorized", false, false, false),
    /** Terminal, pre-provider: preflight RED (provider hiç çağrılmadı; authorized YAZILMADAN önce). */
    PREFLIGHT_REJECTED("preflight_rejected", true, false, false),
    /** Terminal, pre-provider: authorized YAZILDIKTAN sonra ama provider çağrılMADAN önce hazırlık başarısız. */
    PRE_PROVIDER_REJECTED("pre_provider_rejected", true, false, true),
    /** Terminal, post-provider: provider çağrısı başarısız. */
    PROVIDER_REJECTED("provider_rejected", true, true, true),
    /** Terminal, post-provider: sonuç-sonrası doğrulama DENY. */
    VERIFICATION_REJECTED("verification_rejected", true, true, true),
    /** Terminal, post-provider: doğrulanmış ALLOW. */
    ATTESTED("attested", true, true, true);

    private final String token;
    private final boolean terminal;
    private final boolean postProvider;
    private final boolean requiresAuthorized;

    JournalStage(String token, boolean terminal, boolean postProvider, boolean requiresAuthorized) {
        this.token = token;
        this.terminal = terminal;
        this.postProvider = postProvider;
        this.requiresAuthorized = requiresAuthorized;
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

    /** Terminal'in tutarlı olabilmesi için önce bir AUTHORIZED event'i beklenir mi (projeksiyon ekseni). */
    boolean requiresAuthorized() {
        return requiresAuthorized;
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
