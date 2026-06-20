"""LEGACY: response contract orchestrator retained for reference/testing, not active generation."""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Any, List, Optional

from pydantic import BaseModel, Field

from app.core.config import DATA_DIR
from app.llm.debug_settings import is_response_contract_log_enabled
from app.llm.service import LLMUnavailableError, chat_completion
from app.storage.chat import list_chat_messages

logger = logging.getLogger(__name__)

# --- Supported contract values ---

REQUESTED_ACTIONS = frozenset({
    "listen",
    "reflect",
    "analyze",
    "advise",
    "decide_between_options",
    "plan_next_steps",
    "explain",
    "debug",
    "brainstorm",
    "draft_wording",
    "compare_over_time",
    "recall_memory",
})

SUBJECT_MATTERS = frozenset({
    "self_reflection",
    "project_work",
    "software_architecture",
    "debugging",
    "career_workplace",
    "relationship",
    "health",
    "finance",
    "history_research",
    "philosophy",
    "household",
    "creative_work",
    "unknown",
})

PRIMARY_INTENTS = frozenset({
    "reflection",
    "sense_making",
    "practical_advice",
    "decision_support",
    "technical_reasoning",
    "research_explanation",
    "planning",
    "social_wording",
    "memory_recall",
    "comparison_over_time",
    "commiseration",
})

DOMAINS = frozenset({
    "personal",
    "workplace",
    "software_product_design",
    "technical_debugging",
    "relationships",
    "health_wellness",
    "finance",
    "philosophy",
    "history_research",
    "household_family",
    "creative",
    "unknown",
})

ENGAGEMENT_STYLES = frozenset({
    "reflective",
    "direct_pragmatic",
    "analytical",
    "warm_commiserating",
    "challenging_but_kind",
    "explanatory",
    "brainstorming",
    "concise",
})

STAKES = frozenset({"low", "medium", "high", "acute"})

OUTPUT_SHAPES = frozenset({
    "short_reflection",
    "grounding_analysis",
    "options_with_tradeoffs",
    "implementation_recommendation",
    "step_by_step_plan",
    "talk_track",
    "research_summary",
    "decision_memo",
    "debugging_guidance",
    "pattern_observation",
    "commiseration_only",
})

EMPHASIS_VALUES = frozenset({
    "focus_on_practical_next_steps",
    "separate_facts_from_interpretation",
    "provide_concrete_examples",
    "name_the_core_tradeoff",
    "include_two_options_with_tradeoffs",
    "include_recommended_next_step",
    "include_talk_track",
    "calibrate_likelihoods",
    "explain_for_beginner",
    "connect_to_user_context",
    "keep_response_brief",
    "offer_grounded_challenge",
    "use_warmth_and_solidarity",
    "surface_recurring_pattern",
    "provide_architecture_guidance",
    "provide_debugging_sequence",
})

_PRAGMATIC_SHAPES = frozenset({
    "options_with_tradeoffs",
    "implementation_recommendation",
    "step_by_step_plan",
    "debugging_guidance",
    "decision_memo",
})

_JOURNAL_TASK_SHAPES = frozenset({
    "options_with_tradeoffs",
    "step_by_step_plan",
    "implementation_recommendation",
    "decision_memo",
})

_SUMMARY_TEMPLATE_LABELS = (
    "quick read",
    "option 1",
    "option 2",
    "option a",
    "option b",
    "recommendation",
    "upside",
    "downside",
    "goal in one line",
)

SAFETY_BLOCK = """
Role: Be a thoughtful, grounded AI journal companion and advisor. Use normal human reasoning, practical judgment, and the model's training to help the user think clearly, reflect, plan, analyze situations, and explore decisions.

Guidelines:
- Preserve the user's agency, dignity, and ability to make their own choices.
- Provide grounded practical guidance when appropriate, including discussion of health, emotional, workplace, relationship, financial, or life issues.
- Avoid pretending to be a licensed professional or claiming certainty where uncertainty exists.
- Distinguish clearly between established facts, interpretations, possibilities, and speculation.
- If the user appears to be suffering from a lack of social interaction, gently steer the user towards interactions with other human beings; more interaction is better than none.
- In situations involving serious danger, acute crisis, or high-risk harm, encourage immediate real-world support and safety-oriented action.
"""

CLASSIFIER_SYSTEM = """You are the CortexLog response contract classifier.

Your job is to identify what the user is asking the assistant to do with the current entry.

Classify the entry by reading the whole communicative act, not just keywords.

Pay special attention to:
- explicit instructions from the user
- questions the user asks
- whether the user wants listening, reflection, practical advice, decision support, explanation, debugging, planning, or wording help
- the subject matter of the entry
- the answer shape that would satisfy the user's request

Use positive emphasis instructions that tell the response generator what to include.

If the user asks a practical question, choose a practical response contract.
If the user asks whether to do X or Y, choose decision_support or planning with options_with_tradeoffs.
If the user asks for "quick thoughts," usually keep the response concise unless the entry clearly asks for depth.
If the user explicitly says not to focus on emotions, set user_override_detected=true and choose a practical or analytical engagement style.

Return valid JSON only."""

