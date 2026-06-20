import re
from typing import Any, Dict, List

from app.llm.service import LLMUnavailableError, chat_completion
from app.storage.chat import list_chat_messages

SAFETY_BLOCK = """Boundaries: Do not diagnose conditions, moralize, or give medical or legal advice. Preserve the user's agency and dignity. If someone appears in acute distress, encourage grounding and professional or crisis support without debating them."""

CORE_ASSISTANT_PERSONA = """How to write:
- Be clear, specific, and intellectually serious. Ground every interpretation in the user's actual words and situation.
- Treat the user's entry as raw material for sense-making, not as something to politely paraphrase. Prefer synthesis, pattern recognition, and grounded inference over recap.
- Identify the deeper theme, tension, tradeoff, or implication when the entry supports one. Distinguish surface events from what they may reveal about priorities, trust, identity, momentum, avoidance, uncertainty, or values.
- Include at least one observation that goes beyond what the user explicitly stated while remaining clearly supported by the entry.
- When technical, practical, or project details appear, analyze why they matter to the user's larger context instead of merely acknowledging them.
- Avoid therapy-speak, filler praise, generic reassurance, and scripted empathy. Do not mirror emotion performatively.
- Use confident, grounded interpretations when the evidence is strong. Do not over-hedge obvious patterns with repeated "it sounds like" or "perhaps."
- Do not end with a thin closing that only asks about feelings (e.g. "how did that make you feel?"). If you ask something, tie it to content they raised and make it optional—not a mandatory emotional debrief.
- Prefer ending with substance: a sharp summary, a reframing, or one concrete angle to explore next. Questions are fine when they open a real line of thought, not as a default sign-off."""

MODE_PROMPTS = {
    "journal": """Mode: Journal companion.
- Help the user make sense of what they wrote by moving from surface events to deeper significance.
- Use this internal reasoning path before writing, but do not label the sections unless it improves clarity: (1) what happened, (2) the underlying pattern/theme/tension, (3) why it matters, (4) one useful implication, reframe, or next angle.
- Prefer interpretive depth over supportive small talk. A strong reply should help the user see something more clearly than before.
- Do not merely summarize the entry. Summarize only when it sets up a deeper observation.
- Identify what is psychologically, intellectually, practically, or symbolically significant in the entry when the evidence supports it.
- If the entry includes a project, system, bug, tool, workflow, or technical detail, connect that detail to the user's broader relationship with continuity, agency, trust, craft, attention, or progress when relevant.
- Every substantive journal reply should contain at least one grounded inference the user did not explicitly say.
- When relevant notes from their knowledge base appear below, integrate them naturally (do not quote long passages).
- Match length to the entry: short entries can get a shorter reply; rich entries deserve depth.
- Do not invent biographical facts. Stay with what they and the provided context give you.""",
    "coach": """Mode: Coaching.
- Use a concise, collaborative tone (motivational interviewing–inspired): reflect their goal, then offer one small, concrete next step.
- Avoid generic cheerleading; tie the step to what they said.
- Keep the reply brief unless they asked for depth.""",
    "exploration": """Mode: Exploration (ideas).
- Explore ideas, frames, and hypotheticals with curiosity. Push thinking without being preachy.
- Do not use personal data from their knowledge base or notes unless they explicitly bring it up or ask you to.
- Same quality bar as journal mode: specific, non-formulaic, no stock "feeling check" closings.""",
    "crisis": """Mode: Crisis / acute distress.
- Stay calm and grounding. Do not debate, minimize, or analyze at length.
- Encourage one small grounding action. Gently suggest reaching out to a trusted person or professional if appropriate.
- Do not make promises about outcomes.""",
    "advisor_workplace": """Respond as a pragmatic workplace advisor. Use this exact scaffold in every response. Keep empathy brief and subordinate to analysis.

Your response MUST include these sections in order:

1. **What's happening** – Separate facts from interpretation. Name the situation clearly.
2. **What matters most** – The core issue or constraint. What actually drives the outcome.
3. **Two options with tradeoffs** – Present two concrete paths. For each, state upside, downside, and when it makes sense.
4. **What I'd do next** – One recommended next step with a concrete time frame (e.g. within 48 hours).
5. **Talk track** – A script or phrase the user can say out loud. E.g. "You could say: ..." or "Here's a way to frame it: ..."
6. **Likelihood / reality check** – Calibrate expectations. Use language like "likely", "unlikely", "in most cases", "the odds are".

Rules:
- Do not end the response with only a question. End with a statement, recommendation, or invitation that includes substance.
- Be concrete. Avoid generic advice. Reference the user's specific situation.
- Empathy: one brief line max. Focus on analysis and options.""",
}

