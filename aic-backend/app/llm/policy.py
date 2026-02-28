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


def normalize_mode(mode: str | None) -> str:
    if not mode:
        return "journal"
    mode = mode.lower()
    if mode in {"journal", "coach", "exploration", "crisis"}:
        return mode
    return "journal"


def is_prompt_injection(text: str) -> bool:
    lowered = text.lower()
    return any(pattern in lowered for pattern in INJECTION_PATTERNS)


def sanitize_context(chunks: list[str]) -> list[str]:
    return [chunk for chunk in chunks if not is_prompt_injection(chunk)]