GENERATION_SYSTEM = """You are CortexLog, an AI journal companion and advisor.

Generate the response according to the response contract.

The contract includes requested_action. Treat requested_action as the main indicator of what the user wants you to do.

If requested_action is decide_between_options, compare the options and recommend a next step.
If requested_action is plan_next_steps, provide a small practical sequence.
If requested_action is listen or reflect, respond reflectively when appropriate.
If requested_action is debug, provide concrete diagnostic steps.
If requested_action is explain, teach clearly.
If requested_action is advise, give direct practical guidance.

subject_matter is the topic; it does not always dictate response style.

Respect explicit user overrides about tone, style, and focus.
Use the emphasis list as positive guidance for what the response should contain.
Preserve the user's agency and dignity. Be clear, grounded, and useful."""

# Weak UI mode hints — do not force reflective journal tone
_MODE_HINT_NUDGES: dict[str, dict[str, Any]] = {
    "journal": {"subject_matter": "self_reflection"},
    "coach": {"requested_action": "plan_next_steps", "engagement_style": "direct_pragmatic"},
    "exploration": {"requested_action": "brainstorm", "engagement_style": "brainstorming"},
    "crisis": {"stakes": "acute", "output_shape": "grounding_analysis", "engagement_style": "reflective"},
    "advisor_workplace": {
        "subject_matter": "career_workplace",
        "domain": "workplace",
        "output_shape": "options_with_tradeoffs",
        "emphasis": [
            "separate_facts_from_interpretation",
            "include_two_options_with_tradeoffs",
            "include_recommended_next_step",
            "include_talk_track",
            "calibrate_likelihoods",
        ],
    },
}

_OUTPUT_SHAPE_TEMPLATES: dict[str, str] = {
    "options_with_tradeoffs": """
Use this shape:
- Quick read (one short paragraph)
- Option 1: upside / downside
- Option 2: upside / downside
- Recommendation (one concrete next step)""",
    "implementation_recommendation": """
Use this shape:
- The practical issue
- Recommended design or approach
- Smallest useful implementation step
- Risk to watch""",
    "short_reflection": """
Use this shape:
- What stands out
- Why it matters
- One useful reframe or angle (substance, not a feelings check-in)""",
    "step_by_step_plan": """
Use this shape:
- Goal in one line
- Numbered steps (small, actionable)
- What to verify after""",
    "commiseration_only": """
Use this shape:
- Brief acknowledgment of how they feel
- Solidarity without over-analyzing
- Optional one gentle forward-looking line""",
    "debugging_guidance": """
Use this shape:
- What to check first
- Likely causes
- Next diagnostic step""",
}


class ResponseContract(BaseModel):
    requested_action: str = "reflect"
    subject_matter: str = "unknown"
    primary_intent: str = "sense_making"
    domain: str = "personal"
    engagement_style: str = "reflective"
    stakes: str = "low"
    output_shape: str = "short_reflection"
    emphasis: List[str] = Field(default_factory=list)
    needs_clarifying_question: bool = False
    confidence: float = 0.5
    reason: str = ""
    user_override_detected: bool = False
    override_summary: Optional[str] = None


class ResponseValidation(BaseModel):
    passed: bool = True
    reason: Optional[str] = None
    missing_emphasis: List[str] = Field(default_factory=list)


def _coerce_enum(value: str | None, allowed: frozenset[str], default: str) -> str:
    if not value:
        return default
    v = str(value).strip().lower().replace("-", "_").replace(" ", "_")
    if v in allowed:
        return v
    return default


def _coerce_emphasis(items: Any) -> List[str]:
    if not items:
        return []
    out: List[str] = []
    if isinstance(items, str):
        items = [items]
    for item in items:
        e = _coerce_enum(str(item), EMPHASIS_VALUES, "")
        if e and e not in out:
            out.append(e)
    return out


def _parse_contract_json(raw: str) -> ResponseContract:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            data = json.loads(text[start : end + 1])
        else:
            raise
    if not isinstance(data, dict):
        data = {}

    return ResponseContract(
        requested_action=_coerce_enum(data.get("requested_action"), REQUESTED_ACTIONS, "reflect"),
        subject_matter=_coerce_enum(data.get("subject_matter"), SUBJECT_MATTERS, "unknown"),
        primary_intent=_coerce_enum(data.get("primary_intent"), PRIMARY_INTENTS, "sense_making"),
        domain=_coerce_enum(data.get("domain"), DOMAINS, "unknown"),
        engagement_style=_coerce_enum(data.get("engagement_style"), ENGAGEMENT_STYLES, "reflective"),
        stakes=_coerce_enum(data.get("stakes"), STAKES, "low"),
        output_shape=_coerce_enum(data.get("output_shape"), OUTPUT_SHAPES, "short_reflection"),
        emphasis=_coerce_emphasis(data.get("emphasis")),
        needs_clarifying_question=bool(data.get("needs_clarifying_question", False)),
        confidence=float(data.get("confidence", 0.5) or 0.5),
        reason=str(data.get("reason") or ""),
        user_override_detected=bool(data.get("user_override_detected", False)),
        override_summary=data.get("override_summary"),
    )


