from __future__ import annotations

from html import escape, unescape
import re

try:
    from bs4 import BeautifulSoup
except ModuleNotFoundError:  # pragma: no cover - exercised via fallback path
    BeautifulSoup = None


BLOCKED_TAGS = ("script", "style", "iframe", "form", "input", "button", "video", "audio")
BLOCKED_TAG_PATTERN = re.compile(
    r"<(?:script|style|iframe|form|input|button|video|audio)\b.*?>.*?</(?:script|style|iframe|form|input|button|video|audio)>",
    flags=re.IGNORECASE | re.DOTALL,
)
EVENT_HANDLER_PATTERN = re.compile(r"\s+on[a-zA-Z]+\s*=\s*(['\"]).*?\1", flags=re.IGNORECASE | re.DOTALL)
TAG_PATTERN = re.compile(r"<[^>]+>")
STRUCTURAL_NOISE_PATTERN = re.compile(
    r"<(?P<tag>header|footer|nav|aside)\b.*?>.*?</(?P=tag)>",
    flags=re.IGNORECASE | re.DOTALL,
)
ATTR_NOISE_BLOCK_PATTERN = re.compile(
    r"<(?P<tag>[a-z0-9]+)\b(?=[^>]*(?:class|id|data-testid|aria-label)\s*=\s*['\"][^'\"]*"
    r"(?:social|share|ticker|price|newsletter|breadcrumb|podcast|follow|footer|header|menu|nav|ad-slot|top-bar)"
    r"[^'\"]*['\"])[^>]*>.*?</(?P=tag)>",
    flags=re.IGNORECASE | re.DOTALL,
)
H1_PATTERN = re.compile(r"<h1\b.*?>.*?</h1>", flags=re.IGNORECASE | re.DOTALL)
MARKET_LINK_PATTERN = re.compile(r'href\s*=\s*["\'][^"\']*/(?:price|markets|coins)/', flags=re.IGNORECASE)
ATTR_TEXT_PATTERN = re.compile(
    r'(?:class|id|data-testid|aria-label|data-submodule-name)\s*=\s*["\']([^"\']+)["\']',
    flags=re.IGNORECASE,
)
INLINE_MARKET_LINK_PATTERN = re.compile(
    r"<a\b(?=[^>]*(?:href\s*=\s*['\"][^'\"]*(?:/price/|/coin-price|/token-price|(?:^|/)price-[^'\"]*)[^'\"]*['\"]|"
    r"(?:class|id|data-testid|aria-label|data-submodule-name)\s*=\s*['\"][^'\"]*(?:price|ticker|quote)[^'\"]*['\"]))"
    r"[^>]*>.*?</a>",
    flags=re.IGNORECASE | re.DOTALL,
)
EMPTY_INLINE_MARKET_WRAPPER_PATTERN = re.compile(
    r"<(?:span|div)\b(?=[^>]*(?:class|id|data-testid|aria-label|data-submodule-name)\s*=\s*['\"][^'\"]*"
    r"(?:price|ticker|quote)[^'\"]*['\"])[^>]*>\s*</(?:span|div)>",
    flags=re.IGNORECASE | re.DOTALL,
)
ALLOWED_BLOCK_PATTERN = re.compile(
    r"<(?P<tag>p|h2|h3|h4|blockquote|ul|ol|pre)\b[^>]*>.*?</(?P=tag)>",
    flags=re.IGNORECASE | re.DOTALL,
)
NOISE_SELECTORS = (
    "header",
    "footer",
    "nav",
    "aside",
    "[role='navigation']",
    "[data-testid='top-bar']",
    "[data-testid='menu-items']",
    "[data-testid='product-dropdown']",
    "[data-testid='desktop-banner']",
    "[data-testid='infinite-tickers']",
    "[data-testid='social-x']",
    "[data-testid='social-telegram']",
    "[data-testid='social-facebook']",
    "[data-testid='social-youtube']",
    "[data-testid='rate-ticker']",
    "[class*='ticker']",
    "[class*='social']",
    "[class*='share']",
    "[class*='newsletter']",
    "[class*='breadcrumb']",
    "[class*='menu']",
    "[class*='footer']",
    "[class*='header']",
    "[class*='podcast']",
    "[class*='ad-slot']",
)
ALLOWED_BLOCK_TAGS = ("p", "h2", "h3", "h4", "blockquote", "ul", "ol", "pre")
NOISE_TEXT_PATTERNS = (
    re.compile(r"^\s*coin prices\s*$", flags=re.IGNORECASE),
    re.compile(r"^\s*crypto prices\s*$", flags=re.IGNORECASE),
    re.compile(r"^\s*latest prices\s*$", flags=re.IGNORECASE),
    re.compile(r"^\s*related\s*:", flags=re.IGNORECASE),
    re.compile(r"^\s*follow us\s*$", flags=re.IGNORECASE),
    re.compile(r"^\s*subscribe\s*$", flags=re.IGNORECASE),
    re.compile(r"^\s*listen\s*$", flags=re.IGNORECASE),
    re.compile(r"^\s*read more\s*:", flags=re.IGNORECASE),
    re.compile(r"^\s*daily debrief\s+newsletter\s*$", flags=re.IGNORECASE),
    re.compile(r"^\s*newsletter\s*$", flags=re.IGNORECASE),
    re.compile(r"cointelegraph in your social feed", flags=re.IGNORECASE),
    re.compile(r"committed to independent,\s*transparent journalism", flags=re.IGNORECASE),
    re.compile(r"editorial policy", flags=re.IGNORECASE),
)
TERMINAL_SECTION_PATTERNS = (
    re.compile(r"^\s*more for you\s*$", flags=re.IGNORECASE),
    re.compile(r"^\s*recommended(?: for you)?\s*$", flags=re.IGNORECASE),
    re.compile(r"^\s*recommended articles\s*$", flags=re.IGNORECASE),
    re.compile(r"^\s*related articles\s*$", flags=re.IGNORECASE),
    re.compile(r"^\s*related (?:stories|articles|news|reading)\s*$", flags=re.IGNORECASE),
    re.compile(r"^\s*you may also like\s*$", flags=re.IGNORECASE),
    re.compile(r"^\s*most read\s*$", flags=re.IGNORECASE),
    re.compile(r"^\s*editor'?s picks?\s*$", flags=re.IGNORECASE),
    re.compile(r"^\s*latest stories\s*$", flags=re.IGNORECASE),
    re.compile(r"^\s*subscribe to daily newsletter\s*$", flags=re.IGNORECASE),
    re.compile(r"^\s*magazine\s*:", flags=re.IGNORECASE),
)
PRE_BODY_SUMMARY_PATTERNS = (
    re.compile(r"^\s*what to know\s*:?\s*$", flags=re.IGNORECASE),
    re.compile(r"^\s*why it matters\s*:?\s*$", flags=re.IGNORECASE),
    re.compile(r"^\s*in brief\s*:?\s*$", flags=re.IGNORECASE),
    re.compile(r"^\s*key points?\s*:?\s*$", flags=re.IGNORECASE),
    re.compile(r"^\s*key takeaways?\s*:?\s*$", flags=re.IGNORECASE),
)
PRICE_ONLY_PATTERN = re.compile(
    r"^[+\-−]?(?:[$€£¥]|US\$)?\s?\d[\d,]*(?:\.\d+)?(?:\s?[kmbt])?(?:%| percent)?$",
    flags=re.IGNORECASE,
)
SYMBOL_ONLY_PATTERN = re.compile(r"^[A-Z0-9_]{1,16}(?:/[A-Z0-9_]{1,16})?$")
SYMBOL_PRICE_PATTERN = re.compile(
    r"^[A-Z0-9]{2,8}(?:/[A-Z0-9]{2,8})?\s+[+\-−]?(?:[$€£¥]|US\$)\s?\d",
    flags=re.IGNORECASE,
)
TAG_LINE_PATTERN = re.compile(r"^(?:#[-\w]+(?:\s+|$)){1,12}$")
TAG_CLOUD_PATTERN = re.compile(r"(?:#[-\w]+(?:\s+|$)){2,}", flags=re.IGNORECASE)
BARE_URL_PATTERN = re.compile(r"^https?://\S+$", flags=re.IGNORECASE)
NOISE_ATTR_KEYWORDS = (
    "social",
    "share",
    "ticker",
    "price",
    "newsletter",
    "breadcrumb",
    "podcast",
    "follow",
    "footer",
    "header",
    "menu",
    "nav",
    "ad-slot",
)


