from __future__ import annotations

from datetime import datetime
import json
from pathlib import Path


def build_site_payload(
    articles: list[dict],
    sources: list[dict],
    build_day: str,
    worker_base_url: str = "",
    generated_at: str | None = None,
) -> dict:
    sorted_articles = sorted(articles, key=lambda item: item.get("published_at", ""), reverse=True)
    return {
        "generated_at": generated_at or datetime.now().isoformat(timespec="seconds"),
        "build_day": build_day,
        "worker_base_url": worker_base_url,
        "sources": sources,
        "articles": sorted_articles,
    }


def write_site_payload(path: str | Path, payload: dict) -> None:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def read_site_payload(path: str | Path) -> dict | None:
    payload_path = Path(path)
    if not payload_path.exists():
        return None
    return json.loads(payload_path.read_text(encoding="utf-8"))


def payload_changed(existing: dict | None, candidate: dict) -> bool:
    if existing is None:
        return True

    def normalized(payload: dict) -> dict:
        return {
            key: value
            for key, value in payload.items()
            if key != "generated_at"
        }

    return normalized(existing) != normalized(candidate)
