from __future__ import annotations
from typing import Optional

from pydantic import BaseModel, Field


class SummarizeRequest(BaseModel):
    content: str
    max_length: Optional[int] = None


class SummarizeResponse(BaseModel):
    summary: str
    key_points: list[str]


class GenerateTitlesRequest(BaseModel):
    content: str
    count: int = 5


class GenerateTitlesResponse(BaseModel):
    titles: list[str]


class RewriteRequest(BaseModel):
    content: str
    style: Optional[str] = None
    instruction: Optional[str] = None


class PolishRequest(BaseModel):
    content: str


class PolishResponse(BaseModel):
    polished: str


class OutlineRequest(BaseModel):
    materials: list[dict]


class OutlineResponse(BaseModel):
    outline: list[dict]
