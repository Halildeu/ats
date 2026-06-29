"""Word Error Rate (WER) — STT kalite metriği (ATS-0004 Gate C).

WER = (S + D + I) / N  (substitution + deletion + insertion / referans kelime sayısı).
Levenshtein DP + backtrace ile S/D/I ayrıştırılır. Türkçe için unicode-aware tokenize.
"""
from __future__ import annotations
import re


def _tokenize(text: str) -> list[str]:
    return re.findall(r"\w+", text.lower(), flags=re.UNICODE)


def _edit_counts(ref: list[str], hyp: list[str]) -> tuple[int, int, int]:
    """DP maliyet matrisi + backtrace → (substitutions, deletions, insertions)."""
    n, m = len(ref), len(hyp)
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        dp[i][0] = i
    for j in range(m + 1):
        dp[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            if ref[i - 1] == hyp[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1])
    i, j, S, D, I = n, m, 0, 0, 0
    while i > 0 or j > 0:
        if i > 0 and j > 0 and ref[i - 1] == hyp[j - 1] and dp[i][j] == dp[i - 1][j - 1]:
            i -= 1
            j -= 1
        elif i > 0 and j > 0 and dp[i][j] == dp[i - 1][j - 1] + 1:
            S += 1
            i -= 1
            j -= 1
        elif i > 0 and dp[i][j] == dp[i - 1][j] + 1:
            D += 1
            i -= 1
        else:
            I += 1
            j -= 1
    return S, D, I


def wer(reference: str, hypothesis: str) -> dict:
    ref = _tokenize(reference)
    hyp = _tokenize(hypothesis)
    S, D, I = _edit_counts(ref, hyp)
    N = len(ref)
    if N == 0:
        rate = 0.0 if len(hyp) == 0 else 1.0
    else:
        rate = (S + D + I) / N
    return {"wer": rate, "substitutions": S, "deletions": D, "insertions": I, "ref_words": N}
