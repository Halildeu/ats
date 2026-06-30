"""Golden-fixture schema enforcement testleri (Codex round-3 #2).

fixtures/schema.json'a karşı validate(): geçerli örnek geçer; bozuk varyantlar
fail-closed reddedilir. Gate C'nin bozuk-fixture'a yeşil verememesini garanti eder.
"""
import copy
import json
import os
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
from fixture_schema import validate  # noqa: E402


def _load(name):
    with open(os.path.join(HERE, "fixtures", name), encoding="utf-8") as f:
        return json.load(f)


SCHEMA = _load("schema.json")
FIXTURE = _load("example-fixture.json")


def test_example_fixture_valid():
    assert validate(FIXTURE, SCHEMA) == []


def test_missing_required_top():
    f = copy.deepcopy(FIXTURE)
    del f["claims"]
    assert any("claims" in e for e in validate(f, SCHEMA))


def test_additional_property_in_reference():
    f = copy.deepcopy(FIXTURE)
    f["reference"]["leaked"] = "x"
    assert any("additionalProperties" in e for e in validate(f, SCHEMA))


def test_wrong_type_transcript():
    f = copy.deepcopy(FIXTURE)
    f["reference"]["transcript"] = 123
    assert any("tip" in e for e in validate(f, SCHEMA))


def test_claim_missing_required():
    f = copy.deepcopy(FIXTURE)
    del f["claims"][0]["ground_truth_valid_spans"]
    assert any("ground_truth_valid_spans" in e for e in validate(f, SCHEMA))


def test_predicted_citation_oneof_null_ok():
    f = copy.deepcopy(FIXTURE)
    f["claims"][0]["predicted_citation"] = None
    assert validate(f, SCHEMA) == []


def test_predicted_citation_bad_shape():
    f = copy.deepcopy(FIXTURE)
    f["claims"][0]["predicted_citation"] = {"start": 1}  # 'end' eksik → oneOf 0 eşleşme
    assert any("oneOf" in e or "end" in e for e in validate(f, SCHEMA))


def test_span_extra_property():
    f = copy.deepcopy(FIXTURE)
    f["claims"][0]["ground_truth_valid_spans"].append({"start": 0, "end": 1, "x": 9})
    assert any("additionalProperties" in e for e in validate(f, SCHEMA))


def test_segment_missing_speaker():
    f = copy.deepcopy(FIXTURE)
    f["reference"]["speakers"][0].pop("speaker", None)
    assert any("speaker" in e for e in validate(f, SCHEMA))
