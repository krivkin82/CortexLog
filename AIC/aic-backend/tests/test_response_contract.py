"""Unit tests for response contract parsing and validation heuristics."""

import json

from app.llm.response_contract import (
    ResponseContract,
    _fallback_contract,
    _parse_contract_json,
    repair_contract_from_user_ask,
    validate_contract_fit,
    validate_response_fit,
)

ACCEPTANCE_ENTRY = (
    "I got the AI journal to work again using npm run dev rather than repacking the .exe every time. "
    "I'm realizing I may need a second account/profile so I can keep a private journal separate from "
    "a demo/shareable journal. Maybe it's one more column in a table like user_name? "
    "Let me know your thoughts not so much on my emotions, but in pragmatic, direct engagement terms."
)

CASE1_ORCHESTRATION = (
    "Okay, I introduced a response orchestration workflow in the backend. "
    "Is that enough accomplished for today or do I want to go for the multi-tenancy, too? "
    "Let me know some quick thoughts."
)

CASE2_FRUSTRATED_APP = (
    "I'm so frustrated with this app. The responses feel overcooked and reflective when I just want "
    "someone to listen about how irritated I am with the journal software."
)

CASE3_DAD_TV = (
    "My dad keeps the TV volume way too high. I want practical help, not an analysis of family dynamics. "
    "What are two ways I could reduce the noise without a big fight?"
)

BAD_REFLECTIVE_CONTRACT = ResponseContract(
    requested_action="reflect",
    subject_matter="unknown",
    primary_intent="sense_making",
    engagement_style="reflective",
    output_shape="short_reflection",
    emphasis=["connect_to_user_context"],
)


def test_parse_contract_json_minimal():
    raw = json.dumps(
        {
            "primary_intent": "technical_reasoning",
            "domain": "software_product_design",
            "engagement_style": "direct_pragmatic",
            "stakes": "low",
            "output_shape": "implementation_recommendation",
            "emphasis": ["provide_architecture_guidance"],
            "needs_clarifying_question": False,
            "confidence": 0.9,
            "reason": "test",
            "user_override_detected": True,
            "override_summary": "pragmatic",
        }
    )
    c = _parse_contract_json(raw)
    assert c.primary_intent == "technical_reasoning"
    assert c.domain == "software_product_design"
    assert c.output_shape == "implementation_recommendation"
    assert c.user_override_detected is True


def test_parse_contract_json_requested_action_and_subject():
    raw = json.dumps(
        {
            "requested_action": "decide_between_options",
            "subject_matter": "project_work",
            "primary_intent": "decision_support",
            "output_shape": "options_with_tradeoffs",
            "confidence": 0.85,
        }
    )
    c = _parse_contract_json(raw)
    assert c.requested_action == "decide_between_options"
    assert c.subject_matter == "project_work"


def test_fallback_contract_acceptance_entry():
    c = _fallback_contract(ACCEPTANCE_ENTRY, "journal")
    assert c.primary_intent == "technical_reasoning"
    assert c.domain == "software_product_design"
    assert c.engagement_style == "direct_pragmatic"
    assert c.output_shape == "implementation_recommendation"
    assert c.user_override_detected is True
    assert "provide_architecture_guidance" in c.emphasis


def test_validate_implementation_recommendation_pass():
    contract = ResponseContract(
        output_shape="implementation_recommendation",
        emphasis=["focus_on_practical_next_steps"],
    )
    reply = (
        "Use a profile_id column on journal_entries, chat_sessions, and retrieval scope. "
        "Step 1: add profiles table. Database migration risk is low if you default existing rows "
        "to a single profile. Architecture: scope API token per profile or shared backend with profile header."
    )
    v = validate_response_fit(reply, contract, ACCEPTANCE_ENTRY)
    assert v.passed is True


def test_validate_implementation_recommendation_fail_emotional_only():
    contract = ResponseContract(
        output_shape="implementation_recommendation",
        emphasis=[],
        user_override_detected=True,
        override_summary="User explicitly requested pragmatic, direct engagement rather than emotional analysis.",
    )
    reply = "How did that make you feel? Your journey with privacy is profound and vulnerable."
    v = validate_response_fit(reply, contract, ACCEPTANCE_ENTRY)
    assert v.passed is False


