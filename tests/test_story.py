import json
from dataclasses import replace

import pytest

from goal_illusion.data import DataError, load_example
from goal_illusion.narrative import (
    PROMPT_VERSION,
    generate_narrative,
    narrative_matches,
    prompt_facts,
    validate_narrative,
)
from goal_illusion.story import build_evidence, fingerprint
from scripts.generate_stories import generate


@pytest.fixture
def facts():
    return build_evidence(load_example())


@pytest.fixture
def prose():
    return {
        "headline": "İngiltere'nin şut kalitesi galibiyetin arkasındaki güçlü dayanağı gösteriyor.",
        "explanation": "Fırsatların kalitesi İngiltere lehine bir tablo çiziyor. "
        "Skorun farkını değerlendirirken şutların dağılımı da dikkate alınmalı.",
        "evidence_ids": ["chances", "outcomes", "margin"],
    }


def test_prompt_distinguishes_total_and_per_shot_quality(facts):
    facts = {
        **facts,
        "home": {**facts["home"], "xg": 1.3, "xg_per_shot": 0.065},
        "away": {**facts["away"], "xg": 1.16, "xg_per_shot": 0.072},
    }
    comparisons = prompt_facts(facts)["doğrulanmış_ilişkiler"]
    assert comparisons["toplam_fırsat_kalitesi"]["yüksek_olan"] == facts["home"]["name"]
    assert comparisons["tekil_şut_kalitesi"]["yüksek_olan"] == facts["away"]["name"]


def test_evidence_matches_independent_enumeration(facts):
    data = load_example()
    sums = [
        sum(s.xg for s in data.shots_for(team)) for team in (data.match.home_id, data.match.away_id)
    ]
    assert facts["home"]["xg"] == pytest.approx(sums[0])
    assert facts["away"]["xg"] == pytest.approx(sums[1])
    # Enumerate every goal/miss combination, independent of the convolution code.
    import itertools

    tail = 0
    shots = list(data.shots)
    for bits in itertools.product((0, 1), repeat=len(shots)):
        p, margin = 1, 0
        for bit, shot in zip(bits, shots, strict=True):
            p *= shot.xg if bit else 1 - shot.xg
            margin += bit if shot.team_id == data.match.home_id else -bit
        if margin >= 3:
            tail += p
    assert facts["observed_margin_tail"] == pytest.approx(tail)


def test_draw_has_no_directional_margin():
    assert (
        build_evidence(replace(load_example(), home_score=0, away_score=0))["observed_margin_tail"]
        is None
    )


def test_own_goal_excluded_from_finishing():
    facts = build_evidence(replace(load_example(), home_fixed=1, home_score=4))
    assert facts["home"]["shot_goals"] == 3
    assert facts["home"]["finishing_difference"] == pytest.approx(3 - facts["home"]["xg"])
    assert "own_goals" in {e["id"] for e in facts["evidence"]}


def test_empty_shots_has_undefined_average():
    facts = build_evidence(replace(load_example(), shots=(), home_score=0, away_score=0))
    assert facts["home"]["xg_per_shot"] is None
    assert facts["outcomes"]["draw"] == 1


def test_periods_separate_extra_time():
    data = load_example()
    shot = replace(data.shots[0], period=3)
    facts = build_evidence(replace(data, shots=(shot,), duration=120))
    team = facts["home"] if shot.team_id == data.match.home_id else facts["away"]
    assert team["first_half_xg"] == 0
    assert team["extra_time_xg"] == shot.xg


def test_fingerprint_ignores_retrieval_but_detects_corrections():
    data = load_example()
    assert fingerprint(data) == fingerprint(replace(data, retrieved_at="later"))
    assert fingerprint(data) != fingerprint(replace(data, home_score=4))
    assert fingerprint(data) != fingerprint(replace(data, shots=(replace(data.shots[0], xg=0.5),)))


@pytest.mark.parametrize(
    "bad",
    [
        "%99 kesinlikle",
        "<script>uyarı</script>",
        "Kaleci hatası",
        "Şanslı galibiyet",
        "Pres sayesinde üstünlük",
    ],
)
def test_reject_unverifiable_claims(facts, prose, bad):
    with pytest.raises(DataError):
        validate_narrative({**prose, "headline": f"{bad} takımın skorunu açıkladı."}, facts)


def test_outcome_probability_wording_is_not_a_luck_claim(facts, prose):
    value = {
        **prose,
        "headline": "İngiltere'nin galibiyet şansı, şut kalitesindeki avantajını yansıtıyor.",
    }
    assert validate_narrative(value, facts)["headline"] == value["headline"]


