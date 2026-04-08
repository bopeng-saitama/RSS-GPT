from __future__ import annotations

from pathlib import Path

TEMPLATE_PATH = Path(__file__).resolve().parents[1] / "template.html"


def render_index_html(update_time: str, worker_base_url: str) -> str:
    html = TEMPLATE_PATH.read_text(encoding="utf-8")
    return (
        html.replace("{{ update_time }}", update_time)
        .replace("{{ worker_base_url }}", worker_base_url)
    )