def _normalize_text(text: str) -> str:
    return " ".join(text.split())


def _node_text(node) -> str:
    return _normalize_text(node.get_text(" ", strip=True))


def _node_attr_text(node) -> str:
    values: list[str] = []
    for attr_name in ("class", "id", "data-testid", "aria-label"):
        value = node.attrs.get(attr_name)
        if isinstance(value, list):
            values.extend(str(item) for item in value)
        elif value:
            values.append(str(value))
    return " ".join(values).lower()


def _links_to_market_data(node) -> bool:
    for link in node.find_all("a"):
        href = str(link.get("href") or "").lower()
        if "/price/" in href or "/markets/" in href or "/coins/" in href:
            return True
    return False


def _paragraphize_text(text: str) -> str:
    cleaned = _normalize_text(text)
    if not cleaned:
        return ""
    return f"<p>{escape(cleaned)}</p>"


def _looks_like_noise_text(text: str, attr_text: str = "", links_to_market_data: bool = False) -> bool:
    if not text:
        return True

    if BARE_URL_PATTERN.match(text):
        return True

    if any(keyword in attr_text for keyword in NOISE_ATTR_KEYWORDS):
        return True

    if len(text) < 240 and any(pattern.search(text) for pattern in NOISE_TEXT_PATTERNS):
        return True

    if PRICE_ONLY_PATTERN.match(text):
        return True

    if SYMBOL_PRICE_PATTERN.match(text):
        return True

    if len(text) <= 12 and SYMBOL_ONLY_PATTERN.match(text) and (links_to_market_data or "price" in attr_text or "ticker" in attr_text):
        return True

    if len(text) <= 28 and links_to_market_data and ("$" in text or SYMBOL_ONLY_PATTERN.match(text)):
        return True

    return False