def test_only_verified_score_numbers_are_allowed(facts, prose):
    correct = f"{facts['home']['goals']}–{facts['away']['goals']}"
    text = f"İngiltere'nin {correct} galibiyeti, şut kalitesindeki üstünlüğünü yansıtıyor."
    assert validate_narrative({**prose, "headline": text}, facts)["headline"] == text
    with pytest.raises(DataError):
        validate_narrative({**prose, "headline": text.replace(correct, "9–8")}, facts)


def test_unknown_or_duplicate_evidence_rejected(facts, prose):
    for ids in (["chances", "unknown"], ["chances", "chances"]):
        with pytest.raises(DataError):
            validate_narrative({**prose, "evidence_ids": ids}, facts)


def test_equal_score_cannot_be_described_as_fewer_goals(facts, prose):
    facts = {**facts, "home": {**facts["home"], "goals": 2}, "away": {**facts["away"], "goals": 2}}
    with pytest.raises(DataError):
        validate_narrative(
            {**prose, "headline": "İngiltere daha fazla şutla ama daha az gol elde etti."}, facts
        )


def test_equal_score_allows_more_goal_opportunities(facts, prose):
    facts = {**facts, "home": {**facts["home"], "goals": 2}, "away": {**facts["away"], "goals": 2}}
    for noun in ("gol fırsatı", "gol beklentisi"):
        text = f"İngiltere daha fazla {noun} üretse de maç beraberlikle bitti."
        assert validate_narrative({**prose, "headline": text}, facts)["headline"] == text


def test_grounded_numeric_statistics_are_allowed(facts, prose):
    value = {
        **prose,
        "explanation": f"England toplam {facts['home']['xg']:.2f} xG üretti; "
        f"Senegal toplam {facts['away']['xg']:.2f} xG ile daha düşük kaldı.",
    }
    assert validate_narrative(value, facts)["explanation"] == value["explanation"]
    with pytest.raises(DataError, match="Veride bulunmayan sayı"):
        validate_narrative(
            {**value, "explanation": "England toplam 9999.99 xG ile öne çıktı."}, facts
        )


def test_equal_shots_cannot_be_described_as_more_shots(facts, prose):
    facts = {**facts, "home": {**facts["home"], "shots": 8}, "away": {**facts["away"], "shots": 8}}
    with pytest.raises(DataError):
        validate_narrative(
            {**prose, "headline": "İngiltere daha fazla şutla daha iyi sonuç elde etti."}, facts
        )


def test_cached_prose_requires_current_input(facts, prose):
    cached = {
        **prose,
        "fingerprint": facts["fingerprint"],
        "story_version": 1,
        "prompt_version": PROMPT_VERSION,
    }
    assert narrative_matches(cached, facts)
    assert not narrative_matches(cached, {**facts, "fingerprint": "changed"})
    assert not narrative_matches({**cached, "prompt_version": 0}, facts)


def test_generation_retries_validation_errors(monkeypatch, facts, prose):
    calls = []

    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            value = prose if len(calls) == 2 else {**prose, "evidence_ids": ["unknown"]}
            return {"done": True, "message": {"content": json.dumps(value)}}

    def post(url, **kwargs):
        calls.append(kwargs)
        return Response()

    monkeypatch.setattr("goal_illusion.narrative.requests.post", post)
    result = generate_narrative(facts)
    assert result["headline"] == prose["headline"]
    assert len(calls) == 2
    assert "fingerprint" not in json.loads(calls[0]["json"]["messages"][1]["content"])
    assert calls[0]["json"]["messages"][0]["role"] == "system"


def test_generation_failure_is_explicit(monkeypatch, facts):
    import requests

    def failed(*args, **kwargs):
        raise requests.ConnectionError()

    monkeypatch.setattr("goal_illusion.narrative.requests.post", failed)
    with pytest.raises(DataError):
        generate_narrative(facts)


def test_groq_generation_uses_private_key_and_strict_schema(monkeypatch, facts, prose):
    monkeypatch.setattr("goal_illusion.narrative._review_groq", lambda *args: None)
    calls = []
    monkeypatch.setenv("GROQ_API_KEY", "test-private-key")

    class Response:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            return {
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {
                            "content": json.dumps(prose),
                        },
                    }
                ]
            }

    def post(url, **kwargs):
        calls.append((url, kwargs))
        return Response()

    monkeypatch.setattr("goal_illusion.narrative.requests.post", post)
    result = generate_narrative(facts, provider="groq", model="openai/gpt-oss-120b")
    url, request = calls[0]
    assert url == "https://api.groq.com/openai/v1/chat/completions"
    assert request["headers"]["Authorization"] == "Bearer test-private-key"
    assert request["json"]["response_format"]["json_schema"]["strict"] is True
    assert result["provider"] == "groq"
    assert "test-private-key" not in json.dumps(result)
    assert "test-private-key" not in json.dumps(request["json"])