def _is_generic_reflective_contract(contract: ResponseContract) -> bool:
    return (
        contract.requested_action in ("reflect", "listen")
        and contract.primary_intent in ("sense_making", "reflection")
        and contract.engagement_style == "reflective"
        and contract.output_shape == "short_reflection"
    )


def _apply_mode_hint(contract: ResponseContract, mode_hint: str | None) -> ResponseContract:
    """Apply weak UI hints only when classifier output is low-confidence and still generic."""
    if not mode_hint:
        return contract
    if contract.confidence >= 0.6 and not _is_generic_reflective_contract(contract):
        return contract
    hint = mode_hint.strip().lower()
    nudge = _MODE_HINT_NUDGES.get(hint)
    if not nudge:
        return contract
    data = contract.model_dump()
    for key, val in nudge.items():
        if key == "emphasis":
            merged = list(data.get("emphasis") or [])
            for e in val:
                if e not in merged:
                    merged.append(e)
            data["emphasis"] = merged
        elif key == "requested_action" and data.get("requested_action") == "reflect":
            data[key] = val
        elif key == "subject_matter" and data.get("subject_matter") == "unknown":
            data[key] = val
        elif key in data and data.get(key) in (None, "", "unknown", "personal", "sense_making", "short_reflection"):
            data[key] = val
    return ResponseContract(**data)


# --- User-message pattern detectors (shared by contract fit, repair, fallback) ---


def _message_lower(user_message: str) -> str:
    return (user_message or "").lower()


def _asks_decision_or_continue(user_message: str) -> bool:
    t = _message_lower(user_message)
    patterns = (
        " or ",
        "enough for today",
        "enough accomplished",
        "should i ",
        "do i want to",
        "do i ",
        "want to go for",
        "stop or",
        "keep going",
        "continue with",
        " vs ",
        " versus ",
    )
    return any(p in t for p in patterns)


def _asks_quick_thoughts(user_message: str) -> bool:
    t = _message_lower(user_message)
    return any(p in t for p in ("quick thoughts", "briefly", "keep it short", "quick take", "short thoughts"))


def _asks_practical(user_message: str) -> bool:
    t = _message_lower(user_message)
    return any(
        p in t
        for p in (
            "what should i",
            "what's the next step",
            "whats the next step",
            "next step",
            "how do i implement",
            "implement this",
            "architecture",
            "does this make sense",
            "pragmatic",
            "profile_id",
            "workspace_id",
            "multi-tenancy",
            "multi tenancy",
            "orchestration",
        )
    )


def _asks_anti_emotion(user_message: str) -> bool:
    t = _message_lower(user_message)
    return any(
        p in t
        for p in (
            "not my emotions",
            "not so much on my emotions",
            "don't focus on my emotions",
            "do not focus on my emotions",
            "don't analyze the family",
            "do not analyze",
            "not an analysis",
            "family dynamics",
            "not therapy",
            "pragmatic",
            "practical help",
            "direct engagement",
        )
    )


def _asks_commiseration_project(user_message: str) -> bool:
    t = _message_lower(user_message)
    return (
        any(p in t for p in ("frustrated", "irritated", "annoyed", "overcooked"))
        and any(p in t for p in ("app", "software", "responses", "journal", "cortexlog"))
    )


def _asks_household_practical(user_message: str) -> bool:
    t = _message_lower(user_message)
    return any(p in t for p in ("dad", "mom", "mother", "father", "tv volume", "household")) and any(
        p in t for p in ("practical", "two ways", "reduce the noise", "don't analyze", "do not analyze")
    )


def _merge_emphasis(base: List[str], extra: List[str]) -> List[str]:
    out = list(base)
    for e in extra:
        if e not in out:
            out.append(e)
    return out


