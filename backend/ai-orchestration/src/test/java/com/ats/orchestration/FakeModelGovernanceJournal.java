package com.ats.orchestration;

import com.ats.contracts.governance.ModelGovernanceGate.Permit;
import com.ats.contracts.governance.ModelGovernanceJournal;
import com.ats.contracts.governance.ModelInvocationId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.util.ArrayList;
import java.util.List;

/**
 * Orkestrasyon testleri için yapılandırılabilir sahte {@link ModelGovernanceJournal} (call-count'lu +
 * çağrı-sıra kaydı + faz-bazlı append-fail simülasyonu). GERÇEK WORM append + boot-snapshot re-verify
 * adapter unit testinde ({@code EvidenceLedgerModelGovernanceJournalTest}) kanıtlanır; bu sahte yalnız
 * orkestrasyonun iki-fazlı journal ordering'ini (authorized→terminal, fail-closed dallar) çalıştırır.
 */
final class FakeModelGovernanceJournal implements ModelGovernanceJournal {

    int authorizedCalls = 0;
    int terminalCalls = 0;
    Terminal lastTerminal;
    final List<Terminal> terminals = new ArrayList<>();
    final List<String> order; // paylaşılan çağrı-sıra defteri (null olabilir)

    boolean failAuthorized = false;
    boolean failTerminal = false;                       // TÜM terminal append'leri düşür
    Class<? extends Terminal> failTerminalType = null;  // yalnız bu terminal varyantını düşür

    FakeModelGovernanceJournal() {
        this(null);
    }

    FakeModelGovernanceJournal(List<String> order) {
        this.order = order;
    }

    static FakeModelGovernanceJournal allowing() {
        return new FakeModelGovernanceJournal();
    }

    @Override
    public Outcome<JournalReceipt> recordAuthorized(InvocationContext ctx, ModelInvocationId id, Permit permit) {
        authorizedCalls++;
        if (order != null) {
            order.add("authorized");
        }
        if (failAuthorized) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "AUDIT_UNAVAILABLE");
        }
        return Outcome.ok(new JournalReceipt("fake-journal-auth-" + authorizedCalls));
    }

    @Override
    public Outcome<JournalReceipt> recordTerminal(InvocationContext ctx, ModelInvocationId id, Terminal terminal) {
        terminalCalls++;
        lastTerminal = terminal;
        terminals.add(terminal);
        if (order != null) {
            order.add("terminal:" + terminal.getClass().getSimpleName());
        }
        boolean shouldFail = failTerminal
                || (failTerminalType != null && failTerminalType.isInstance(terminal));
        if (shouldFail) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "AUDIT_UNAVAILABLE");
        }
        return Outcome.ok(new JournalReceipt("fake-journal-term-" + terminalCalls));
    }
}
