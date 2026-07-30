package com.ats.application;

import com.ats.kernel.Outcome;

/**
 * #235: giriş kodunu adaya ulaştıran port. Tek görev tek metod — şablon,
 * dil, sağlayıcı adapter'ın işi.
 *
 * <p>Fail-closed sözleşme: adapter yapılandırılmamışsa {@link #configured()}
 * false döner ve istek ucu 503 verir. "Gönderdim" deyip sessizce hiçbir şey
 * yapmayan bir adapter YASAK — aday kod bekler, kod asla gelmez ve arıza
 * görünmez olurdu.
 */
public interface OtpMailSender {

    boolean configured();

    /**
     * @param code düz metin tek kullanımlık kod — YALNIZ mail gövdesine girer;
     *     log'a, hata mesajına veya başka kalıcı yüzeye yazılmaz
     */
    Outcome<Void> sendLoginCode(String email, String code);
}
