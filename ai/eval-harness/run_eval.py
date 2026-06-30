#!/usr/bin/env python3
"""ATS-0004 eval-harness orchestrator (pilot-open Gate C).

Bir golden fixture'ı yükler → WER/DER/citation metriklerini hesaplar → thresholds.json
ile kıyaslar → kırmızı/yeşil Gate C raporu basar. fail-closed (=1.0) SERT invariant.

Kullanım:
    python run_eval.py [fixture.json] [--thresholds thresholds.json]
Çıkış kodu: tüm gate'ler yeşil VE eşikler kalibre VE fixture gerçek (sentetik değil)
ise 0; aksi halde 1 (fail-closed). Bkz. pilot_open_ready().
"""
from __future__ import annotations
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from metrics import wer, der, citation_metrics  # noqa: E402
from fixture_schema import validate as validate_fixture  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))


def load_schema() -> dict:
    with open(os.path.join(HERE, "fixtures", "schema.json"), encoding="utf-8") as f:
        return json.load(f)


def evaluate(fixture: dict) -> dict:
    w = wer(fixture["reference"]["transcript"], fixture["hypothesis"]["transcript"])
    d = der(fixture["reference"]["speakers"], fixture["hypothesis"]["speakers"])
    c = citation_metrics(fixture["claims"])
    return {"wer": w, "der": d, "citation": c}


def gate(results: dict, th: dict) -> list[tuple[str, bool, str]]:
    """(isim, geçti_mi, detay) — Gate C kontrol satırları."""
    w = results["wer"]["wer"]
    dd = results["der"]["der"]
    c = results["citation"]
    checks = [
        ("WER", w <= th["wer_max"], f"{w:.3f} ≤ {th['wer_max']}"),
        ("DER", dd <= th["der_max"], f"{dd:.3f} ≤ {th['der_max']}"),
        ("citation_precision", c["citation_precision"] >= th["citation_precision_min"],
         f"{c['citation_precision']:.3f} ≥ {th['citation_precision_min']}"),
        ("citation_recall", c["citation_recall"] >= th["citation_recall_min"],
         f"{c['citation_recall']:.3f} ≥ {th['citation_recall_min']}"),
        ("unsupported_claim_rate", c["unsupported_claim_rate"] <= th["unsupported_claim_rate_max"],
         f"{c['unsupported_claim_rate']:.3f} ≤ {th['unsupported_claim_rate_max']}"),
        ("fail_closed_rate (SERT)", c["fail_closed_rate"] >= th["fail_closed_rate_min"],
         f"{c['fail_closed_rate']:.3f} ≥ {th['fail_closed_rate_min']}"),
    ]
    return checks


def pilot_open_ready(all_pass: bool, thresholds: dict, fixture: dict) -> bool:
    """Gate C exit-0 sözleşmesi (fail-closed): tüm gate yeşil + eşikler kalibre
    + gerçek (sentetik olmayan) fixture. Sentetik fixture kalibrasyon sonrası
    da pilot-open=True VERMEZ."""
    return (
        all_pass
        and thresholds.get("_status") != "uncalibrated"
        and not fixture.get("_synthetic")
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("fixture", nargs="?", default=os.path.join(HERE, "fixtures", "example-fixture.json"))
    ap.add_argument("--thresholds", default=os.path.join(HERE, "thresholds.json"))
    args = ap.parse_args()

    with open(args.fixture, encoding="utf-8") as f:
        fixture = json.load(f)
    with open(args.thresholds, encoding="utf-8") as f:
        th = json.load(f)

    # FAIL-CLOSED: fixture şemaya uymuyorsa evaluate ETME (Gate C bozuk-fixture'a yeşil veremez).
    schema_errors = validate_fixture(fixture, load_schema())
    if schema_errors:
        print("=== ATS-0004 Gate C — FIXTURE ŞEMA İHLALİ (fail-closed) ===")
        for e in schema_errors:
            print(f"  [KIRMIZI] schema: {e}")
        print("\n  SONUÇ: fixture geçersiz; eval koşulmadı; pilot-open hazır = False")
        return 1

    results = evaluate(fixture)
    checks = gate(results, th)

    print(f"=== ATS-0004 Gate C — fixture: {fixture.get('id', '?')}"
          + (" [SENTETİK]" if fixture.get("_synthetic") else "") + " ===")
    all_pass = True
    for name, ok, detail in checks:
        print(f"  [{'YEŞİL' if ok else 'KIRMIZI'}] {name}: {detail}")
        all_pass = all_pass and ok

    if th.get("_status") == "uncalibrated":
        print("  ⚠️  EŞİKLER KALİBRE DEĞİL (placeholder) — golden fixture'da kilitlenecek; "
              "bu koşu yalnız harness'i doğrular, pilot-open kararı VERMEZ.")
    if fixture.get("_synthetic"):
        print("  ⚠️  Fixture SENTETİK — gerçek kalite kanıtı değil.")

    pilot_ready = pilot_open_ready(all_pass, th, fixture)
    print(f"\n  SONUÇ: gate'ler {'tümü YEŞİL' if all_pass else 'KIRMIZI var'}; "
          f"pilot-open hazır = {pilot_ready}")
    return 0 if pilot_ready else 1


if __name__ == "__main__":
    raise SystemExit(main())
