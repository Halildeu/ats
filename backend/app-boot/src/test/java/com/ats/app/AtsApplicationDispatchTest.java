package com.ats.app;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.ats.app.operator.ModelGovernanceOperatorCli;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class AtsApplicationDispatchTest {

    @Test
    void operator_command_bypasses_normal_spring_composition() {
        AtomicInteger operatorRuns = new AtomicInteger();
        AtomicInteger springRuns = new AtomicInteger();

        int exit = AtsApplication.launch(
                new String[] {ModelGovernanceOperatorCli.COMMAND},
                () -> {
                    operatorRuns.incrementAndGet();
                    return 7;
                },
                springRuns::incrementAndGet);

        assertEquals(7, exit);
        assertEquals(1, operatorRuns.get());
        assertEquals(0, springRuns.get(), "operator command must never start normal Spring/Flyway boot");
    }

    @Test
    void normal_command_starts_spring_and_never_operator() {
        AtomicInteger operatorRuns = new AtomicInteger();
        AtomicInteger springRuns = new AtomicInteger();

        int exit = AtsApplication.launch(
                new String[0],
                () -> {
                    operatorRuns.incrementAndGet();
                    return 9;
                },
                springRuns::incrementAndGet);

        assertEquals(0, exit);
        assertEquals(0, operatorRuns.get());
        assertEquals(1, springRuns.get());
    }
}
