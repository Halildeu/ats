package com.ats.screening;

/**
 * KAPALI kapsama (coverage) durumu. Tarayıcı fail-closed'dur: yalnız {@link #SUPPORTED}
 * durumunda "bulgu-yok" gerçekten "temiz (CLEAR)" anlamına gelir. Diğer üç durumda bulgu
 * listesi boş olsa bile sonuç TEMİZ SAYILMAZ — girdi taranamadığı için sessiz-yeşil verilmez
 * (bkz. {@link ScreeningResult#isClear()}).
 */
public enum Coverage {
    /** Girdi desteklenen dil/biçimde tarandı; bulgu listesi otoritatiftir. */
    SUPPORTED,
    /** Girdinin baskın yazımı desteklenen dillerin (Latin/TR-EN) dışında → taranamadı. */
    UNSUPPORTED_LANGUAGE,
    /** Girdi bozuk (null / eşsiz surrogate / yasak kontrol-karakteri / aşırı-uzun) → taranamadı. */
    MALFORMED_INPUT,
    /** Kanonik-policy yüklenemedi/yok → tarayıcı otorite değil (asla sessiz-temiz vermez). */
    POLICY_UNAVAILABLE
}