def _heuristic_contract_from_message(user_message: str, mode_hint: str | None = None) -> Optional[ResponseContract]:
    """Build a contract from entry patterns when classifier is wrong or unavailable."""
    lowered = _message_lower(user_message)

    if _asks_commiseration_project(user_message):
        return ResponseContract(
            requested_action="listen",
            subject_matter="project_work",
            primary_intent="commiseration",
            domain="software_product_design",
            engagement_style="warm_commiserating",
            output_shape="commiseration_only",
            emphasis=["use_warmth_and_solidarity", "connect_to_user_context"],
            confidence=0.55,
            reason="Heuristic: frustration about app responses.",
        )

    if _asks_household_practical(user_message):
        override = _asks_anti_emotion(user_message)
        return ResponseContract(
            requested_action="advise",
            subject_matter="household",
            primary_intent="practical_advice",
            domain="household_family",
            engagement_style="direct_pragmatic",
            output_shape="options_with_tradeoffs",
            emphasis=_merge_emphasis(
                [],
                [
                    "include_two_options_with_tradeoffs",
                    "include_recommended_next_step",
                    "focus_on_practical_next_steps",
                ],
            ),
            confidence=0.55,
            reason="Heuristic: practical household request with anti-analysis override.",
            user_override_detected=override,
            override_summary=(
                "User requested practical help, not emotional or family-dynamics analysis."
                if override
                else None
            ),
        )

    if _asks_decision_or_continue(user_message) or (
        _asks_practical(user_message) and (" or " in lowered or "enough" in lowered)
    ):
        emphasis = [
            "focus_on_practical_next_steps",
            "include_two_options_with_tradeoffs",
            "include_recommended_next_step",
            "connect_to_user_context",
        ]
        if _asks_quick_thoughts(user_message):
            emphasis.append("keep_response_brief")
        override = _asks_anti_emotion(user_message)
        return ResponseContract(
            requested_action="decide_between_options",
            subject_matter="project_work",
            primary_intent="decision_support",
            domain="software_product_design",
            engagement_style="direct_pragmatic",
            output_shape="options_with_tradeoffs",
            emphasis=_merge_emphasis([], emphasis),
            confidence=0.55,
            reason="Heuristic: decision / stop-or-continue project planning ask.",
            user_override_detected=override,
            override_summary=(
                "User requested pragmatic, direct engagement."
                if override
                else None
            ),
        )

    if _asks_practical(user_message) and any(
        p in lowered for p in ("implement", "architecture", "database", "profile", "account", "api")
    ):
        override = _asks_anti_emotion(user_message)
        return ResponseContract(
            requested_action="advise",
            subject_matter="software_architecture",
            primary_intent="technical_reasoning",
            domain="software_product_design",
            engagement_style="direct_pragmatic",
            output_shape="implementation_recommendation",
            emphasis=_merge_emphasis(
                [],
                [
                    "focus_on_practical_next_steps",
                    "provide_architecture_guidance",
                    "provide_concrete_examples",
                    "name_the_core_tradeoff",
                    "include_recommended_next_step",
                ],
            ),
            confidence=0.5,
            reason="Heuristic: technical/pragmatic implementation ask.",
            user_override_detected=override,
            override_summary=(
                "User requested pragmatic, direct engagement rather than emotional analysis."
                if override
                else None
            ),
        )

    if mode_hint == "crisis":
        return ResponseContract(
            requested_action="reflect",
            subject_matter="self_reflection",
            stakes="acute",
            output_shape="grounding_analysis",
            engagement_style="reflective",
            confidence=0.4,
            reason="Heuristic: crisis mode hint.",
        )

    return None


def _fallback_contract(user_message: str, mode_hint: str | None) -> ResponseContract:
    heuristic = _heuristic_contract_from_message(user_message, mode_hint)
    if heuristic:
        return _apply_mode_hint(heuristic, mode_hint)

    contract = ResponseContract(
        requested_action="reflect",
        subject_matter="unknown",
        primary_intent="sense_making",
        domain="personal",
        engagement_style="reflective",
        stakes="low",
        output_shape="short_reflection",
        emphasis=["connect_to_user_context"],
        confidence=0.3,
        reason="Classifier fallback: generic default.",
    )
    if _asks_quick_thoughts(user_message):
        contract.emphasis = _merge_emphasis(list(contract.emphasis), ["keep_response_brief"])
    return _apply_mode_hint(contract, mode_hint)


def validate_contract_fit(
    contract: ResponseContract,
    user_message: str,
    mode_hint: str | None = None,
) -> ResponseValidation:
    """Validate whether the contract matches the user's communicative ask (pre-generation)."""
    del mode_hint  # reserved for future use
    missing: List[str] = []

    # Rule A — X or Y / stop or continue vs reflective default
    if _asks_decision_or_continue(user_message):
        has_decision_action = contract.requested_action in (
            "decide_between_options",
            "plan_next_steps",
        )
        has_decision_intent = contract.primary_intent in ("decision_support", "planning")
        has_options_shape = contract.output_shape in (
            "options_with_tradeoffs",
            "step_by_step_plan",
            "decision_memo",
        )
        if _is_generic_reflective_contract(contract) or not (
            has_decision_action or (has_decision_intent and has_options_shape)
        ):
            return ResponseValidation(
                passed=False,
                reason="User asks to decide or continue; contract is too reflective.",
                missing_emphasis=["include_two_options_with_tradeoffs", "include_recommended_next_step"],
            )

    # Rule B — quick thoughts
    if _asks_quick_thoughts(user_message) and "keep_response_brief" not in contract.emphasis:
        missing.append("keep_response_brief")

    # Rule C — practical ask with reflective engagement only
    if _asks_practical(user_message) and not _asks_commiseration_project(user_message):
        if contract.engagement_style == "reflective" and contract.output_shape not in _PRAGMATIC_SHAPES:
            return ResponseValidation(
                passed=False,
                reason="User asks for practical help; contract engagement is too reflective.",
                missing_emphasis=["focus_on_practical_next_steps"],
            )

    # Rule D — anti-emotion / pragmatic override
    if _asks_anti_emotion(user_message):
        if not contract.user_override_detected:
            return ResponseValidation(
                passed=False,
                reason="User requested pragmatic/direct focus; override not set.",
            )
        if contract.engagement_style == "reflective" and contract.output_shape == "short_reflection":
            return ResponseValidation(
                passed=False,
                reason="User override ignored; contract still reflective short_reflection.",
            )

    # Commiseration entry should not be forced into technical implementation
    if _asks_commiseration_project(user_message):
        if contract.output_shape == "implementation_recommendation":
            return ResponseValidation(
                passed=False,
                reason="User wants listening/commiseration about the app, not architecture advice.",
            )

    if missing:
        return ResponseValidation(
            passed=False,
            reason=f"Contract missing required emphasis: {', '.join(missing)}",
            missing_emphasis=missing,
        )

    return ResponseValidation(passed=True)


