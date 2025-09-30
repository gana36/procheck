"""
Pydantic models for conversation data structures
"""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from datetime import datetime

class MessageModel(BaseModel):
    """Individual message in a conversation"""
    id: str
    type: str  # "user" or "assistant"
    content: str
    timestamp: str
    protocol_data: Optional[Dict[str, Any]] = None

class ProtocolStepModel(BaseModel):
    """Protocol step data"""
    id: int
    step: str
    citations: List[Dict[str, Any]] = []

class CitationModel(BaseModel):
    """Citation data"""
    id: int
    source: str
    organization: str
    year: str
    region: str
    url: str
    excerpt: str

class ProtocolDataModel(BaseModel):
    """Protocol data structure"""
    title: str
    region: str
    year: str
    organization: str
    steps: List[ProtocolStepModel]
    citations: List[CitationModel]
    last_updated: str

class ConversationSaveRequest(BaseModel):
    """Request model for saving conversations"""
    id: Optional[str] = None
    title: Optional[str] = "Untitled Conversation"
    messages: List[MessageModel]
    protocol_data: Optional[ProtocolDataModel] = None
    last_query: Optional[str] = ""
    tags: List[str] = []
    created_at: Optional[str] = None

class ConversationResponse(BaseModel):
    """Response model for conversation operations"""
    success: bool
    conversation_id: Optional[str] = None
    document_id: Optional[str] = None
    error: Optional[str] = None
    details: Optional[str] = None
    message: Optional[str] = None

class ConversationListItem(BaseModel):
    """Conversation list item for user's conversation history"""
    id: str
    title: str
    created_at: str
    updated_at: str
    message_count: int
    last_query: str

class ConversationListResponse(BaseModel):
    """Response model for listing user conversations"""
    success: bool
    conversations: List[ConversationListItem] = []
    total: int = 0
    error: Optional[str] = None
    details: Optional[str] = None

class ConversationDetailResponse(BaseModel):
    """Response model for getting conversation details"""
    success: bool
    conversation: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    details: Optional[str] = None

class ConversationTitleUpdateRequest(BaseModel):
    """Request model for updating conversation title"""
    title: str = Field(..., min_length=1, max_length=200)