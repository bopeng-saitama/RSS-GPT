from __future__ import annotations


CORE_TOPIC_TERMS = (
    "cbdc",
    "central bank digital currency",
    "digital currency",
    "digital euro",
    "digital pound",
    "digital yuan",
    "e-cny",
    "e-hkd",
    "e-krona",
    "stablecoin",
    "crypto-asset",
    "crypto asset",
    "virtual asset",
    "virtual currency",
    "cryptocurrency",
    "digital asset",
    "digital money",
    "tokenized deposits",
    "tokenised deposits",
    "tokenized securities",
    "tokenised securities",
    "unified ledger",
    "mbridge",
    "project agora",
    "project agorá",
)

ROUNDUP_PATTERNS = (
    "what happened in crypto today",
    "today in crypto",
    "crypto today",
    "daily crypto roundup",
    "weekly crypto roundup",
    "market wrap",
    "news roundup",
)


def _keyword_hits(text: str, keywords: list[str]) -> set[str]:
    lowered = text.lower()
    return {keyword.lower() for keyword in keywords if keyword and keyword.lower() in lowered}


def _looks_like_roundup(article: dict) -> bool:
    title = str(article.get("title", "")).lower()
    summary = str(article.get("summary", "")).lower()
    url = str(article.get("url", "")).lower()
    combined = " ".join([title, summary, url])
    return any(pattern in combined for pattern in ROUNDUP_PATTERNS)


def article_matches_source(article: dict, source) -> bool:
    return article_match_reason(article, source) == "matched"


def article_match_reason(article: dict, source) -> str:
    if _looks_like_roundup(article):
        return "roundup_miss"

    strict_text = " ".join(
        [
            str(article.get("title", "")).lower(),
            str(article.get("summary", "")).lower(),
        ]
    )
    candidate_text = " ".join(
        [
            strict_text,
            str(article.get("url", "")).lower(),
            str(article.get("feed_url", "")).lower(),
        ]
    )
    full_text = " ".join(
        [
            strict_text,
            str(article.get("excerpt", "")).lower(),
            str(article.get("body_text", "")).lower(),
            str(article.get("url", "")).lower(),
            str(article.get("feed_url", "")).lower(),
        ]
    )

    strong_keywords = list(getattr(source, "strong_keywords", []) or [])
    medium_keywords = list(getattr(source, "medium_keywords", []) or [])

    if _keyword_hits(strict_text, strong_keywords):
        return "matched"

    candidate_signal = _keyword_hits(candidate_text, strong_keywords) | _keyword_hits(candidate_text, medium_keywords)
    if candidate_signal:
        if _keyword_hits(full_text, strong_keywords):
            return "matched"
        if len(_keyword_hits(full_text, medium_keywords)) >= 2 and _keyword_hits(full_text, list(CORE_TOPIC_TERMS)):
            return "matched"
        return "weak_candidate_miss"

    return "keyword_miss"