def _is_terminal_section(text: str) -> bool:
    return any(pattern.search(text) for pattern in TERMINAL_SECTION_PATTERNS)


def _is_pre_body_summary(text: str) -> bool:
    return any(pattern.search(text) for pattern in PRE_BODY_SUMMARY_PATTERNS)


def _is_tag_line(text: str) -> bool:
    return bool(TAG_LINE_PATTERN.match(text))


def _looks_like_tag_cloud(node, text: str) -> bool:
    if not text:
        return False

    if getattr(node, "name", "").lower() not in {"ul", "ol"}:
        return False

    items = node.find_all("li")
    if not items:
        return False

    tag_like_items = 0
    for item in items:
        item_text = _normalize_text(item.get_text(" ", strip=True))
        href = ""
        link = item.find("a")
        if link is not None:
            href = str(link.get("href") or "").lower()
        if item_text.startswith("#") or "/tags/" in href:
            tag_like_items += 1

    return tag_like_items >= max(2, len(items) // 2 + 1)


def _filter_blocks(blocks: list[dict[str, str | bool]]) -> str:
    kept: list[str] = []
    body_started = False

    for block in blocks:
        text = str(block["text"])
        tag = str(block["tag"]).lower()
        attr_text = str(block.get("attr_text") or "")
        links_to_market_data = bool(block.get("links_to_market_data"))

        if _is_terminal_section(text):
            break

        if _looks_like_noise_text(text, attr_text, links_to_market_data) or _is_tag_line(text) or bool(block.get("tag_cloud")):
            continue

        if not body_started:
            if _is_pre_body_summary(text):
                continue
            if tag != "p":
                continue
            body_started = True

        kept.append(str(block["html"]))

    if kept:
        return "".join(kept)

    fallback_text = _normalize_text(" ".join(str(block["text"]) for block in blocks if not _is_terminal_section(str(block["text"]))))
    return _paragraphize_text(fallback_text)


def _looks_like_noise(node) -> bool:
    text = _node_text(node)
    if not text:
        return True

    attr_text = _node_attr_text(node)
    links_to_market_data = _links_to_market_data(node)
    if _looks_like_noise_text(text, attr_text, links_to_market_data):
        return True

    if _looks_like_tag_cloud(node, text):
        return True

    links = node.find_all("a")
    if links and len(text) < 40:
        link_text = _normalize_text(" ".join(link.get_text(" ", strip=True) for link in links))
        if link_text and link_text == text:
            return True

    return False


def _strip_unwanted_attrs(node) -> None:
    allowed_attrs = {"a": {"href"}}
    for descendant in [node, *node.find_all(True)]:
        attrs_to_keep = allowed_attrs.get(descendant.name, set())
        for attr in list(descendant.attrs):
            if attr not in attrs_to_keep:
                del descendant.attrs[attr]


def distill_article_html(raw_html: str | None) -> str:
    cleaned = clean_body_html(raw_html)
    if not cleaned:
        return cleaned

    if BeautifulSoup is None:
        reduced = STRUCTURAL_NOISE_PATTERN.sub("", cleaned)
        reduced = ATTR_NOISE_BLOCK_PATTERN.sub("", reduced)
        reduced = H1_PATTERN.sub("", reduced)

        blocks: list[dict[str, str | bool]] = []
        for match in ALLOWED_BLOCK_PATTERN.finditer(reduced):
            block = match.group(0)
            text = _normalize_text(unescape(TAG_PATTERN.sub(" ", block)))
            attr_text = " ".join(value.lower() for value in ATTR_TEXT_PATTERN.findall(block))
            links_to_market_data = bool(MARKET_LINK_PATTERN.search(block))
            tag_match = re.match(r"<([a-z0-9]+)\b", block, flags=re.IGNORECASE)
            blocks.append(
                {
                    "html": block,
                    "text": text,
                    "tag": tag_match.group(1).lower() if tag_match else "p",
                    "attr_text": attr_text,
                    "links_to_market_data": links_to_market_data,
                    "tag_cloud": bool(TAG_CLOUD_PATTERN.search(text) and text.count("#") >= 2),
                }
            )
        return _filter_blocks(blocks)

    soup = BeautifulSoup(cleaned, "html.parser")

    for selector in NOISE_SELECTORS:
        for node in soup.select(selector):
            node.decompose()

    for node in list(soup.find_all(True)):
        if node.name == "h1" or _looks_like_noise(node):
            node.decompose()

    blocks: list[dict[str, str | bool]] = []
    for node in soup.find_all(ALLOWED_BLOCK_TAGS):
        if any(parent.name in ALLOWED_BLOCK_TAGS for parent in node.parents if getattr(parent, "name", None)):
            continue

        text = _node_text(node)
        clone = BeautifulSoup(str(node), "html.parser").find()
        if clone is None:
            continue
        _strip_unwanted_attrs(clone)
        blocks.append(
            {
                "html": str(clone),
                "text": text,
                "tag": node.name,
                "attr_text": _node_attr_text(node),
                "links_to_market_data": _links_to_market_data(node),
                "tag_cloud": _looks_like_tag_cloud(node, text),
            }
        )

    return _filter_blocks(blocks)


def clean_body_html(raw_html: str | None) -> str:
    if not raw_html:
        return ""

    if BeautifulSoup is None:
        without_blocked = BLOCKED_TAG_PATTERN.sub("", raw_html)
        without_inline_market = INLINE_MARKET_LINK_PATTERN.sub("", without_blocked)
        while True:
            collapsed = EMPTY_INLINE_MARKET_WRAPPER_PATTERN.sub("", without_inline_market)
            if collapsed == without_inline_market:
                break
            without_inline_market = collapsed
        return EVENT_HANDLER_PATTERN.sub("", without_inline_market)

    soup = BeautifulSoup(raw_html, "html.parser")

    for tag_name in BLOCKED_TAGS:
        for node in soup.find_all(tag_name):
            node.decompose()

    for node in soup.find_all(True):
        for attr in list(node.attrs):
            if attr.lower().startswith("on"):
                del node.attrs[attr]

    return str(soup)


def body_text_from_html(raw_html: str | None) -> str:
    cleaned = clean_body_html(raw_html)
    if not cleaned:
        return ""

    if BeautifulSoup is None:
        text = TAG_PATTERN.sub(" ", cleaned)
        return " ".join(unescape(text).split())

    soup = BeautifulSoup(cleaned, "html.parser")
    text = soup.get_text(" ", strip=True)
    return " ".join(text.split())


def excerpt_from_summary_or_body(summary_html: str | None, body_html: str | None, limit: int = 180) -> str:
    for candidate in (summary_html, body_html):
        text = body_text_from_html(candidate)
        if text:
            return text[:limit].strip()
    return ""