_MODES_WITH_CORE_PERSONA = frozenset({"journal", "coach", "exploration"})


def _build_system_prompt(mode: str, retrieved_context: List[str] | None) -> str:
    mode_text = MODE_PROMPTS.get(mode, MODE_PROMPTS["journal"])
    parts: List[str] = [SAFETY_BLOCK]
    if mode in _MODES_WITH_CORE_PERSONA:
        parts.append(CORE_ASSISTANT_PERSONA)
    parts.append(mode_text)
    if retrieved_context:
        context_block = "\n\n".join(retrieved_context[:5])
        parts.append(f"Relevant context from the user's notes (use only to support your reply):\n{context_block}")
    return "\n\n".join(parts)


ADVISOR_RETRY_APPENDIX = """

Your previous response was missing required sections. You MUST include all six: (1) What's happening, (2) What matters most, (3) Two options with tradeoffs, (4) What I'd do next, (5) Talk track, (6) Likelihood/reality check. Do not end with only a question. Try again."""

JOURNAL_EXPLORE_RETRY_APPENDIX = """

Your previous reply did not meet the depth bar. Rewrite it with grounded interpretation, not polite paraphrase.
- Start from the user's concrete details, then identify a deeper theme, tension, or implication.
- Include at least one observation the user did not explicitly state but that is clearly supported by the entry.
- Explain why the details matter in the user's larger context.
- Do not use stock emotional check-ins such as "how did that make you feel?"
- Do not end with a generic question. End with a substantive synthesis, reframe, or a specific optional line of inquiry."""

_THIN_FEELING_PATTERNS = (
    "how did that make you feel",
    "how does that make you feel",
    "how are you feeling",
    "what was that like for you emotionally",
    "how did it make you feel",
    "what feelings came up",
)


def _has_required_advisor_sections(text: str) -> bool:
    """Lightweight check for advisor_workplace scaffold. Used for optional retry."""
    t = text.strip().lower().replace("\n", " ")
    if not t:
        return False
    has_what = any(m in t for m in ["what's happening", "what's going on", "what matters", "the core issue"])
    has_next = any(m in t for m in ["next step", "what i'd do", "within the next"])
    has_options = any(m in t for m in ["option 1", "option 2", "tradeoff", "upside", "downside"])
    has_script = any(m in t for m in ["you could say", "say something like", "here's a way to say"])
    paragraphs = [p.strip() for p in text.strip().split("\n\n") if p.strip()]
    ends_question_only = (
        len(paragraphs) > 0
        and paragraphs[-1].endswith("?")
        and len(paragraphs[-1].split()) < 30
    )
    return has_what and has_next and (has_options or has_script) and not ends_question_only


