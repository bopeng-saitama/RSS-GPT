from __future__ import annotations

from datetime import datetime
import os
from pathlib import Path

from dcw.config import load_sources
from dcw.fetch import fetch_all_articles
from dcw.render import render_index_html
from dcw.site_builder import build_site_payload, payload_changed, read_site_payload, write_site_payload


BASE_DIR = Path(__file__).resolve().parents[1]
DOCS_DIR = BASE_DIR / "docs"
DATA_PATH = DOCS_DIR / "data" / "site.json"
DEBUG_PATH = DOCS_DIR / "data" / "debug.json"
INDEX_PATH = DOCS_DIR / "index.html"
SOURCES_PATH = BASE_DIR / "sources.yaml"


def main() -> int:
    sources = load_sources(SOURCES_PATH)
    worker_base_url = os.environ.get("REPORT_WORKER_URL", "")
    debug_enabled = os.environ.get("DCW_DEBUG") == "1"
    now = datetime.now()
    now_iso = now.isoformat(timespec="seconds")
    build_day = now.date().isoformat()
    articles, debug_payload = fetch_all_articles(sources, build_day=build_day, debug_enabled=debug_enabled)
    existing_payload = read_site_payload(DATA_PATH)

    payload = build_site_payload(
        articles=articles,
        sources=[
            {
                "id": source.id,
                "category": source.category,
                "institution_name": source.institution_name,
                "enabled": source.enabled,
                "feeds": source.feeds,
            }
            for source in sources
        ],
        build_day=build_day,
        worker_base_url=worker_base_url,
        generated_at=now_iso,
    )
    if not payload_changed(existing_payload, payload) and existing_payload is not None:
        payload["generated_at"] = existing_payload["generated_at"]
    write_site_payload(DATA_PATH, payload)

    INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
    INDEX_PATH.write_text(
        render_index_html(
            update_time=payload["generated_at"],
            worker_base_url=worker_base_url,
        ),
        encoding="utf-8",
    )
    if debug_enabled and debug_payload is not None:
        debug_payload["generated_at"] = payload["generated_at"]
        write_site_payload(DEBUG_PATH, debug_payload)
    return 0
