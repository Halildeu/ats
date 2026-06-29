"""Eval metrik birim testleri — harness'in kendisi güvenilir olmadan ölçüme güvenilmez."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from metrics import wer, der, citation_metrics  # noqa: E402


# ---- WER ----
def test_wer_identical_zero():
    assert wer("merhaba dünya", "merhaba dünya")["wer"] == 0.0


def test_wer_one_substitution():
    r = wer("bir iki üç dört", "bir iki üç beş")  # 1 sub / 4 = 0.25
    assert r["substitutions"] == 1 and r["wer"] == 0.25


def test_wer_deletion_and_insertion():
    assert wer("a b c", "a c")["deletions"] == 1          # 1 del / 3
    assert wer("a c", "a b c")["insertions"] == 1         # 1 ins / 2


def test_wer_empty_reference():
    assert wer("", "")["wer"] == 0.0
    assert wer("", "x")["wer"] == 1.0


# ---- DER ----
def test_der_perfect_mapping_zero():
    ref = [{"start": 0, "end": 1, "speaker": "A"}, {"start": 1, "end": 2, "speaker": "B"}]
    hyp = [{"start": 0, "end": 1, "speaker": "X"}, {"start": 1, "end": 2, "speaker": "Y"}]
    assert der(ref, hyp)["der"] == 0.0  # X->A, Y->B


def test_der_single_speaker_confusion():
    ref = [{"start": 0, "end": 1, "speaker": "A"}, {"start": 1, "end": 2, "speaker": "B"}]
    hyp = [{"start": 0, "end": 2, "speaker": "X"}]  # tek konuşmacı → yarısı confusion
    assert abs(der(ref, hyp)["der"] - 0.5) < 1e-9


def test_der_missed_speech():
    ref = [{"start": 0, "end": 2, "speaker": "A"}]
    hyp = [{"start": 0, "end": 1, "speaker": "X"}]  # ikinci yarı missed
    assert abs(der(ref, hyp)["der"] - 0.5) < 1e-9


# ---- Citation ----
def _claim(pred, shown, valid):
    return {"predicted_citation": pred, "shown_as_supported": shown, "ground_truth_valid_spans": valid}


def test_citation_all_correct():
    claims = [
        _claim({"start": 0, "end": 10}, True, [{"start": 0, "end": 10}]),
        _claim({"start": 20, "end": 30}, True, [{"start": 20, "end": 30}]),
    ]
    m = citation_metrics(claims)
    assert m["citation_precision"] == 1.0 and m["citation_recall"] == 1.0
    assert m["unsupported_claim_rate"] == 0.0 and m["fail_closed_rate"] == 1.0


def test_citation_fail_closed_violation():
    # desteklenmeyen bir iddia 'gösterilmiş' → fail_closed ihlali (<1.0)
    claims = [
        _claim({"start": 0, "end": 5}, True, []),            # citation var ama geçerli span YOK → desteklenmiyor, ama gösterilmiş
        _claim({"start": 0, "end": 10}, True, [{"start": 0, "end": 10}]),
    ]
    m = citation_metrics(claims)
    assert m["unsupported_shown"] == 1
    assert m["fail_closed_rate"] < 1.0  # SERT invariant ihlali yakalandı


def test_citation_correctly_suppressed():
    # desteklenmeyen iddia gösterilmedi → fail_closed korunur (=1.0)
    claims = [
        _claim(None, False, []),
        _claim({"start": 0, "end": 10}, True, [{"start": 0, "end": 10}]),
    ]
    m = citation_metrics(claims)
    assert m["fail_closed_rate"] == 1.0 and m["unsupported_shown"] == 0


def test_citation_recall_miss():
    # geçerli span var ama sistem citation vermemiş → recall düşer
    claims = [
        _claim(None, False, [{"start": 0, "end": 10}]),       # kaçırıldı
        _claim({"start": 20, "end": 30}, True, [{"start": 20, "end": 30}]),
    ]
    m = citation_metrics(claims)
    assert m["citation_recall"] == 0.5


# ---- pilot-open exit-code sözleşmesi (fail-closed) ----
from run_eval import pilot_open_ready  # noqa: E402

_CALIBRATED = {"_status": "calibrated"}
_UNCALIBRATED = {"_status": "uncalibrated"}


def test_pilot_ready_calibrated_real_allpass():
    assert pilot_open_ready(True, _CALIBRATED, {"id": "real"}) is True


def test_pilot_ready_synthetic_blocks_even_when_calibrated():
    # Codex blocker: kalibre + sentetik + tüm gate yeşil olsa bile pilot-open YOK.
    assert pilot_open_ready(True, _CALIBRATED, {"_synthetic": True}) is False


def test_pilot_ready_uncalibrated_blocks():
    assert pilot_open_ready(True, _UNCALIBRATED, {"id": "real"}) is False


def test_pilot_ready_failing_gate_blocks():
    assert pilot_open_ready(False, _CALIBRATED, {"id": "real"}) is False