def test_groq_missing_key_makes_no_request(monkeypatch, facts):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    with pytest.raises(DataError, match="GROQ_API_KEY"):
        generate_narrative(facts, provider="groq")


@pytest.mark.parametrize("approved", [True, False])
def test_semantic_review_can_reject_structurally_valid_prose(monkeypatch, facts, prose, approved):
    from goal_illusion.narrative import _review_groq

    class Response:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            return {
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {
                            "content": json.dumps(
                                {"approved": approved, "reason": "Kontrol sonucu"}
                            ),
                        },
                    }
                ]
            }

    monkeypatch.setattr("goal_illusion.narrative.requests.post", lambda *a, **kw: Response())
    monkeypatch.setattr("goal_illusion.narrative.time.sleep", lambda *a: None)
    if approved:
        _review_groq(prose, facts, "test-key", "test-model")
    else:
        with pytest.raises(DataError, match="Anlam kontrolü"):
            _review_groq(prose, facts, "test-key", "test-model")


@pytest.mark.parametrize(
    "claim", ["galibiyeti garanti etti", "galibiyeti öngörüyordu", "sonucu belirledi"]
)
def test_certainty_is_rejected(facts, prose, claim):
    with pytest.raises(DataError):
        validate_narrative({**prose, "headline": f"İngiltere'nin şut kalitesi {claim}."}, facts)


def test_groq_rate_limit_waits_then_recovers(monkeypatch, facts, prose):
    monkeypatch.setattr("goal_illusion.narrative._review_groq", lambda *args: None)
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    delays = []
    calls = []

    class Response:
        headers = {"retry-after": "12"}

        def __init__(self, status):
            self.status_code = status

        def raise_for_status(self):
            assert self.status_code == 200

        def json(self):
            return {
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {
                            "content": json.dumps(prose),
                        },
                    }
                ]
            }

    def post(*args, **kwargs):
        calls.append(kwargs)
        return Response(429 if len(calls) == 1 else 200)

    monkeypatch.setattr("goal_illusion.narrative.requests.post", post)
    monkeypatch.setattr("goal_illusion.narrative.time.sleep", delays.append)
    assert generate_narrative(facts, provider="groq")["headline"] == prose["headline"]
    assert delays == [12]
    assert len(calls) == 2


def test_pipeline_preserves_valid_and_drops_stale(monkeypatch, tmp_path, prose):
    from dataclasses import asdict

    data = load_example()
    source = tmp_path / "matches.json"
    dest = tmp_path / "stories.json"
    source.write_text(json.dumps({"updated_at": "now", "matches": [asdict(data)]}))
    facts = build_evidence(data)
    cached = {
        **prose,
        "fingerprint": facts["fingerprint"],
        "story_version": 1,
        "prompt_version": PROMPT_VERSION,
        "model": "qwen3.5:4b",
    }
    dest.write_text(json.dumps({"stories": {str(data.match.id): {"narrative": cached}}}))

    def fail(*args, **kwargs):
        raise DataError("Unavailable")

    monkeypatch.setattr("scripts.generate_stories.generate_narrative", fail)
    result = generate(source, dest, base_url="http://local")
    assert result["stories"][str(data.match.id)]["status"] == "ready"
    assert result["source_updated_at"] == "now"
    source.write_text(
        json.dumps({"updated_at": "later", "matches": [asdict(replace(data, home_score=4))]})
    )
    result = generate(source, dest, base_url="http://local")
    story = result["stories"][str(data.match.id)]
    assert story["status"] == "unavailable"
    assert story["narrative"] is None
    assert story["facts"]["home"]["goals"] == 4


def test_failed_newest_story_does_not_starve_untested_matches(monkeypatch, tmp_path):
    from dataclasses import asdict

    data = load_example()
    newer = replace(data, match=replace(data.match, id=999, date="2026-10-11"))
    source, dest = tmp_path / "matches.json", tmp_path / "stories.json"
    source.write_text(json.dumps({"updated_at": "now", "matches": [asdict(newer), asdict(data)]}))
    dest.write_text(
        json.dumps(
            {
                "stories": {
                    "999": {
                        "facts": build_evidence(newer),
                        "narrative": None,
                        "failed_attempts": 2,
                        "validation_revision": 2,
                    }
                }
            }
        )
    )
    called = []

    def failed(facts, **kwargs):
        called.append(facts["match_id"])
        raise DataError("Unavailable")

    monkeypatch.setattr("scripts.generate_stories.generate_narrative", failed)
    result = generate(source, dest, base_url="http://local", limit=1)
    assert called == [data.match.id]
    assert result["stories"]["999"]["failed_attempts"] == 2
    assert result["stories"][str(data.match.id)]["failed_attempts"] == 1
