from itertools import product

import numpy as np
import pytest

from goal_illusion.analysis import analyze, goal_distribution


def test_empty_and_certain_shots():
    np.testing.assert_array_equal(goal_distribution([]), [1])
    np.testing.assert_array_equal(goal_distribution([0, 1, 0, 1]), [0, 0, 1, 0, 0])
    result = analyze([], [])
    assert result.draw == 1
    assert result.score_probability(0, 0) == 1
    assert result.score_probability(3, 0) == 0


def test_exact_distribution_matches_enumerated_outcomes():
    probabilities = [0.2, 0.5, 0.8]
    expected = np.zeros(4)
    for outcomes in product((0, 1), repeat=3):
        chance = np.prod([p if goal else 1 - p for p, goal in zip(probabilities, outcomes)])
        expected[sum(outcomes)] += chance
    np.testing.assert_allclose(goal_distribution(probabilities), expected)


def test_hand_calculated_match():
    result = analyze([0.5], [0.25])
    np.testing.assert_allclose(result.score_matrix, [[0.375, 0.125], [0.375, 0.125]])
    assert result.home_win == 0.375
    assert result.draw == 0.5
    assert result.away_win == 0.125


def test_mass_expectation_and_fixed_goals():
    probabilities = [0.01, 0.15, 0.71, 0.9] * 15
    pmf = goal_distribution(probabilities, fixed_goals=2)
    assert pmf.sum() == pytest.approx(1)
    assert np.dot(np.arange(len(pmf)), pmf) == pytest.approx(sum(probabilities) + 2)
    result = analyze(probabilities, [0.12, 0.5], home_fixed=2)
    assert result.home_win + result.draw + result.away_win == pytest.approx(1)
    assert result.score_probability(0, 0) == 0
    assert result.top_scores() == sorted(result.top_scores(), key=lambda score: -score[2])


@pytest.mark.parametrize("value", [None, float("nan"), float("inf"), -0.1, 1.1, "0.5", True])
def test_invalid_xg_is_rejected(value):
    with pytest.raises(ValueError):
        goal_distribution([value])


def test_team_swap_swaps_outcomes():
    original = analyze([0.2, 0.5, 0.7], [0.1, 0.3])
    swapped = analyze([0.1, 0.3], [0.2, 0.5, 0.7])
    assert original.home_win == pytest.approx(swapped.away_win)
    assert original.draw == pytest.approx(swapped.draw)
    np.testing.assert_allclose(original.score_matrix, swapped.score_matrix.T)
