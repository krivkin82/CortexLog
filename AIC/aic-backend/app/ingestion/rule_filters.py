import re
from typing import Optional


PATH_KEYWORDS = [
    "license",
    "licence",
    "terms",
    "privacy",
    "policy",
    "agreement",
    "disclaimer",
    "warranty",
    "liability",
    "indemnify",
    "arbitration",
    "governing law",
    "gdpr",
    "hipaa",
    "cookie",
    "compliance",
    "disclosures",
]

PHRASE_BLOCKLIST = [
    "this agreement",
    "terms and conditions",
    "limitation of liability",
    "you agree to",
    "governing law",
    "arbitration",
    "indemnify",
    "hold harmless",
    "without warranty",
    "all rights reserved",
    "privacy policy",
]

SECTION_PATTERN = re.compile(r"\b\d+(\.\d+){1,}\b")


def filter_reason(text: str, path: str | None) -> Optional[str]:
    lowered = text.lower()
    if path:
        path_lower = path.lower()
        for keyword in PATH_KEYWORDS:
            if keyword in path_lower:
                return f"path_keyword:{keyword}"
    for phrase in PHRASE_BLOCKLIST:
        if phrase in lowered:
            return f"phrase:{phrase}"
    words = _word_count(lowered)
    if words < 8:
        return "heuristic:too_short"
    if _caps_ratio(text) > 0.6:
        return "heuristic:high_caps"
    if _section_density(text) > 0.15:
        return "heuristic:section_density"
    return None


def _word_count(text: str) -> int:
    return len([w for w in text.split() if w.strip()])


def _caps_ratio(text: str) -> float:
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return 0.0
    caps = [c for c in letters if c.isupper()]
    return len(caps) / len(letters)


def _section_density(text: str) -> float:
    matches = SECTION_PATTERN.findall(text)
    words = _word_count(text)
    if words == 0:
        return 0.0
    return len(matches) / words
