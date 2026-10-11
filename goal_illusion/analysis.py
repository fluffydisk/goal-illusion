"""Bağımsız Bernoulli şutlarından tam gol ve skor dağılımları."""

from collections.abc import Iterable
from dataclasses import dataclass
from math import isfinite

import numpy as np


@dataclass(frozen=True)
class Analysis:
    home_pmf: np.ndarray
    away_pmf: np.ndarray
    score_matrix: np.ndarray
    home_win: float
    draw: float
    away_win: float

    def score_probability(self, home: int, away: int) -> float:
        if 0 <= home < len(self.home_pmf) and 0 <= away < len(self.away_pmf):
            return float(self.score_matrix[home, away])
        return 0.0

    def top_scores(self, count: int = 5) -> list[tuple[int, int, float]]:
        indices = np.argsort(-self.score_matrix.ravel(), kind="stable")
        result = []
        for index in indices:
            h, a = np.unravel_index(index, self.score_matrix.shape)
            probability = float(self.score_matrix[h, a])
            if probability > 0:
                result.append((int(h), int(a), probability))
            if len(result) == count:
                break
        return result


def goal_distribution(xg_values: Iterable[float], fixed_goals: int = 0) -> np.ndarray:
    if not isinstance(fixed_goals, int) or fixed_goals < 0:
        raise ValueError("Sabit gol sayısı negatif olmayan bir tam sayı olmalı.")
    pmf = np.array([1.0])
    for value in xg_values:
        if isinstance(value, (str, bool)):
            raise ValueError("xG sayısal olmalı.")
        try:
            p = float(value)
        except (TypeError, ValueError) as error:
            raise ValueError("xG sayısal olmalı.") from error
        if not isfinite(p) or not 0 <= p <= 1:
            raise ValueError("xG sonlu ve 0–1 aralığında olmalı.")
        pmf = np.convolve(pmf, [1 - p, p])
    return np.pad(pmf, (fixed_goals, 0))


def analyze(
    home_xg: Iterable[float],
    away_xg: Iterable[float],
    home_fixed: int = 0,
    away_fixed: int = 0,
) -> Analysis:
    home = goal_distribution(home_xg, home_fixed)
    away = goal_distribution(away_xg, away_fixed)
    matrix = np.outer(home, away)
    return Analysis(
        home,
        away,
        matrix,
        float(np.tril(matrix, -1).sum()),
        float(np.trace(matrix)),
        float(np.triu(matrix, 1).sum()),
    )