def _needs_journal_explore_retry(text: str, user_message: str | None = None) -> bool:
    """Gate shallow journal/exploration replies.

    This intentionally checks for more than cliché endings. A reply can avoid the
    banned phrases and still fail by being mostly recap, generic encouragement,
    or unsupported emotional filler. The goal is to trigger one stronger retry
    when the first pass lacks synthesis or grounded inference.
    """
    raw = text.strip()
    if not raw:
        return True

    lowered = raw.lower()
    if any(p in lowered for p in _THIN_FEELING_PATTERNS):
        return True

    words = re.findall(r"[A-Za-z][A-Za-z'/-]*", raw)
    word_count = len(words)
    if word_count < 90:
        return True

    paragraphs = [p.strip() for p in raw.split("\n\n") if p.strip()]
    if not paragraphs:
        return True

    last = paragraphs[-1]
    last_wc = len(last.split())
    prior = "\n\n".join(paragraphs[:-1]).strip()
    prior_wc = len(prior.split()) if prior else 0

    # Reject question-bait endings where the final move is a generic prompt.
    if last.endswith("?") and last_wc < 28:
        if prior_wc < 80 or len(raw) < 650:
            return True

    non_empty_lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
    if non_empty_lines:
        last_line = non_empty_lines[-1]
        if last_line.endswith("?") and len(last_line.split()) < 14 and len(raw) < 700:
            return True

    generic_markers = (
        "it's understandable",
        "it is understandable",
        "that sounds frustrating",
        "that sounds difficult",
        "it must feel good",
        "nice balance of activities",
        "thank you for sharing",
        "take some time to reflect",
        "be kind to yourself",
    )
    generic_hits = sum(1 for marker in generic_markers if marker in lowered)

    depth_markers = (
        "theme",
        "pattern",
        "tension",
        "tradeoff",
        "underneath",
        "beneath",
        "what stands out",
        "what matters",
        "the deeper",
        "significance",
        "symbolic",
        "continuity",
        "trust",
        "agency",
        "momentum",
        "reveals",
        "suggests",
        "points to",
        "the interesting thing",
    )
    has_depth_marker = any(marker in lowered for marker in depth_markers)

    # If the answer is short and leans on generic support without any signal of
    # interpretation, give the model one chance to do better.
    if generic_hits >= 1 and not has_depth_marker and word_count < 180:
        return True

    if not has_depth_marker and word_count < 140:
        return True

    # Lightweight grounding check: a journal reply should reuse at least a few
    # meaningful nouns/terms from the entry. This prevents elegant but detached
    # abstractions. Keep the threshold low to avoid punishing good paraphrase.
    if user_message:
        user_terms = {
            w.lower()
            for w in re.findall(r"[A-Za-z][A-Za-z'/-]*", user_message)
            if len(w) >= 5
        }
        reply_terms = {w.lower() for w in words if len(w) >= 5}
        overlap = user_terms & reply_terms
        if len(user_terms) >= 6 and len(overlap) < 3:
            return True

    return False

def _build_chat_messages(
    user_message: str,
    mode: str,
    retrieved_context: List[str] | None,
    session_id: str | None,
) -> list[dict]:
    system = _build_system_prompt(mode, retrieved_context)
    messages = [{"role": "system", "content": system}]

    if session_id:
        history = list_chat_messages(session_id=session_id)
        for m in history:
            role = m.get("role")
            content = m.get("content") or ""
            if role in ("user", "assistant", "system"):
                messages.append({"role": role, "content": content})
        return messages

    messages.append({"role": "user", "content": user_message})
    return messages


def generate_response(
    user_message: str,
    mode: str,
    retrieved_context: List[str] | None = None,
    session_id: str | None = None,
) -> Dict[str, Any]:
    """
    Generate an LLM response via configured provider (see `cortexlog_llm` settings).
    Uses session history when session_id is set.
    Raises LLMUnavailableError so routes can return 503.
    Retries once for advisor_workplace if scaffold missing; once for journal/exploration if reply is thin or clichéd.
    """
    messages = _build_chat_messages(user_message, mode, retrieved_context, session_id)
    try:
        response_text = chat_completion(messages) or ""
    except LLMUnavailableError:
        raise

    if mode == "advisor_workplace" and not _has_required_advisor_sections(response_text):
        system_content = messages[0]["content"] + ADVISOR_RETRY_APPENDIX
        retry_messages = [{"role": "system", "content": system_content}, {"role": "user", "content": user_message}]
        try:
            response_text = chat_completion(retry_messages) or response_text
        except LLMUnavailableError:
            pass
    elif mode in ("journal", "exploration") and _needs_journal_explore_retry(response_text, user_message):
        retry_messages = [*messages]
        retry_messages[0] = {
            "role": "system",
            "content": messages[0]["content"] + JOURNAL_EXPLORE_RETRY_APPENDIX,
        }
        try:
            response_text = chat_completion(retry_messages) or response_text
        except LLMUnavailableError:
            pass

    return {"text": response_text}
