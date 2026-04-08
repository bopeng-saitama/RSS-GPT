from __future__ import annotations

from hashlib import sha1
import logging
import re
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

try:
    from bs4 import BeautifulSoup
except ModuleNotFoundError:  # pragma: no cover - exercised via fallback path
    BeautifulSoup = None

try:
    import feedparser
except ModuleNotFoundError:  # pragma: no cover - exercised via fallback path
    feedparser = None

try:
    import requests
except ModuleNotFoundError:  # pragma: no cover - exercised via fallback path
    requests = None

from dcw.extract import body_text_from_html, clean_body_html, distill_article_html, excerpt_from_summary_or_body
from dcw.filtering import article_match_reason
from dcw.timezone_utils import is_recent_day_in_shanghai, parse_feed_datetime, to_shanghai


LOGGER = logging.getLogger(__name__)
REQUEST_TIMEOUT = 20
REQUEST_HEADERS = {
    "User-Agent": "DigitalCurrencyWatch/1.0 (+https://example.invalid)",
    "Accept": "application/atom+xml,application/rss+xml,application/xml,text/xml,text/html;q=0.9,*/*;q=0.8",
}
FALLBACK_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": REQUEST_HEADERS["Accept"],
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
}
CONTENT_CONTAINER_SELECTORS = (
    "article",
    "main article",
    "main",
    "[role='main']",
    ".article-body",
    ".article-content",
    ".entry-content",
    ".post-content",
    ".story-body",
    ".article",
    ".content",
)
BODY_FALLBACK_PATTERN = re.compile(
    r"<(?P<tag>article|main|body)\b[^>]*>(?P<body>.*?)</(?P=tag)>",
    flags=re.IGNORECASE | re.DOTALL,
)
TRACKING_QUERY_PREFIXES = ("utm_",)
TRACKING_QUERY_KEYS = {
    "ref",
    "refs",
    "source",
    "campaign",
    "cmpid",
    "cmp",
    "output",
    "rss",
}


class _StdlibResponse:
    def __init__(self, status_code: int, content: bytes, headers: dict | None = None):
        self.status_code = status_code
        self.content = content
        self.headers = headers or {}

    @property
    def text(self) -> str:
        return self.content.decode("utf-8", errors="ignore")


def _local_name(tag: str) -> str:
    return tag.split("}", 1)[-1]


def _element_text_or_html(element: ET.Element | None) -> str:
    if element is None:
        return ""

    parts: list[str] = []
    if element.text:
        parts.append(element.text)
    for child in list(element):
        parts.append(ET.tostring(child, encoding="unicode", method="html"))
        if child.tail:
            parts.append(child.tail)
    return "".join(parts).strip()


def _first_child(element: ET.Element, *names: str) -> ET.Element | None:
    for child in list(element):
        if _local_name(child.tag) in names:
            return child
    return None


def _parse_feed_entries_stdlib(raw_feed: str | bytes) -> list[dict]:
    if isinstance(raw_feed, bytes):
        text = raw_feed.decode("utf-8", errors="ignore")
    else:
        text = raw_feed

    root = ET.fromstring(text)
    root_name = _local_name(root.tag)
    entries: list[dict] = []

    if root_name == "feed":
        for entry in root.findall(".//*"):
            if _local_name(entry.tag) != "entry":
                continue
            link_el = _first_child(entry, "link")
            author_el = _first_child(entry, "author")
            author_name_el = _first_child(author_el, "name") if author_el is not None else None
            entries.append(
                {
                    "title": _element_text_or_html(_first_child(entry, "title")),
                    "link": (link_el.get("href") if link_el is not None else "") or _element_text_or_html(link_el),
                    "updated": _element_text_or_html(_first_child(entry, "updated")),
                    "published": _element_text_or_html(_first_child(entry, "published")),
                    "summary": _element_text_or_html(_first_child(entry, "summary")),
                    "content": [{"value": _element_text_or_html(_first_child(entry, "content"))}],
                    "author": _element_text_or_html(author_name_el or author_el),
                }
            )
    else:
        channel = _first_child(root, "channel") or root
        for item in list(channel):
            if _local_name(item.tag) != "item":
                continue
            entries.append(
                {
                    "title": _element_text_or_html(_first_child(item, "title")),
                    "link": _element_text_or_html(_first_child(item, "link")),
                    "published": _element_text_or_html(_first_child(item, "pubDate")),
                    "summary": _element_text_or_html(_first_child(item, "description")),
                    "content": [{"value": _element_text_or_html(_first_child(item, "encoded", "content"))}],
                    "author": _element_text_or_html(_first_child(item, "creator", "author")),
                }
            )

    return entries


