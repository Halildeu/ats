package com.ats.kernel;

import java.util.Optional;

/**
 * Fail-closed sonuç tipi (TS contracts/ Outcome mirror'ı). Başarısızlık her zaman
 * açık kod + reason taşır; sessiz default YOK. Sealed → exhaustiv kullanım.
 */
public sealed interface Outcome<T> permits Outcome.Ok, Outcome.Fail {

    record Ok<T>(T value) implements Outcome<T> {}

    record Fail<T>(OutcomeCode code, String reason) implements Outcome<T> {}

    static <T> Outcome<T> ok(T value) {
        return new Ok<>(value);
    }

    static <T> Outcome<T> fail(OutcomeCode code, String reason) {
        if (code == OutcomeCode.OK) {
            throw new IllegalArgumentException("fail() OK kodu alamaz");
        }
        return new Fail<>(code, reason);
    }

    default boolean isOk() {
        return this instanceof Ok<T>;
    }

    /** Ok ise değeri, değilse empty. ofNullable: Outcome&lt;Void&gt; ok(null) NPE üretmez. */
    default Optional<T> asOptional() {
        return this instanceof Ok<T> ok ? Optional.ofNullable(ok.value()) : Optional.empty();
    }
}
