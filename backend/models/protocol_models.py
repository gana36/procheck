from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field

class SearchFilters(BaseModel):
    region: Optional[List[str]] = None
    year: Optional[List[int]] = None
    organization: Optional[List[str]] = None
    tags: Optional[List[str]] = None

class ProtocolSearchRequest(BaseModel):
    query: Optional[str] = Field(default=None, description="Free text query")
    size: int = Field(default=10, ge=1, le=50)
    filters: Optional[SearchFilters] = None

class ProtocolSearchHit(BaseModel):
    id: str
    score: Optional[float] = None
    source: Dict[str, Any]
    highlight: Optional[Dict[str, Any]] = None

class ProtocolSearchResponse(BaseModel):
    total: int
    hits: List[ProtocolSearchHit]
    took_ms: int

class ProtocolGenerateRequest(BaseModel):
    title: str
    context_snippets: List[str]
    instructions: Optional[str] = None
    region: Optional[str] = None
    year: Optional[int] = None

class ProtocolChecklistItem(BaseModel):
    step: int
    text: str
    explanation: Optional[str] = ""  # Detailed how-to explanation
    citation: Optional[int] = 0  # Citation source number

class ProtocolGenerateResponse(BaseModel):
    title: str
    checklist: List[ProtocolChecklistItem]
    citations: List[str]