def repair_contract_from_user_ask(
    contract: ResponseContract,
    validation: ResponseValidation,
    user_message: str,
) -> ResponseContract:
    """Minimal targeted repair when contract sanity check fails."""
    repaired = _heuristic_contract_from_message(user_message)
    if repaired:
        data = contract.model_dump()
        data.update(repaired.model_dump())
        data["reason"] = f"Repaired: {validation.reason or 'contract mismatch'}. {repaired.reason}"
        data["confidence"] = max(contract.confidence, repaired.confidence)
        return ResponseContract(**data)

    data = contract.model_dump()
    if _asks_quick_thoughts(user_message):
        data["emphasis"] = _merge_emphasis(data.get("emphasis") or [], ["keep_response_brief"])
    if _asks_anti_emotion(user_message):
        data["user_override_detected"] = True
        data["override_summary"] = "User requested practical, direct engagement."
        data["engagement_style"] = "direct_pragmatic"
    if _asks_decision_or_continue(user_message):
        data.update(
            {
                "requested_action": "decide_between_options",
                "subject_matter": "project_work",
                "primary_intent": "decision_support",
                "domain": "software_product_design",
                "engagement_style": "direct_pragmatic",
                "output_shape": "options_with_tradeoffs",
            }
        )
        data["emphasis"] = _merge_emphasis(
            data.get("emphasis") or [],
            [
                "focus_on_practical_next_steps",
                "include_two_options_with_tradeoffs",
                "include_recommended_next_step",
            ],
        )
    data["reason"] = f"Repaired: {validation.reason or 'contract mismatch'}"
    return ResponseContract(**data)


def _message_text(m: dict) -> str:
    return (m.get("content") or "").strip()


def _recent_user_context_from_history(history: List[dict], limit: int = 8) -> str:
    lines: List[str] = []
    for m in history:
        if m.get("role") != "user":
            continue
        content = _message_text(m)
        if content:
            lines.append(f"user: {content[:800]}")
    return "\n".join(lines[-limit:])


def _assistant_clean_sentences(text: str, max_sentences: int = 3) -> List[str]:
    out: List[str] = []
    for raw in re.split(r"[\n\r]+|(?<=[.!?])\s+", text or ""):
        s = raw.strip(" -\t")
        lowered = s.lower()
        if not s:
            continue
        if any(lowered.startswith(label) for label in _SUMMARY_TEMPLATE_LABELS):
            continue
        if len(s) < 18:
            continue
        out.append(s)
        if len(out) >= max_sentences:
            break
    return out


def _extract_assistant_state_summary(history: List[dict], limit_turns: int = 6) -> str:
    recs: List[str] = []
    open_questions: List[str] = []
    selected_options: List[str] = []
    named_concepts: List[str] = []
    plans: List[str] = []

    assistant_turns = [m for m in history if m.get("role") == "assistant"][-limit_turns:]
    for m in assistant_turns:
        text = _message_text(m)
        if not text:
            continue
        sentences = _assistant_clean_sentences(text, max_sentences=4)
        for s in sentences:
            lowered = s.lower()
            if "?" in s and len(open_questions) < 2:
                open_questions.append(s[:180])
            if any(t in lowered for t in ("recommend", "suggest", "next step", "should")) and len(recs) < 2:
                recs.append(s[:180])
            if any(t in lowered for t in ("option 1", "option 2", "option a", "option b", "first option", "second option")) and len(selected_options) < 2:
                selected_options.append(s[:180])
            if any(t in lowered for t in ("plan", "step", "first,", "then ", "after ")) and len(plans) < 2:
                plans.append(s[:180])

        if len(named_concepts) < 4:
            for token in re.findall(r"`([^`]{2,40})`|\"([^\"]{2,40})\"|([A-Za-z][A-Za-z0-9_/-]{3,40})", text):
                candidate = next((p for p in token if p), "").strip()
                c_lower = candidate.lower()
                if not candidate:
                    continue
                if any(c_lower.startswith(label) for label in _SUMMARY_TEMPLATE_LABELS):
                    continue
                if c_lower in {"quick", "option", "recommendation", "upside", "downside"}:
                    continue
                if candidate not in named_concepts:
                    named_concepts.append(candidate)
                if len(named_concepts) >= 4:
                    break

    lines: List[str] = []
    if recs:
        lines.append("Recommendations: " + " | ".join(recs))
    if open_questions:
        lines.append("Open questions: " + " | ".join(open_questions))
    if selected_options:
        lines.append("Options discussed: " + " | ".join(selected_options))
    if plans:
        lines.append("Plans/steps: " + " | ".join(plans))
    if named_concepts:
        lines.append("Named concepts: " + ", ".join(named_concepts))
    return "\n".join(lines)