def _stdlib_get(url: str, headers: dict | None = None, timeout: int | None = None):
    request = Request(url, headers=headers or {})
    try:
        with urlopen(request, timeout=timeout) as response:
            return _StdlibResponse(
                status_code=getattr(response, "status", response.getcode()),
                content=response.read(),
                headers=dict(getattr(response, "headers", {})),
            )
    except HTTPError as error:
        return _StdlibResponse(
            status_code=error.code,
            content=error.read(),
            headers=dict(getattr(error, "headers", {})),
        )
    except URLError:
        raise


DEFAULT_HTTP_GET = requests.get if requests is not None else _stdlib_get


def _safe_http_get(http_get, url: str, **kwargs):
    try:
        return http_get(url, **kwargs)
    except TypeError:
        return http_get(url)


def _fetch_with_header_fallback(http_get, url: str, headers: dict | None, timeout: int):
    response = _safe_http_get(
        http_get,
        url,
        headers=headers,
        timeout=timeout,
    )
    status_code = getattr(response, "status_code", 200)
    if status_code != 403:
        return response

    LOGGER.info("retrying 403 response for %s with browser headers", url)
    return _safe_http_get(
        http_get,
        url,
        headers=FALLBACK_BROWSER_HEADERS,
        timeout=timeout,
    )


def _entry_link(entry: dict) -> str:
    if entry.get("link"):
        return str(entry.get("link"))

    for link in entry.get("links", []) or []:
        href = link.get("href")
        rel = link.get("rel")
        if href and rel in (None, "alternate"):
            return str(href)
    return ""


def _entry_content_html(entry: dict) -> str:
    content = entry.get("content", []) or []
    for item in content:
        value = item.get("value")
        if value:
            return str(value)
    return ""


def _entry_author(entry: dict) -> str:
    if entry.get("author"):
        return str(entry.get("author"))
    authors = entry.get("authors", []) or []
    for author in authors:
        if author.get("name"):
            return str(author.get("name"))
    return ""


def _entry_published_raw(entry: dict) -> str:
    for key in ("published", "updated", "created"):
        value = entry.get(key)
        if value:
            return str(value)
    return ""


def _best_content_candidate(soup: BeautifulSoup):
    candidates = []
    seen = set()

    for selector in CONTENT_CONTAINER_SELECTORS:
        for node in soup.select(selector):
            node_id = id(node)
            if node_id in seen:
                continue
            seen.add(node_id)
            candidates.append(node)

    if not candidates and soup.body:
        candidates.append(soup.body)

    if not candidates:
        return None

    def score(node) -> tuple[int, int, int]:
        distilled = distill_article_html(str(node))
        text = body_text_from_html(distilled)
        paragraphs = distilled.count("<p")
        raw_length = len(node.get_text(" ", strip=True))
        return (len(text), paragraphs, -raw_length)

    return max(candidates, key=score)


def extract_article_body_from_html(raw_html: str) -> tuple[str, str]:
    if BeautifulSoup is None:
        match = BODY_FALLBACK_PATTERN.search(raw_html)
        body_html = match.group("body") if match else raw_html
        cleaned_html = distill_article_html(body_html)
        return cleaned_html, body_text_from_html(cleaned_html)

    soup = BeautifulSoup(raw_html, "html.parser")
    candidate = _best_content_candidate(soup)
    if candidate is None:
        return "", ""

    cleaned_html = distill_article_html(str(candidate))
    body_text = body_text_from_html(cleaned_html)
    return cleaned_html, body_text


def fetch_article_page(url: str, http_get=DEFAULT_HTTP_GET) -> tuple[str, str]:
    if not url:
        return "", ""

    try:
        response = _fetch_with_header_fallback(
            http_get,
            url,
            headers=REQUEST_HEADERS,
            timeout=REQUEST_TIMEOUT,
        )
    except Exception as error:  # pragma: no cover - network failure path
        LOGGER.warning("failed to fetch article page %s: %s", url, error)
        return "", ""

    status_code = getattr(response, "status_code", 200)
    if status_code >= 400:
        LOGGER.warning("article page returned non-success status %s for %s", status_code, url)
        return "", ""

    if hasattr(response, "text"):
        html = response.text
    else:
        content = getattr(response, "content", b"")
        html = content.decode("utf-8", errors="ignore")

    return extract_article_body_from_html(html)


