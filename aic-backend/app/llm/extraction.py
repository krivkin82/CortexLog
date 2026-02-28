import re
from dataclasses import dataclass
from typing import List


@dataclass
class ExtractedEntity:
    entity_type: str
    label: str
    classification: str
    confidence: str


@dataclass
class ProposedInsight:
    insight_type: str
    content: str
    supporting_excerpt: str


HIGH_IMPACT_PATTERNS = [
    (re.compile(r"\bI am ([^.!?\n]+)", re.IGNORECASE), "identity_statement"),
    (re.compile(r"\bdiagnosed with ([^.!?\n]+)", re.IGNORECASE), "mental_health_label"),
    (re.compile(r"\bI have ([^.!?\n]+)", re.IGNORECASE), "mental_health_label"),
    (re.compile(r"\b(?:he|she|they) (?:is|are) (abusive|toxic|narcissist[^.!?\n]*)", re.IGNORECASE), "relationship_conclusion"),
    (re.compile(r"\b(spiritual truth|destiny|the universe wants|cosmic law)\b", re.IGNORECASE), "metaphysical_as_fact"),
]


HASHTAG_PATTERN = re.compile(r"#([A-Za-z0-9_]+)")
STOPWORDS = {"of", "and", "the", "a", "an", "to", "in", "on", "for"}


def extract_entities(text: str) -> List[ExtractedEntity]:
    hashtags = HASHTAG_PATTERN.findall(text)
    return [
        ExtractedEntity(
            entity_type="topic",
            label=tag,
            classification="interpretation",
            confidence="low",
        )
        for tag in hashtags
        if len(tag) >= 3 and not tag.isnumeric() and tag.lower() not in STOPWORDS
    ]


def detect_high_impact(text: str) -> List[ProposedInsight]:
    insights: List[ProposedInsight] = []
    for pattern, insight_type in HIGH_IMPACT_PATTERNS:
        for match in pattern.finditer(text):
            snippet = match.group(0).strip()
            insights.append(
                ProposedInsight(
                    insight_type=insight_type,
                    content=snippet,
                    supporting_excerpt=snippet,
                )
            )
    return insights