def _is_reference_followup(user_message: str) -> bool:
    t = _message_lower(user_message)
    patterns = (
        "what you said",
        "what you suggested",
        "like you said",
        "as you said",
        "as suggested",
        "as you suggested",
        "you suggested",
        "let's do that",
        "lets do that",
        "do that",
        "the second option",
        "the first option",
        "that one",
        "that approach",
        "that plan",
    )
    return any(p in t for p in patterns)


def _asks_for_task_shaped_output(user_message: str) -> bool:
    t = _message_lower(user_message)
    return any(
        p in t
        for p in (
            "option",
            "compare",
            "comparison",
            "recommend",
            "recommendation",
            "which should",
            "which one",
            "plan",
            "next step",
            "what should i",
            "how should i",
            "how do i implement",
            "implementation",
            "draft wording",
            "wording",
            "talk track",
        )
    )


def _apply_journal_guardrails(
    contract: ResponseContract,
    user_message: str,
    mode_hint: str | None,
) -> ResponseContract:
    if (mode_hint or "").strip().lower() != "journal":
        return contract
    if contract.output_shape not in _JOURNAL_TASK_SHAPES:
        return contract
    if _asks_for_task_shaped_output(user_message):
        return contract

    data = contract.model_dump()
    data.update(
        {
            "requested_action": "reflect",
            "primary_intent": "reflection",
            "engagement_style": "reflective",
            "output_shape": "short_reflection",
        }
    )
    data["reason"] = (
        f"{contract.reason} Journal guardrail: current entry does not explicitly request task-shaped output."
    ).strip()
    return ResponseContract(**data)


def _load_session_context(
    session_id: str | None,
    *,
    user_limit: int = 8,
) -> tuple[str, str, List[dict]]:
    if not session_id:
        return "", "", []
    history = list_chat_messages(session_id=session_id)
    user_context = _recent_user_context_from_history(history, limit=user_limit)
    assistant_state_summary = _extract_assistant_state_summary(history)
    user_history_messages = [
        {"role": "user", "content": _message_text(m)}
        for m in history
        if m.get("role") == "user" and _message_text(m)
    ][-12:]
    return user_context, assistant_state_summary, user_history_messages


def classify_response_contract(
    user_message: str,
    recent_user_context: str = "",
    assistant_state_summary: str = "",
    mode_hint: str | None = None,
    retrieved_context: List[str] | None = None,
) -> ResponseContract:
    ctx_block = ""
    if retrieved_context:
        ctx_block = "\n\nRetrieved notes (for domain hints only):\n" + "\n".join(retrieved_context[:3])[:1500]

    assistant_ref_block = ""
    if assistant_state_summary and _is_reference_followup(user_message):
        assistant_ref_block = (
            "\nAssistant-state summary (for reference resolution only):\n"
            f"{assistant_state_summary}"
        )

    user_prompt = f"""Recent user context:
{recent_user_context or "(none)"}
{assistant_ref_block}
{ctx_block}

UI mode hint (weak compatibility only, may be overridden by entry content): {mode_hint or "journal"}

The current user entry is authoritative.
Use assistant-state summary only to resolve references like "that" / "what you said".
Do not assume the next response should match prior assistant tone, format, or structure.

Classifier hints (not rules):
- "enough for today or multi-tenancy" → requested_action: decide_between_options, decision_support, options_with_tradeoffs
- "quick thoughts" → emphasis includes keep_response_brief

Current user entry:
{user_message}

Return a JSON response contract with this schema:
{{
  "requested_action": "...",
  "subject_matter": "...",
  "primary_intent": "...",
  "domain": "...",
  "engagement_style": "...",
  "stakes": "...",
  "output_shape": "...",
  "emphasis": ["..."],
  "needs_clarifying_question": false,
  "confidence": 0.0,
  "reason": "...",
  "user_override_detected": false,
  "override_summary": null
}}"""

    messages = [
        {"role": "system", "content": CLASSIFIER_SYSTEM},
        {"role": "user", "content": user_prompt},
    ]
    try:
        raw = chat_completion(messages, json_output=True, temperature=0.2, max_tokens=1024)
        contract = _parse_contract_json(raw)
        contract = _apply_mode_hint(contract, mode_hint)
        return contract
    except (LLMUnavailableError, json.JSONDecodeError, ValueError) as e:
        logger.warning("Contract classification failed, using fallback: %s", e)
        return _fallback_contract(user_message, mode_hint)


def _output_shape_template(output_shape: str) -> str:
    return _OUTPUT_SHAPE_TEMPLATES.get(output_shape, "")


def _contract_generation_messages(
    user_message: str,
    contract: ResponseContract,
    recent_user_context: str,
    assistant_state_summary: str,
    retrieved_context: List[str] | None,
    history_messages: List[dict],
) -> List[dict]:
    contract_json = contract.model_dump_json(indent=2)
    retrieved_block = ""
    if retrieved_context:
        retrieved_block = "\n\n".join(retrieved_context[:5])
    shape_tpl = _output_shape_template(contract.output_shape)
    user_block = f"""Response contract:
{contract_json}
{shape_tpl}

Retrieved context, if any:
{retrieved_block or "(none)"}

Recent user context:
{recent_user_context or "(none)"}

Assistant-state summary (semantic continuity only):
{assistant_state_summary or "(none)"}

User entry:
{user_message}"""

    system = SAFETY_BLOCK + "\n\n" + GENERATION_SYSTEM + shape_tpl
    messages: List[dict] = [{"role": "system", "content": system}]
    messages.extend(history_messages)
    current = (user_message or "").strip()
    if current:
        last = messages[-1] if len(messages) > 1 else None
        already = (
            bool(last)
            and last.get("role") == "user"
            and (last.get("content") or "").strip() == current
        )
        if not already:
            messages.append({"role": "user", "content": user_block})
        else:
            messages[-1] = {"role": "user", "content": user_block}
    else:
        messages.append({"role": "user", "content": user_block})
    return messages


