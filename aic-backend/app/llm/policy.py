DISTRESS_KEYWORDS = {
    "suicide",
    "self-harm",
    "kill myself",
    "can't go on",
    "panic attack",
    "end it",
    "hopeless",
}

INJECTION_PATTERNS = [
    "ignore previous instructions",
    "system prompt",
    "developer message",
    "do not follow",
    "override",
    "tool call",
]


def detect_distress(text: str) -> bool:
    lowered = text.lower()
    return any(keyword in lowered for keyword in DISTRESS_KEYWORDS)


WORKPLACE_ROUTING_KEYWORDS = [
    "workplace", "work", "boss", "manager", "coworker", "colleague", "employer",
    "career", "job", "promotion", "lateral move", "resign", "quit", "fired",
    "conflict", "confrontation", "disagreement", "tension", "defensive", "cya",
    "reputation", "reputation_fear", "hr", "meeting", "performance review",
]


def is_workplace_prompt(content: str) -> bool:
    """Detect workplace/career/conflict/reputation-fear prompts for advisor_workplace routing."""
    lowered = content.lower()
    return any(kw in lowered for kw in WORKPLACE_ROUTING_KEYWORDS)


def normalize_mode(mode: str | None) -> str:
    if not mode:
        return "journal"
    mode = mode.lower()
    if mode in {"journal", "coach", "exploration", "crisis", "advisor_workplace"}:
        return mode
    return "journal"


def is_prompt_injection(text: str) -> bool:
    lowered = text.lower()
    return any(pattern in lowered for pattern in INJECTION_PATTERNS)


def sanitize_context(chunks: list[str]) -> list[str]:
    return [chunk for chunk in chunks if not is_prompt_injection(chunk)]
