from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from dateutil import parser


ASIA_SHANGHAI = ZoneInfo("Asia/Shanghai")


def parse_feed_datetime(value: str) -> datetime:
    dt = parser.parse(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ASIA_SHANGHAI)
    return dt


def to_shanghai(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ASIA_SHANGHAI)
    return dt.astimezone(ASIA_SHANGHAI)


def is_recent_day_in_shanghai(value: str, day_iso: str, days: int = 3) -> bool:
    target_date = datetime.fromisoformat(day_iso).date()
    published_date = to_shanghai(parse_feed_datetime(value)).date()
    delta = (target_date - published_date).days
    return 0 <= delta < days