def _build_article_id(source_id: str, url: str, title: str, published_at: str) -> str:
    base = f"{source_id}|{url}|{title}|{published_at}"
    digest = sha1(base.encode("utf-8")).hexdigest()[:12]
    return f"{source_id}-{digest}"


def normalize_article_url(url: str | None) -> str:
    if not url:
        return ""

    try:
        parsed = urlsplit(str(url).strip())
    except ValueError:
        return str(url).strip()

    query_pairs = [
        (key, value)
        for key, value in parse_qsl(parsed.query, keep_blank_values=True)
        if not key.lower().startswith(TRACKING_QUERY_PREFIXES)
        and key.lower() not in TRACKING_QUERY_KEYS
    ]
    path = parsed.path.rstrip("/") or parsed.path
    normalized = parsed._replace(
        scheme=parsed.scheme.lower(),
        netloc=parsed.netloc.lower(),
        path=path,
        query=urlencode(query_pairs, doseq=True),
        fragment="",
    )
    return urlunsplit(normalized)


def article_dedupe_key(article: dict[str, Any]) -> str:
    normalized_url = normalize_article_url(article.get("url"))
    if normalized_url:
        return f"{article.get('source_id', '')}|{normalized_url}"

    title = str(article.get("title", "")).strip().lower()
    published_at = str(article.get("published_at", "")).strip()
    return f"{article.get('source_id', '')}|{title}|{published_at}"


def normalize_entry(
    entry: dict[str, Any],
    source,
    build_day: str,
    feed_url: str = "",
    http_get=DEFAULT_HTTP_GET,
) -> tuple[dict | None, str | None]:
    published_raw = _entry_published_raw(entry)
    if not published_raw or not is_recent_day_in_shanghai(published_raw, build_day):
        return None, "not_recent_day"

    link = _entry_link(entry)
    title = str(entry.get("title", "")).strip()
    summary_html = str(entry.get("summary") or entry.get("description") or "")
    summary_text = body_text_from_html(summary_html)
    body_html = _entry_content_html(entry) or summary_html
    body_text = body_text_from_html(body_html)

    if len(body_text) < 240 and link:
        fetched_html, fetched_text = fetch_article_page(link, http_get=http_get)
        if len(fetched_text) > len(body_text):
            body_html = fetched_html
            body_text = fetched_text

    distilled_body_html = distill_article_html(body_html)
    distilled_body_text = body_text_from_html(distilled_body_html)
    if distilled_body_text:
        body_html = distilled_body_html
        body_text = distilled_body_text

    published_at = to_shanghai(parse_feed_datetime(published_raw)).isoformat(timespec="seconds")
    article = {
        "id": _build_article_id(source.id, link, title, published_at),
        "source_id": source.id,
        "source_category": source.category,
        "institution_name": source.institution_name,
        "title": title,
        "summary": summary_text,
        "summary_html": summary_html,
        "excerpt": excerpt_from_summary_or_body(summary_html, body_html),
        "body_html": body_html,
        "body_text": body_text,
        "url": link,
        "canonical_url": normalize_article_url(link),
        "feed_url": feed_url,
        "published_at": published_at,
        "author": _entry_author(entry),
    }
    match_reason = article_match_reason(article, source)
    if match_reason != "matched":
        return None, match_reason
    return article, None