def generate_with_contract(
    user_message: str,
    contract: ResponseContract,
    recent_user_context: str = "",
    assistant_state_summary: str = "",
    retrieved_context: List[str] | None = None,
    history_messages: List[dict] | None = None,
) -> str:
    messages = _contract_generation_messages(
        user_message,
        contract,
        recent_user_context,
        assistant_state_summary,
        retrieved_context,
        history_messages or [],
    )
    return chat_completion(messages) or ""


def _terms_from_message(text: str, min_len: int = 5) -> set[str]:
    return {
        w.lower()
        for w in re.findall(r"[A-Za-z][A-Za-z'/-]*", text or "")
        if len(w) >= min_len
    }


def _has_implementation_language(text: str, user_message: str) -> bool:
    lowered = text.lower()
    markers = (
        "implement",
        "table",
        "field",
        "profile",
        "setting",
        "step",
        "database",
        "scope",
        "architecture",
        "risk",
        "workspace",
        "migration",
        "schema",
        "api",
    )
    if any(m in lowered for m in markers):
        return True
    user_terms = _terms_from_message(user_message)
    reply_terms = _terms_from_message(text, min_len=4)
    return len(user_terms & reply_terms) >= 2


def _has_options_with_tradeoffs(text: str) -> bool:
    lowered = text.lower()
    option_signals = sum(
        1
        for m in (
            "option 1",
            "option 2",
            "option a",
            "option b",
            "path 1",
            "path 2",
            "first option",
            "second option",
        )
        if m in lowered
    )
    tradeoff_signals = any(
        m in lowered
        for m in ("tradeoff", "upside", "downside", "risk", "cost", "benefit", "when it makes sense")
    )
    return option_signals >= 1 and tradeoff_signals


def _has_talk_track(text: str) -> bool:
    lowered = text.lower()
    return any(
        m in lowered
        for m in (
            "you could say:",
            "you could say",
            "here is a way to frame it",
            "here's a way to frame it",
            "i would phrase it like",
            "here's a way to say",
        )
    )


def _has_likelihood_calibration(text: str) -> bool:
    lowered = text.lower()
    return any(
        m in lowered
        for m in (
            "likely",
            "unlikely",
            "in most cases",
            "the odds are",
            "low probability",
            "higher probability",
        )
    )


def validate_response_fit(
    response_text: str,
    contract: ResponseContract,
    user_message: str,
) -> ResponseValidation:
    text = (response_text or "").strip()
    if not text:
        return ResponseValidation(passed=False, reason="Empty response.")

    missing: List[str] = []
    shape = contract.output_shape

    if shape == "implementation_recommendation" and not _has_implementation_language(text, user_message):
        return ResponseValidation(
            passed=False,
            reason="Missing practical implementation/architecture language.",
            missing_emphasis=list(contract.emphasis),
        )

    if shape == "options_with_tradeoffs" and not _has_options_with_tradeoffs(text):
        return ResponseValidation(
            passed=False,
            reason="Missing two options with tradeoff language.",
            missing_emphasis=list(contract.emphasis),
        )

    if "include_talk_track" in contract.emphasis and not _has_talk_track(text):
        missing.append("include_talk_track")

    if "calibrate_likelihoods" in contract.emphasis and not _has_likelihood_calibration(text):
        missing.append("calibrate_likelihoods")

    if "keep_response_brief" in contract.emphasis and len(text.split()) > 220:
        missing.append("keep_response_brief")

    if contract.user_override_detected and contract.override_summary:
        override_lower = (contract.override_summary or "").lower()
        if "emotion" in override_lower or "pragmatic" in override_lower or "direct" in override_lower:
            emotional_only = (
                "how did that make you feel" in text.lower()
                and not _has_implementation_language(text, user_message)
                and shape == "implementation_recommendation"
            )
            if emotional_only:
                return ResponseValidation(
                    passed=False,
                    reason="User override for pragmatic focus not respected.",
                    missing_emphasis=list(contract.emphasis),
                )

    if missing:
        return ResponseValidation(
            passed=False,
            reason=f"Missing emphasis signals: {', '.join(missing)}",
            missing_emphasis=missing,
        )

    return ResponseValidation(passed=True)


