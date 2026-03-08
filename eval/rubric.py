from __future__ import annotations

import re
from typing import Any


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def has_core_structure(text: str) -> bool:
    t = normalize_text(text)

    whats_happening_markers = [
        "what’s happening", "what's happening", "what is happening",
        "what’s going on", "what's going on", "here’s what’s happening",
        "here's what's happening", "let's separate", "the real issue"
    ]
    what_matters_markers = [
        "what matters", "what matters most", "the core issue",
        "the real issue", "what actually matters", "the deeper question"
    ]
    next_step_markers = [
        "next step", "recommended next step", "here’s what i’d do next",
        "here's what i'd do next", "what i’d do", "what i'd do",
        "within the next 48 hours"
    ]

    return (
        any(m in t for m in whats_happening_markers)
        and any(m in t for m in what_matters_markers)
        and any(m in t for m in next_step_markers)
    )


def has_two_options_with_tradeoffs(text: str) -> bool:
    t = normalize_text(text)

    option_markers = [
        "option 1", "option 2",
        "path 1", "path 2",
        "one option", "another option",
        "first option", "second option",
        "the first path", "the second path"
    ]
    tradeoff_markers = [
        "tradeoff", "trade-off", "upside", "downside",
        "pros", "cons", "cost", "benefit", "risk"
    ]

    option_count = sum(1 for m in option_markers if m in t)
    has_tradeoff_language = any(m in t for m in tradeoff_markers)

    return option_count >= 2 and has_tradeoff_language


def has_likelihood_calibration(text: str) -> bool:
    t = normalize_text(text)

    markers = [
        "likely", "unlikely", "probability", "low probability",
        "high probability", "more likely", "less likely",
        "in most cases", "the odds are", "very low", "very likely"
    ]
    return any(m in t for m in markers)


def has_script_or_talk_track(text: str) -> bool:
    t = normalize_text(text)

    markers = [
        "you could say", "say something like", "talk track",
        "script", "for example:", "i’d frame it as",
        "i'd frame it as", "you might say", "here’s a way to say it",
        "here's a way to say it"
    ]
    return any(m in t for m in markers)


def ends_with_only_question(text: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return False

    paragraphs = [p.strip() for p in stripped.split("\n\n") if p.strip()]
    if not paragraphs:
        return False

    last = paragraphs[-1]
    return last.endswith("?") and len(last.split()) < 30


def score_output(output_text: str, rubric: dict[str, Any]) -> dict[str, Any]:
    checks = {
        "core_structure": has_core_structure(output_text) if rubric.get("must_include_core") else None,
        "two_options_with_tradeoffs": has_two_options_with_tradeoffs(output_text) if rubric.get("must_include_two_options") else None,
        "likelihood_calibration": has_likelihood_calibration(output_text) if rubric.get("must_include_likelihood_calibration") else None,
        "script_or_talk_track": has_script_or_talk_track(output_text) if rubric.get("must_include_script") else None,
        "not_question_only_ending": (not ends_with_only_question(output_text)) if rubric.get("must_not_end_with_only_question") else None,
    }

    applicable = {k: v for k, v in checks.items() if v is not None}
    passed = sum(1 for v in applicable.values() if v is True)
    failed = sum(1 for v in applicable.values() if v is False)

    return {
        "checks": checks,
        "passed": passed,
        "failed": failed,
        "pass_rate": round(passed / len(applicable), 3) if applicable else 1.0
    }