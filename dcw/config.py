from pathlib import Path
import re

try:
    import yaml  # type: ignore
except ModuleNotFoundError:  # pragma: no cover - exercised via fallback path
    yaml = None

from dcw.models import SourceConfig


REQUIRED_SOURCE_FIELDS = {
    "id",
    "category",
    "institution_name",
    "feeds",
    "strong_keywords",
}


def _parse_scalar(raw: str):
    value = raw.strip()
    if not value:
        return ""
    if value.startswith("[") and value.endswith("]"):
        inner = value[1:-1].strip()
        if not inner:
            return []
        return [part.strip().strip('"').strip("'") for part in inner.split(",")]
    lowered = value.lower()
    if lowered == "true":
        return True
    if lowered == "false":
        return False
    return value.strip('"').strip("'")


def _simple_yaml_load(text: str) -> dict:
    root: dict = {}
    current_item: dict | None = None
    current_list_key: str | None = None

    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        if not line.strip():
            continue

        if re.match(r"^[A-Za-z_][\w-]*:\s*$", line):
            key = line.split(":", 1)[0].strip()
            root[key] = []
            current_item = None
            current_list_key = None
            continue

        if current_item is not None and current_list_key and line.startswith("      - "):
            current_item.setdefault(current_list_key, []).append(_parse_scalar(line.split("- ", 1)[1]))
            continue

        item_match = re.match(r"^\s{2}-\s+([A-Za-z_][\w-]*):\s*(.*)$", line)
        if item_match:
            key, raw_value = item_match.groups()
            current_item = {key: _parse_scalar(raw_value)}
            root.setdefault("sources", []).append(current_item)
            current_list_key = None
            continue

        if current_item is None:
            continue

        field_match = re.match(r"^\s+([A-Za-z_][\w-]*):\s*(.*)$", line)
        if field_match:
            key, raw_value = field_match.groups()
            parsed = _parse_scalar(raw_value)
            if raw_value.strip() == "":
                current_item[key] = []
                current_list_key = key
            else:
                current_item[key] = parsed
                current_list_key = None

    return root


def load_sources(path: str | Path) -> list[SourceConfig]:
    text = Path(path).read_text(encoding="utf-8")
    if yaml is not None:
        raw = yaml.safe_load(text) or {}
    else:
        raw = _simple_yaml_load(text)
    items = raw.get("sources", [])
    sources: list[SourceConfig] = []
    seen_ids: set[str] = set()

    for item in items:
        missing = REQUIRED_SOURCE_FIELDS - set(item)
        if missing:
            missing_names = ", ".join(sorted(missing))
            raise ValueError(f"missing required source fields: {missing_names}")

        source_id = item["id"]
        if source_id in seen_ids:
            raise ValueError(f"duplicate source id: {source_id}")
        seen_ids.add(source_id)

        sources.append(
            SourceConfig(
                id=source_id,
                category=item["category"],
                institution_name=item["institution_name"],
                feeds=list(item["feeds"]),
                strong_keywords=list(item["strong_keywords"]),
                medium_keywords=list(item.get("medium_keywords", [])),
                enabled=bool(item.get("enabled", True)),
            )
        )

    return sources
