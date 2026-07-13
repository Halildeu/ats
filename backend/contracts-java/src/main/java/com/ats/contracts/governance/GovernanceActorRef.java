package com.ats.contracts.governance;

import java.util.regex.Pattern;

/**
 * Bir model-governance transition'ını (approval/revocation) KİMİN gerçekleştirdiğine dair BOUNDED,
 * doğrulanmış OPAK referans (ör. admin/owner kimlik-anahtarı, servis-hesabı takma-adı). WORM'a yazılır,
 * bu yüzden {@link ApprovedModelSpec} ile aynı fail-closed değer disiplinine tabidir: boş-değil, ≤128,
 * izin-listesi {@code [A-Za-z0-9._:@/-]} (kontrol/boşluk YOK), {@code ://} reddedilir (URL/secret sızıntı
 * guard'ı). Ham e-posta/telefon/UPN gibi PII veya bearer/token gibi secret TAŞIMAZ (opak referans;
 * veri-minimizasyonu). Değişmez değer nesnesi; kurucu formatı fail-closed doğrular.
 */
public record GovernanceActorRef(String value) {

    private static final int MAX_LEN = 128;
    private static final Pattern VALUE = Pattern.compile("[A-Za-z0-9._:@/-]{1,128}");

    public GovernanceActorRef {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("GovernanceActorRef boş olamaz (fail-closed)");
        }
        if (value.length() > MAX_LEN) {
            throw new IllegalArgumentException(
                    "GovernanceActorRef uzunluk sınırı aşıldı (<=" + MAX_LEN + "): " + value.length());
        }
        if (!VALUE.matcher(value).matches()) {
            throw new IllegalArgumentException(
                    "GovernanceActorRef izin-listesi dışı karakter [A-Za-z0-9._:@/-] "
                    + "(kontrol/boşluk/URL/secret YOK): " + value);
        }
        if (value.contains("://")) {
            throw new IllegalArgumentException(
                    "GovernanceActorRef '://' içeremez (URL/secret sızıntı guard'ı): " + value);
        }
    }
}
