package com.ats.app.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.dsr.DsrService.ErasureReceipt;
import com.ats.dsr.DsrService.ErasureStatus;
import com.ats.dsr.ErasureExecutionStore.ExecutionState;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import org.junit.jupiter.api.Test;

class DsarApiControllerConflictTest {

    @Test
    void conflict_status_race_upgrades_terminal_truth_to_replay_receipt() {
        ErasureReceipt receipt = new ErasureReceipt("iv/dsar-1", 2, 4, 1, false);
        ErasureStatus terminal = new ErasureStatus(
                "iv/dsar-1", ExecutionState.FULFILLED, 8, 8, 0, receipt);

        DsarApiController.ConflictProjection projected =
                DsarApiController.projectConflict(Outcome.ok(terminal));

        assertTrue(projected.terminal());
        assertEquals(receipt, projected.terminalReceipt());
        assertEquals(0, projected.retryAfterSeconds());
    }

    @Test
    void running_conflict_keeps_read_recovery_signal_even_at_lease_clock_edge() {
        ErasureStatus running = new ErasureStatus(
                "iv/dsar-1", ExecutionState.RUNNING, 3, 8, 0, null);

        DsarApiController.ConflictProjection projected =
                DsarApiController.projectConflict(Outcome.ok(running));

        assertFalse(projected.terminal());
        assertEquals(1, projected.retryAfterSeconds());
    }

    @Test
    void non_status_conflict_does_not_mint_retry_or_terminal_truth() {
        Outcome<ErasureStatus> unavailable = Outcome.fail(
                OutcomeCode.CONFLICT, "execution farklı tür ile bağlı");

        DsarApiController.ConflictProjection projected =
                DsarApiController.projectConflict(unavailable);

        assertFalse(projected.terminal());
        assertEquals(0, projected.retryAfterSeconds());
    }
}
