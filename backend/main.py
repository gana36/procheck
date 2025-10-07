"""
ProCheck Backend API
Medical Protocol Search and Generation Service
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
from config.settings import settings
from models.protocol_models import (
    ProtocolSearchRequest,
    ProtocolSearchResponse,
    ProtocolSearchHit,
    ProtocolGenerateRequest,
    ProtocolGenerateResponse,
    StepThreadRequest,
    ChatResponse,
    ProtocolConversationRequest,
    ProtocolConversationResponse,
)
from models.conversation_models import (
    ConversationSaveRequest,
    ConversationResponse,
    ConversationListResponse,
    ConversationDetailResponse,
    ConversationTitleUpdateRequest,
)
from services.elasticsearch_service import (
    check_cluster_health,
    ensure_index,
    search_protocols,
    count_documents,
    get_sample_documents,
    search_with_filters,
    hybrid_search,
)
from services.gemini_service import summarize_checklist, step_thread_chat, protocol_conversation_chat
from services.firestore_service import FirestoreService
from services.embedding_service import generate_embedding, enhance_query_with_llm

# Initialize FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    description=settings.APP_DESCRIPTION,
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    """Root endpoint - API health check"""
    return {
        "message": f"{settings.APP_NAME} is running!",
        "status": "healthy",
        "version": settings.APP_VERSION
    }

@app.get("/health")
async def health_check():
    """Detailed health check endpoint"""
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.environment,
        "config_status": {
            "elasticsearch_configured": settings.elasticsearch_configured,
            "gemini_configured": settings.gemini_configured
        }
    }

@app.get("/test")
async def test_endpoint():
    """Test endpoint for basic functionality"""
    return {
        "message": "Test endpoint working!",
        "timestamp": "2024-01-01T00:00:00Z",
        "data": {
            "elasticsearch_configured": settings.elasticsearch_configured,
            "gemini_configured": settings.gemini_configured,
            "elasticsearch_url": settings.ELASTICSEARCH_URL,
            "environment": settings.environment
        }
    }

@app.get("/elasticsearch/health")
async def elasticsearch_health():
    if not settings.elasticsearch_configured:
        raise HTTPException(status_code=400, detail="Elasticsearch is not configured. Set ELASTICSEARCH_URL in env.")
    return check_cluster_health()

@app.post("/elasticsearch/ensure-index")
async def elasticsearch_ensure_index():
    if not settings.elasticsearch_configured:
        raise HTTPException(status_code=400, detail="Elasticsearch is not configured. Set ELASTICSEARCH_URL in env.")
    return ensure_index()

@app.get("/elasticsearch/search")
async def elasticsearch_search(q: str | None = None, size: int = 5):
    if not settings.elasticsearch_configured:
        raise HTTPException(status_code=400, detail="Elasticsearch is not configured. Set ELASTICSEARCH_URL in env.")
    return search_protocols(q, size=size)

@app.get("/elasticsearch/count")
async def elasticsearch_count():
    if not settings.elasticsearch_configured:
        raise HTTPException(status_code=400, detail="Elasticsearch is not configured. Set ELASTICSEARCH_URL in env.")
    return count_documents()

@app.get("/elasticsearch/sample")
async def elasticsearch_sample(size: int = 3):
    if not settings.elasticsearch_configured:
        raise HTTPException(status_code=400, detail="Elasticsearch is not configured. Set ELASTICSEARCH_URL in env.")
    return get_sample_documents(size=size)

@app.post("/protocols/search", response_model=ProtocolSearchResponse)
async def protocols_search(payload: ProtocolSearchRequest, use_hybrid: bool = True, enhance_query: bool = False):
    """
    Search medical protocols using hybrid search (BM25 + semantic vectors).
    
    Args:
        payload: Search request with query and filters
        use_hybrid: If True, use hybrid search; if False, use traditional text search
        enhance_query: If True, use LLM to enhance the query before searching
    """
    if not settings.elasticsearch_configured:
        raise HTTPException(status_code=400, detail="Elasticsearch is not configured.")
    
    original_query = payload.query
    enhanced_info = None
    
    # Optional: Enhance query using Gemini
    if enhance_query and original_query and settings.gemini_configured:
        try:
            enhanced_info = enhance_query_with_llm(original_query)
            # Use enhanced query for search
            payload.query = enhanced_info.get("enhanced_query", original_query)
        except Exception as e:
            pass  # Silently fall back to original query
    
    # Use hybrid search if enabled and Gemini is configured
    if use_hybrid and settings.gemini_configured and payload.query:
        try:
            # Generate query embedding for semantic search
            query_vector = generate_embedding(payload.query, task_type="retrieval_query")
            
            # Perform hybrid search with RRF
            es_resp = hybrid_search(
                query=payload.query,
                query_vector=query_vector,
                size=payload.size,
                filters=payload.filters
            )
        except Exception as e:
            # Fallback to traditional search
            es_resp = search_with_filters(payload.model_dump())
    else:
        # Traditional text-only search
        es_resp = search_with_filters(payload.model_dump())
    
    if "error" in es_resp:
        raise HTTPException(status_code=502, detail=es_resp)
    
    hits = []
    for h in es_resp.get("hits", {}).get("hits", []):
        hits.append(ProtocolSearchHit(
            id=h.get("_id"),
            score=h.get("_score"),
            source=h.get("_source", {}),
            highlight=h.get("highlight")
        ))
    
    total = es_resp.get("hits", {}).get("total", {}).get("value", 0)
    took = es_resp.get("took", 0)
    
    return ProtocolSearchResponse(total=total, hits=hits, took_ms=took)

@app.post("/protocols/generate", response_model=ProtocolGenerateResponse)
async def protocols_generate(payload: ProtocolGenerateRequest):
    if not settings.GEMINI_API_KEY:
        raise HTTPException(status_code=400, detail="GEMINI_API_KEY is not configured.")
    try:
        result = summarize_checklist(
            title=payload.title,
            context_snippets=payload.context_snippets,
            instructions=payload.instructions,
            region=payload.region,
            year=payload.year,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail={"error": "gemini_error", "details": str(e)})

    # Preserve all fields including citation and explanation
    checklist_items = [
        {
            "step": item.get("step", idx + 1), 
            "text": item.get("text", ""),
            "explanation": item.get("explanation", ""),  # Include explanation
            "citation": item.get("citation", 0)  # Include citation field
        } 
        for idx, item in enumerate(result.get("checklist", []))
    ]
    return ProtocolGenerateResponse(
        title=result.get("title", payload.title),
        checklist=checklist_items,
        citations=result.get("citations", []),
    )

# Step thread chat endpoint
@app.post("/protocols/step-thread", response_model=ChatResponse)
async def step_thread(payload: StepThreadRequest):
    """Step-level thread chat for focused discussions"""
    if not settings.GEMINI_API_KEY:
        raise HTTPException(status_code=400, detail="GEMINI_API_KEY is not configured.")
    
    try:
        # Convert pydantic models to dicts for service layer
        history = [{"role": msg.role, "content": msg.content} for msg in payload.thread_history]
        
        result = step_thread_chat(
            message=payload.message,
            step_id=payload.step_id,
            step_text=payload.step_text,
            step_citation=payload.step_citation,
            protocol_title=payload.protocol_title,
            protocol_citations=payload.protocol_citations,
            thread_history=history
        )
        
        return ChatResponse(
            message=result.get("message", ""),
            updated_protocol=result.get("updated_protocol")
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail={"error": "thread_error", "details": str(e)})

# Protocol conversation chat endpoint
@app.post("/protocols/conversation", response_model=ProtocolConversationResponse)
async def protocol_conversation(payload: ProtocolConversationRequest):
    """Protocol-level conversational chat for follow-up questions"""
    if not settings.GEMINI_API_KEY:
        raise HTTPException(status_code=400, detail="GEMINI_API_KEY is not configured.")
    
    try:
        # Convert pydantic models to dicts for service layer
        history = [{"role": msg.role, "content": msg.content} for msg in payload.conversation_history]
        
        result = protocol_conversation_chat(
            message=payload.message,
            concept_title=payload.concept_title,
            protocol_json=payload.protocol_json,
            citations_list=payload.citations_list,
            filters_json=payload.filters_json,
            conversation_history=history
        )
        
        return ProtocolConversationResponse(
            answer=result.get("answer", ""),
            uncertainty_note=result.get("uncertainty_note"),
            sources=result.get("sources", []),
            used_new_sources=result.get("used_new_sources", False),
            follow_up_questions=[
                {"text": q["text"], "category": q.get("category")} 
                for q in result.get("follow_up_questions", [])
            ],
            updated_protocol=result.get("updated_protocol")
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail={"error": "conversation_error", "details": str(e)})

# Conversation management endpoints
@app.post("/conversations/save", response_model=ConversationResponse)
async def save_conversation(user_id: str, payload: ConversationSaveRequest):
    """Save or update a conversation for a user"""
    if not user_id or not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id is required")

    result = FirestoreService.save_conversation(user_id, payload.model_dump())

    if not result.get("success"):
        status_code = 502 if result.get("error") == "firestore_error" else 500
        raise HTTPException(status_code=status_code, detail=result)

    return ConversationResponse(**result)

@app.get("/conversations/{user_id}", response_model=ConversationListResponse)
async def get_user_conversations(user_id: str, limit: int = 20):
    """Get all conversations for a user"""
    if not user_id or not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id is required")

    result = FirestoreService.get_user_conversations(user_id, limit)

    if not result.get("success"):
        status_code = 502 if result.get("error") == "firestore_error" else 500
        raise HTTPException(status_code=status_code, detail=result)

    return ConversationListResponse(**result)

@app.get("/conversations/{user_id}/{conversation_id}", response_model=ConversationDetailResponse)
async def get_conversation(user_id: str, conversation_id: str):
    """Get a specific conversation for a user"""
    if not user_id or not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id is required")
    if not conversation_id or not conversation_id.strip():
        raise HTTPException(status_code=400, detail="conversation_id is required")

    result = FirestoreService.get_conversation(user_id, conversation_id)

    if not result.get("success"):
        if result.get("error") == "not_found":
            raise HTTPException(status_code=404, detail="Conversation not found")
        status_code = 502 if result.get("error") == "firestore_error" else 500
        raise HTTPException(status_code=status_code, detail=result)

    return ConversationDetailResponse(**result)

@app.delete("/conversations/{user_id}/{conversation_id}")
async def delete_conversation(user_id: str, conversation_id: str):
    """Delete a conversation for a user"""
    if not user_id or not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id is required")
    if not conversation_id or not conversation_id.strip():
        raise HTTPException(status_code=400, detail="conversation_id is required")

    result = FirestoreService.delete_conversation(user_id, conversation_id)

    if not result.get("success"):
        if result.get("error") == "not_found":
            raise HTTPException(status_code=404, detail="Conversation not found")
        status_code = 502 if result.get("error") == "firestore_error" else 500
        raise HTTPException(status_code=status_code, detail=result)

    return {"success": True, "message": "Conversation deleted successfully"}

@app.put("/conversations/{user_id}/{conversation_id}/title")
async def update_conversation_title(user_id: str, conversation_id: str, payload: ConversationTitleUpdateRequest):
    """Update conversation title"""
    if not user_id or not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id is required")
    if not conversation_id or not conversation_id.strip():
        raise HTTPException(status_code=400, detail="conversation_id is required")

    result = FirestoreService.update_conversation_title(user_id, conversation_id, payload.title)

    if not result.get("success"):
        if result.get("error") == "not_found":
            raise HTTPException(status_code=404, detail="Conversation not found")
        status_code = 502 if result.get("error") == "firestore_error" else 500
        raise HTTPException(status_code=status_code, detail=result)

    return {"success": True, "message": "Title updated successfully"}

# ==================== Saved Protocols Endpoints ====================

@app.post("/protocols/save")
async def save_protocol_endpoint(user_id: str, protocol_data: dict):
    """Save/bookmark a protocol for a user"""
    if not user_id or not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id is required")

    result = FirestoreService.save_protocol(user_id, protocol_data)

    if not result.get("success"):
        status_code = 502 if "firestore" in result.get("error", "") else 500
        raise HTTPException(status_code=status_code, detail=result)

    return result

@app.get("/protocols/saved/{user_id}")
async def get_saved_protocols_endpoint(user_id: str, limit: int = 20):
    """Get all saved protocols for a user"""
    if not user_id or not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id is required")

    result = FirestoreService.get_saved_protocols(user_id, limit)

    if not result.get("success"):
        status_code = 502 if "firestore" in result.get("error", "") else 500
        raise HTTPException(status_code=status_code, detail=result)

    return result

@app.delete("/protocols/saved/{user_id}/{protocol_id}")
async def delete_saved_protocol_endpoint(user_id: str, protocol_id: str):
    """Delete a saved protocol"""
    if not user_id or not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id is required")
    if not protocol_id or not protocol_id.strip():
        raise HTTPException(status_code=400, detail="protocol_id is required")

    result = FirestoreService.delete_saved_protocol(user_id, protocol_id)

    if not result.get("success"):
        if result.get("error") == "not_found":
            raise HTTPException(status_code=404, detail="Protocol not found")
        status_code = 502 if "firestore" in result.get("error", "") else 500
        raise HTTPException(status_code=status_code, detail=result)

    return result

@app.get("/protocols/saved/{user_id}/{protocol_id}")
async def get_saved_protocol_endpoint(user_id: str, protocol_id: str):
    """Get a single saved protocol with full data"""
    if not user_id or not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id is required")
    if not protocol_id or not protocol_id.strip():
        raise HTTPException(status_code=400, detail="protocol_id is required")

    result = FirestoreService.get_saved_protocol(user_id, protocol_id)

    if not result.get("success"):
        if result.get("error") == "not_found":
            raise HTTPException(status_code=404, detail="Protocol not found")
        status_code = 502 if "firestore" in result.get("error", "") else 500
        raise HTTPException(status_code=status_code, detail=result)

    return result

@app.get("/protocols/saved/{user_id}/{protocol_id}/check")
async def check_protocol_saved_endpoint(user_id: str, protocol_id: str):
    """Check if a protocol is saved by the user"""
    if not user_id or not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id is required")
    if not protocol_id or not protocol_id.strip():
        raise HTTPException(status_code=400, detail="protocol_id is required")

    result = FirestoreService.is_protocol_saved(user_id, protocol_id)

    if not result.get("success"):
        status_code = 502 if "firestore" in result.get("error", "") else 500
        raise HTTPException(status_code=status_code, detail=result)

    return result

@app.put("/protocols/saved/{user_id}/{protocol_id}/title")
async def update_saved_protocol_title_endpoint(user_id: str, protocol_id: str, payload: dict):
    """Update the title of a saved protocol"""
    if not user_id or not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id is required")
    if not protocol_id or not protocol_id.strip():
        raise HTTPException(status_code=400, detail="protocol_id is required")

    new_title = payload.get("title")
    if not new_title or not new_title.strip():
        raise HTTPException(status_code=400, detail="title is required")

    result = FirestoreService.update_saved_protocol_title(user_id, protocol_id, new_title.strip())

    if not result.get("success"):
        if result.get("error") == "not_found":
            raise HTTPException(status_code=404, detail="Protocol not found")
        status_code = 502 if "firestore" in result.get("error", "") else 500
        raise HTTPException(status_code=status_code, detail=result)

    return result

# User management endpoints
@app.delete("/users/{user_id}")
async def delete_user_data(user_id: str):
    """Delete all user data from the backend"""
    if not user_id or not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id is required")

    result = FirestoreService.delete_user_data(user_id)

    if not result.get("success"):
        status_code = 502 if "firestore" in result.get("error", "") else 500
        raise HTTPException(status_code=status_code, detail=result)

    return result

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.DEBUG
    )
