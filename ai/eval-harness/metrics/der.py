"""Diarization Error Rate (DER) — basitleştirilmiş frame-based (ATS-0004 Gate C).

DER = (missed + false_alarm + confusion) / referans konuşma frame'i.
Konuşmacı etiketleri keyfi (S1/S2 vs interviewer/candidate) olduğu için hyp→ref
konuşmacı eşlemesi hatayı minimize edecek şekilde brute-force seçilir (küçük
konuşmacı sayısı için doğru; ≤~6 konuşmacıda pratik).

NOT (üretim): pyannote.metrics.DiarizationErrorRate ile değiştir — collar/overlap
toleransı + optimal Hungarian mapping orada tam. Bu skeleton ölçüm-arayüzünü sabitler.
"""
from __future__ import annotations
from itertools import product


def _frames(segments: list[dict], step: float) -> dict[int, str]:
    frames: dict[int, str] = {}
    for s in segments:
        i = int(round(s["start"] / step))
        j = int(round(s["end"] / step))
        for k in range(i, j):
            frames[k] = s["speaker"]
    return frames


def der(reference: list[dict], hypothesis: list[dict], step: float = 0.01) -> dict:
    ref = _frames(reference, step)
    hyp = _frames(hypothesis, step)
    total = len(ref)
    if total == 0:
        return {
            "der": 0.0 if len(hyp) == 0 else 1.0,
            "missed": 0, "false_alarm": 0, "confusion": 0, "ref_frames": 0,
        }
    hyp_speakers = sorted({v for v in hyp.values()})
    ref_speakers = sorted({v for v in ref.values()})
    targets = ref_speakers + [None]
    all_idx = set(ref) | set(hyp)

    def errors(mapping: dict) -> tuple[int, int, int]:
        missed = false_alarm = confusion = 0
        for k in all_idx:
            r = ref.get(k)
            h = hyp.get(k)
            hm = mapping.get(h) if h is not None else None
            if r is not None and h is None:
                missed += 1
            elif r is None and h is not None:
                false_alarm += 1
            elif r is not None and h is not None and hm != r:
                confusion += 1
        return missed, false_alarm, confusion

    best = None
    for combo in product(targets, repeat=len(hyp_speakers)) if hyp_speakers else [()]:
        mapping = {hs: combo[i] for i, hs in enumerate(hyp_speakers)}
        m, f, c = errors(mapping)
        score = m + f + c
        if best is None or score < best[0]:
            best = (score, m, f, c)
    _, m, f, c = best
    return {"der": (m + f + c) / total, "missed": m, "false_alarm": f, "confusion": c, "ref_frames": total}
