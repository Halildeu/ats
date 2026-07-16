package com.ats.app;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import java.lang.reflect.Method;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;

/** AI'yı çağrılabilir yapan bütün üretim bean'leri exact explicit flag'e bağlı kalır. */
class AiConditionalWiringContractTest {

    @Test
    void every_ai_callable_bean_requires_exact_ats_ai_enabled_true() {
        Set<String> guarded = Set.of(
                "audioAccessGrants",
                "aiProvider",
                "segmentSanitizer",
                "transcriptionService",
                "citationService",
                "authorizedModelBindings",
                "modelGovernanceGate",
                "modelGovernanceJournal");
        for (String methodName : guarded) {
            Method method = java.util.Arrays.stream(WiringConfig.class.getDeclaredMethods())
                    .filter(m -> m.getName().equals(methodName))
                    .findFirst()
                    .orElseThrow();
            ConditionalOnProperty condition = method.getAnnotation(ConditionalOnProperty.class);
            assertNotNull(condition, methodName + " explicit AI gate taşımıyor");
            assertEquals("ats.ai", condition.prefix());
            assertArrayEquals(new String[] {"enabled"}, condition.name());
            assertEquals("true", condition.havingValue());
            assertEquals(false, condition.matchIfMissing());
        }
    }
}