def parse_feed_content(
    source,
    feed_url: str,
    raw_feed: str | bytes,
    build_day: str,
    http_get=DEFAULT_HTTP_GET,
    debug: dict | None = None,
) -> list[dict]:
    try:
        if feedparser is not None:
            parsed_entries = feedparser.parse(raw_feed).entries
        else:
            parsed_entries = _parse_feed_entries_stdlib(raw_feed)
    except Exception as error:
        LOGGER.warning("failed to parse feed payload for %s: %s", feed_url, error)
        if debug is not None:
            debug["feed_errors"].append(
                {
                    "feed_url": feed_url,
                    "reason": "feed_parse_error",
                    "message": str(error),
                }
            )
        return []
    articles: list[dict] = []
    seen_urls: set[str] = set()

    for entry in parsed_entries:
        if debug is not None:
            debug["fetched_count"] += 1
        article, drop_reason = normalize_entry(
            entry,
            source=source,
            build_day=build_day,
            feed_url=feed_url,
            http_get=http_get,
        )
        if not article:
            if debug is not None and drop_reason:
                debug["dropped_count"] += 1
                debug["drop_reasons"][drop_reason] = debug["drop_reasons"].get(drop_reason, 0) + 1
            continue
        dedupe_key = article_dedupe_key(article)
        if dedupe_key in seen_urls:
            if debug is not None:
                debug["dropped_count"] += 1
                debug["drop_reasons"]["duplicate_in_feed"] = debug["drop_reasons"].get("duplicate_in_feed", 0) + 1
            continue
        seen_urls.add(dedupe_key)
        articles.append(article)
        if debug is not None:
            debug["kept_count"] += 1

    return articles


def build_source_debug(source) -> dict:
    return {
        "id": source.id,
        "institution_name": source.institution_name,
        "category": source.category,
        "feeds": list(source.feeds),
        "fetched_count": 0,
        "kept_count": 0,
        "dropped_count": 0,
        "drop_reasons": {},
        "feed_errors": [],
    }


def fetch_source_articles(source, build_day: str, http_get=DEFAULT_HTTP_GET, debug: dict | None = None) -> list[dict]:
    articles: list[dict] = []
    seen_urls: set[str] = set()

    for feed_url in source.feeds:
        try:
            response = _fetch_with_header_fallback(
                http_get,
                feed_url,
                headers=REQUEST_HEADERS,
                timeout=REQUEST_TIMEOUT,
            )
        except Exception as error:  # pragma: no cover - network failure path
            LOGGER.warning("failed to fetch feed %s: %s", feed_url, error)
            if debug is not None:
                debug["feed_errors"].append(
                    {
                        "feed_url": feed_url,
                        "reason": "feed_fetch_error",
                        "message": str(error),
                    }
                )
            continue

        status_code = getattr(response, "status_code", 200)
        if status_code >= 400:
            LOGGER.warning("feed returned non-success status %s for %s", status_code, feed_url)
            if debug is not None:
                debug["feed_errors"].append(
                    {
                        "feed_url": feed_url,
                        "reason": "feed_http_error",
                        "status_code": status_code,
                    }
                )
            continue

        raw_feed = getattr(response, "content", b"")
        for article in parse_feed_content(
            source,
            feed_url=feed_url,
            raw_feed=raw_feed,
            build_day=build_day,
            http_get=http_get,
            debug=debug,
        ):
            dedupe_key = article_dedupe_key(article)
            if dedupe_key in seen_urls:
                if debug is not None:
                    debug["dropped_count"] += 1
                    debug["drop_reasons"]["duplicate_across_source"] = debug["drop_reasons"].get("duplicate_across_source", 0) + 1
                    debug["kept_count"] -= 1
                continue
            seen_urls.add(dedupe_key)
            articles.append(article)

    return articles


def fetch_all_articles(sources: list, build_day: str, http_get=DEFAULT_HTTP_GET, debug_enabled: bool = False) -> tuple[list[dict], dict | None]:
    articles: list[dict] = []
    seen_urls: set[str] = set()
    debug_payload = None
    if debug_enabled:
        debug_payload = {
            "build_day": build_day,
            "sources": [],
        }

    for source in sources:
        if not source.enabled:
            continue
        source_debug = build_source_debug(source) if debug_enabled else None
        for article in fetch_source_articles(source, build_day=build_day, http_get=http_get, debug=source_debug):
            dedupe_key = article_dedupe_key(article)
            if dedupe_key in seen_urls:
                if source_debug is not None:
                    source_debug["dropped_count"] += 1
                    source_debug["drop_reasons"]["duplicate_across_site"] = source_debug["drop_reasons"].get("duplicate_across_site", 0) + 1
                    source_debug["kept_count"] -= 1
                continue
            seen_urls.add(dedupe_key)
            articles.append(article)
        if debug_payload is not None and source_debug is not None:
            debug_payload["sources"].append(source_debug)

    return articles, debug_payload