def _correction_appendix(contract: ResponseContract, validation: ResponseValidation) -> str:
    parts = [
        "\n\nThe previous response did not fully match the response contract.",
        validation.reason or "Mismatch detected.",
        "\nRewrite the response using the contract more directly.",
    ]
    if validation.missing_emphasis:
        parts.append("\nFocus especially on:\n- " + "\n- ".join(validation.missing_emphasis))
    if contract.emphasis:
        parts.append("\nContract emphasis:\n- " + "\n- ".join(contract.emphasis))
    parts.append(f"\nUse the requested output shape: {contract.output_shape}")
    parts.append(f"\nRequested action: {contract.requested_action}")
    if contract.user_override_detected and contract.override_summary:
        parts.append(f"\nRespect this user override:\n{contract.override_summary}")
    return "".join(parts)


def retry_with_contract_correction(
    user_message: str,
    contract: ResponseContract,
    prior_response: str,
    validation: ResponseValidation,
    recent_user_context: str = "",
    assistant_state_summary: str = "",
    retrieved_context: List[str] | None = None,
    history_messages: List[dict] | None = None,
) -> str:
    appendix = _correction_appendix(contract, validation)
    messages = _contract_generation_messages(
        user_message,
        contract,
        recent_user_context,
        assistant_state_summary,
        retrieved_context,
        history_messages or [],
    )
    neutral_issue = validation.reason or "Mismatch detected."
    messages[0]["content"] = messages[0]["content"] + appendix
    messages.append(
        {
            "role": "user",
            "content": (
                "Rewrite to match the contract.\n"
                f"Mismatch reason: {neutral_issue}\n"
                "Do not reuse prior response structure. Focus on contract fit and current user entry."
            ),
        }
    )
    if validation.reason and "Empty response" in validation.reason:
        messages.append(
            {
                "role": "user",
                "content": (
                    "Minimal prior draft context (for debugging only, not style guidance):\n"
                    f"{prior_response[:320]}"
                ),
            }
        )
    try:
        return chat_completion(messages) or prior_response
    except LLMUnavailableError:
        return prior_response


def response_contract_log_path() -> str:
    return str(DATA_DIR / "response_contract_debug.log")


def _log_debug_metadata(
    contract: ResponseContract,
    validation: ResponseValidation,
    retry_used: bool,
    *,
    original_contract: Optional[dict] = None,
    contract_validation: Optional[ResponseValidation] = None,
    contract_repaired: bool = False,
    response_preview: str = "",
) -> None:
    if not is_response_contract_log_enabled():
        return
    payload = {
        "timestamp": int(time.time() * 1000),
        "contract": contract.model_dump(),
        "original_contract": original_contract,
        "contract_validation_passed": contract_validation.passed if contract_validation else True,
        "contract_validation_reason": contract_validation.reason if contract_validation else None,
        "contract_repaired": contract_repaired,
        "validation_passed": validation.passed,
        "retry_used": retry_used,
        "validation_reason": validation.reason,
        "response_preview": (response_preview or "")[:500],
    }
    line = json.dumps(payload, default=str) + "\n"
    logger.info("response_contract_debug %s", line.strip())
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        with (DATA_DIR / "response_contract_debug.log").open("a", encoding="utf-8") as f:
            f.write(line)
    except OSError:
        pass


def orchestrate_response(
    user_message: str,
    mode_hint: str | None = None,
    retrieved_context: List[str] | None = None,
    session_id: str | None = None,
) -> dict[str, Any]:
    """Classify → validate contract → repair → generate → validate response → retry once."""
    recent_user_context, assistant_state_summary, history_messages = _load_session_context(session_id)

    contract = classify_response_contract(
        user_message=user_message,
        recent_user_context=recent_user_context,
        assistant_state_summary=assistant_state_summary,
        mode_hint=mode_hint,
        retrieved_context=retrieved_context,
    )
    original_contract = contract.model_dump()

    contract_validation = validate_contract_fit(contract, user_message, mode_hint)
    contract_repaired = False
    if not contract_validation.passed:
        contract = repair_contract_from_user_ask(contract, contract_validation, user_message)
        contract_repaired = True
    guarded_contract = _apply_journal_guardrails(contract, user_message, mode_hint)
    if guarded_contract.model_dump() != contract.model_dump():
        contract = guarded_contract
        contract_repaired = True

    response_text = generate_with_contract(
        user_message=user_message,
        contract=contract,
        recent_user_context=recent_user_context,
        assistant_state_summary=assistant_state_summary,
        retrieved_context=retrieved_context,
        history_messages=history_messages,
    )

    validation = validate_response_fit(response_text, contract, user_message)
    retry_used = False

    if not validation.passed:
        retry_used = True
        response_text = retry_with_contract_correction(
            user_message=user_message,
            contract=contract,
            prior_response=response_text,
            validation=validation,
            recent_user_context=recent_user_context,
            assistant_state_summary=assistant_state_summary,
            retrieved_context=retrieved_context,
            history_messages=history_messages,
        )
        validation = validate_response_fit(response_text, contract, user_message)

    _log_debug_metadata(
        contract,
        validation,
        retry_used,
        original_contract=original_contract,
        contract_validation=contract_validation,
        contract_repaired=contract_repaired,
        response_preview=response_text,
    )

    debug = {
        "contract": contract.model_dump(),
        "original_contract": original_contract,
        "contract_validation": contract_validation.model_dump(),
        "contract_repaired": contract_repaired,
        "validation": validation.model_dump(),
        "retry_used": retry_used,
    }
    return {"text": response_text, "debug": debug}