def test_validate_options_with_tradeoffs():
    contract = ResponseContract(output_shape="options_with_tradeoffs", emphasis=[])
    good = (
        "Option 1: stay in role — upside: stability; downside: slower growth. "
        "Option 2: lateral move — tradeoff: new learning curve. When it makes sense: if you need runway."
    )
    assert validate_response_fit(good, contract, "work decision").passed is True
    bad = "You should probably think about what matters to you."
    assert validate_response_fit(bad, contract, "work decision").passed is False


def test_validate_talk_track_emphasis():
    contract = ResponseContract(
        output_shape="short_reflection",
        emphasis=["include_talk_track"],
    )
    assert validate_response_fit("You could say: I need clarity on scope.", contract, "meeting").passed is True
    assert validate_response_fit("Good luck with your meeting.", contract, "meeting").passed is False


def test_case1_contract_fit_fails_on_reflective_default():
    v = validate_contract_fit(BAD_REFLECTIVE_CONTRACT, CASE1_ORCHESTRATION, "journal")
    assert v.passed is False
    assert "decide" in (v.reason or "").lower() or "reflective" in (v.reason or "").lower()


def test_case1_repair_yields_decision_contract():
    v = validate_contract_fit(BAD_REFLECTIVE_CONTRACT, CASE1_ORCHESTRATION, "journal")
    repaired = repair_contract_from_user_ask(BAD_REFLECTIVE_CONTRACT, v, CASE1_ORCHESTRATION)
    assert repaired.requested_action == "decide_between_options"
    assert repaired.subject_matter == "project_work"
    assert repaired.primary_intent == "decision_support"
    assert repaired.output_shape == "options_with_tradeoffs"
    assert "keep_response_brief" in repaired.emphasis
    assert "include_two_options_with_tradeoffs" in repaired.emphasis
    assert validate_contract_fit(repaired, CASE1_ORCHESTRATION).passed is True


def test_case1_fallback_heuristic():
    c = _fallback_contract(CASE1_ORCHESTRATION, "journal")
    assert c.requested_action == "decide_between_options"
    assert c.output_shape == "options_with_tradeoffs"
    assert "keep_response_brief" in c.emphasis


def test_case2_repair_commiseration():
    v = validate_contract_fit(BAD_REFLECTIVE_CONTRACT, CASE2_FRUSTRATED_APP, "journal")
    repaired = repair_contract_from_user_ask(BAD_REFLECTIVE_CONTRACT, v, CASE2_FRUSTRATED_APP)
    assert repaired.requested_action == "listen"
    assert repaired.output_shape == "commiseration_only"
    assert repaired.primary_intent == "commiseration"
    assert repaired.engagement_style == "warm_commiserating"


def test_case2_fallback_heuristic():
    c = _fallback_contract(CASE2_FRUSTRATED_APP, "journal")
    assert c.requested_action == "listen"
    assert c.output_shape == "commiseration_only"


def test_case3_repair_household_practical():
    v = validate_contract_fit(BAD_REFLECTIVE_CONTRACT, CASE3_DAD_TV, "journal")
    repaired = repair_contract_from_user_ask(BAD_REFLECTIVE_CONTRACT, v, CASE3_DAD_TV)
    assert repaired.requested_action == "advise"
    assert repaired.subject_matter == "household"
    assert repaired.output_shape == "options_with_tradeoffs"
    assert repaired.user_override_detected is True
    assert repaired.engagement_style == "direct_pragmatic"
    assert validate_contract_fit(repaired, CASE3_DAD_TV).passed is True


def test_case3_fallback_heuristic():
    c = _fallback_contract(CASE3_DAD_TV, "journal")
    assert c.requested_action == "advise"
    assert c.subject_matter == "household"
    assert c.output_shape == "options_with_tradeoffs"
