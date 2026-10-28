"""Admission/replay coordinator; authenticated sender comes from the HTTP gate."""
from .ledger import Receipt, LedgerUnavailable
from .results import IntakeAdmissionError, IntakeRequest, IntakeResponse
from .service import simulate_request


class ReplayReady(Exception):
    def __init__(self, response):
        self.response = response


def simulate_durable(request, sender, layouts, ledger, trace_id, *, receipt=None):
    request = IntakeRequest.model_validate(request.model_dump())
    if ledger is None:
        raise LedgerUnavailable()
    replay = ledger.lookup(sender, request, trace_id) if receipt is None else None
    if replay is not None:
        return IntakeResponse.model_validate(replay)
    if layouts is None:
        raise IntakeAdmissionError(503, 'intake_unavailable')
    def pin(snapshot):
        nonlocal receipt
        if receipt is not None:
            ledger.pin_received(receipt, snapshot)
            return
        owned = ledger.admit(sender, request, trace_id, snapshot)
        if not isinstance(owned, Receipt):
            raise ReplayReady(owned)
        receipt = owned
    def prepared(index, digest, size):
        ledger.prepared(receipt, index, digest, size)
    try:
        result = simulate_request(request, layouts, trace_id, on_pinned=pin, on_prepared=prepared)
    except ReplayReady as replay:
        return IntakeResponse.model_validate(replay.response)
    ledger.complete_simulation(receipt, result)
    return result
