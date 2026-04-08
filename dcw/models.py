from dataclasses import dataclass, field


@dataclass
class SourceConfig:
    id: str
    category: str
    institution_name: str
    feeds: list[str]
    strong_keywords: list[str]
    medium_keywords: list[str] = field(default_factory=list)
    enabled: bool = True
