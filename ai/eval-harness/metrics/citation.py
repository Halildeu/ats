"""Citation precision/recall + unsupported-claim + fail-closed (ATS-0004 Gate C).

'support' (bir iddianın citation'ı gerçekten destekliyor mu) = SKELETON'da predicted
citation span'ı bir ground-truth geçerli span ile ÖRTÜŞÜYOR mu (proxy).

NOT (üretim): overlap yerine ENTAILMENT (NLI) ile değiştir (ADR-0043 entailment-citation);
`support_fn` hook'u aynı arayüzde gerçek modeli alır. fail_closed = SERT invariant (=1.0):
desteklenmeyen hiçbir iddia 'onaylı/gösterilen' olamaz.
"""
from __future__ import annotations


def _overlaps(span, spans) -> bool:
    if not span:
        return False
    a, b = span["start"], span["end"]
    return any(a < s["end"] and s["start"] < b for s in spans)


def _default_support(claim: dict) -> bool:
    return _overlaps(claim.get("predicted_citation"), claim.get("ground_truth_valid_spans", []))


def citation_metrics(claims: list[dict], support_fn=None) -> dict:
    """claims[i] = {
        predicted_citation: {start,end} | null,   # sistemin gösterdiği alıntı
        shown_as_supported: bool,                  # 'desteklenmiş/onaylı' diye sunuldu mu
        ground_truth_valid_spans: [{start,end}],   # boş => geçerli alıntı YOK (iddia desteklenemez)
    }
    support_fn(claim)->bool : opsiyonel gerçek entailment; default = span-overlap proxy.
    """
    support = support_fn or _default_support
    predicted = [c for c in claims if c.get("predicted_citation")]
    correct = [c for c in predicted if support(c)]
    have_valid = [c for c in claims if c.get("ground_truth_valid_spans")]
    shown = [c for c in claims if c.get("shown_as_supported")]
    unsupported = [c for c in claims if not support(c)]
    unsupported_shown = [c for c in shown if not support(c)]

    precision = len(correct) / len(predicted) if predicted else (1.0 if not have_valid else 0.0)
    recall = len(correct) / len(have_valid) if have_valid else 1.0
    unsupported_claim_rate = len(unsupported_shown) / len(shown) if shown else 0.0
    fail_closed_rate = (1.0 - len(unsupported_shown) / len(unsupported)) if unsupported else 1.0

    return {
        "citation_precision": precision,
        "citation_recall": recall,
        "unsupported_claim_rate": unsupported_claim_rate,
        "fail_closed_rate": fail_closed_rate,
        "total_claims": len(claims),
        "shown": len(shown),
        "unsupported_shown": len(unsupported_shown),
    }
