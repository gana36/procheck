"""
ProCheck Backend API
Medical Protocol Search and Generation Service
"""

from fastapi import FastAPI, HTTPException, UploadFile, File, BackgroundTasks, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
import asyncio
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
from services.document_processor import DocumentProcessor
from services.content_moderation import content_moderator

# Global document processor instance to maintain state across requests
document_processor = DocumentProcessor()

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
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
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
async def protocols_search(
    payload: ProtocolSearchRequest,
    use_hybrid: bool = True,
    enhance_query: bool = False,
    user_id: str = None,
    search_mode: str = "mixed"
):
    """
    Search medical protocols using hybrid search (BM25 + semantic vectors).
    Now supports personalized search when user_id is provided.

    Args:
        payload: Search request with query and filters
        use_hybrid: If True, use hybrid search; if False, use traditional text search
        enhance_query: If True, use LLM to enhance the query before searching
        user_id: Optional Firebase Auth user ID for personalized search
        search_mode: "mixed" (user+global), "user_only", "global_only" (when user_id provided)
    """
    if not settings.elasticsearch_configured:
        raise HTTPException(status_code=400, detail="Elasticsearch is not configured.")

    # Validate query content
    if payload.query:
        validation = content_moderator.validate_query(payload.query)
        if not validation['valid']:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "invalid_query",
                    "message": validation['reason'],
                    "category": validation['category']
                }
            )

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

    # If user_id is provided, use personalized search
    if user_id and user_id.strip():
        try:
            # Import personalized search functions
            from services.elasticsearch_service import search_user_protocols, search_mixed_protocols

            if search_mode == "user_only":
                # Search only user protocols
                es_resp = search_user_protocols(
                    user_id=user_id,
                    query=payload.query,
                    size=payload.size
                )
            elif search_mode == "global_only":
                # Use existing global search logic (fall through to below)
                es_resp = None
            else:  # mixed mode (default)
                # Search both user and global protocols
                es_resp = search_mixed_protocols(
                    user_id=user_id,
                    query=payload.query,
                    size=payload.size,
                    user_protocols_first=True
                )

            # If we got personalized results, use them
            if es_resp and not es_resp.get("error"):
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

        except Exception as e:
            # If personalized search fails, fall back to global search
            print(f"⚠️  Personalized search failed, falling back to global: {str(e)}")

    # Global search (original logic) - used when no user_id or as fallback
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

@app.get("/users/{user_id}/protocols")
async def get_user_protocols(user_id: str, size: int = 20):
    """Get user's uploaded protocols from their Elasticsearch index"""
    if not user_id or not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id is required")

    if not settings.elasticsearch_configured:
        raise HTTPException(status_code=400, detail="Elasticsearch is not configured")

    try:
        # Import search function
        from services.elasticsearch_service import search_user_protocols

        # Get all user protocols (no specific query)
        result = search_user_protocols(user_id=user_id, query=None, size=size)

        if result.get("error"):
            return {"success": False, "protocols": [], "total": 0, "error": result["error"]}

        # Transform ES results to a more user-friendly format
        protocols = []
        for hit in result.get("hits", {}).get("hits", []):
            source = hit.get("_source", {})
            protocols.append({
                "id": hit.get("_id"),
                "title": source.get("title", "Untitled Protocol"),
                "organization": source.get("organization", "Custom Protocol"),
                "region": source.get("region", "User Defined"),
                "year": source.get("year", 2024),
                "created_at": source.get("last_reviewed", ""),
                "steps_count": source.get("steps_count", 0),
                "citations_count": source.get("citations_count", 0),
                "source_file": source.get("source", ""),
                "protocol_data": source  # Include full data for viewing
            })

        total = result.get("hits", {}).get("total", {}).get("value", 0)

        return {
            "success": True,
            "protocols": protocols,
            "total": total
        }

    except Exception as e:
        return {"success": False, "protocols": [], "total": 0, "error": str(e)}


@app.post("/protocols/generate", response_model=ProtocolGenerateResponse)
async def protocols_generate(payload: ProtocolGenerateRequest):
    if not settings.GEMINI_API_KEY:
        raise HTTPException(status_code=400, detail="GEMINI_API_KEY is not configured.")

    # Validate title and instructions
    validation = content_moderator.validate_protocol_generation(
        payload.title,
        payload.instructions
    )
    if not validation['valid']:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "invalid_input",
                "message": validation['reason'],
                "category": validation['category']
            }
        )

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

    # No content moderation for step threads - users are asking follow-up questions about existing protocols

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

    # Validate message content
    validation = content_moderator.validate_query(payload.message)
    if not validation['valid']:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "invalid_message",
                "message": validation['reason'],
                "category": validation['category']
            }
        )

    try:
        # Convert pydantic models to dicts for service layer
        history = [{"role": msg.role, "content": msg.content} for msg in payload.conversation_history]
        
        result = protocol_conversation_chat(
            message=payload.message,
            concept_title=payload.concept_title,
            protocol_json=payload.protocol_json,
            citations_list=payload.citations_list,
            filters_json=payload.filters_json,
            conversation_history=history,
            enable_context_search=payload.enable_context_search,
            user_id=payload.user_id
        )
        
        return ProtocolConversationResponse(
            answer=result.get("answer", ""),
            uncertainty_note=result.get("uncertainty_note"),
            sources=result.get("sources", []),
            citations=result.get("citations", []),
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
    print(f"\n{'='*80}")
    print(f"🗑️  DELETE CONVERSATION ENDPOINT CALLED")
    print(f"{'='*80}")
    print(f"📋 Parameters:")
    print(f"   - user_id: {user_id}")
    print(f"   - conversation_id: {conversation_id}")
    print(f"{'='*80}\n")

    if not user_id or not user_id.strip():
        print(f"❌ Validation failed: user_id is empty")
        raise HTTPException(status_code=400, detail="user_id is required")
    if not conversation_id or not conversation_id.strip():
        print(f"❌ Validation failed: conversation_id is empty")
        raise HTTPException(status_code=400, detail="conversation_id is required")

    print(f"✅ Validation passed, calling FirestoreService.delete_conversation...")
    result = FirestoreService.delete_conversation(user_id, conversation_id)

    print(f"\n📊 Deletion result from FirestoreService:")
    print(f"   Result: {result}")

    if not result.get("success"):
        print(f"❌ Deletion failed with error: {result.get('error')}")
        if result.get("error") == "not_found":
            raise HTTPException(status_code=404, detail="Conversation not found")
        status_code = 502 if result.get("error") == "firestore_error" else 500
        raise HTTPException(status_code=status_code, detail=result)

    print(f"✅ Conversation deleted successfully")
    print(f"{'='*80}\n")
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
    print(f"🔥 delete_saved_protocol_endpoint called with user_id={user_id}, protocol_id={protocol_id}")
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

# Document upload endpoints
@app.post("/users/{user_id}/upload-documents")
async def upload_documents(
    user_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    custom_prompt: str = Form(None)
):
    """Upload ZIP or PDF file containing medical PDFs for protocol extraction"""
    if not user_id or not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id is required")

    # Validate file type
    if not file.filename or not (file.filename.endswith('.zip') or file.filename.endswith('.pdf')):
        raise HTTPException(status_code=400, detail="Only ZIP or PDF files are allowed")

    # Validate file size (100MB limit)
    content = await file.read()
    if len(content) > 100 * 1024 * 1024:  # 100MB
        raise HTTPException(status_code=400, detail="File size exceeds 100MB limit")

    # Generate unique upload ID (without upload_ prefix to avoid duplication in filenames)
    upload_id = f"{hash(file.filename)}_{hash(content)}"

    # Initialize document processor
    # Use global processor to maintain cancellation state

    # Add background task for processing
    # Create a cancellable task instead of using background_tasks
    async def wrapped_process_upload():
        # Pass the filename to determine if it's a ZIP or PDF
        return await document_processor.process_upload(user_id, content, upload_id, custom_prompt, file.filename)

    # Create and track the task immediately
    upload_key = f"{user_id}_{upload_id}"
    task = asyncio.create_task(wrapped_process_upload())
    document_processor.active_tasks[upload_key] = task

    # Add callback to clean up task when it's done
    def cleanup_task(task_obj):
        document_processor.active_tasks.pop(upload_key, None)
        print(f"🧹 Cleaned up task for upload {upload_id}")

    task.add_done_callback(cleanup_task)

    return {
        "success": True,
        "upload_id": upload_id,
        "filename": file.filename,
        "size": len(content),
        "status": "processing",
        "message": "File uploaded successfully. Processing will begin shortly."
    }

@app.get("/users/{user_id}/upload-status/{upload_id}")
async def get_upload_status(user_id: str, upload_id: str):
    """Get status of document upload processing"""
    if not user_id or not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id is required")
    if not upload_id or not upload_id.strip():
        raise HTTPException(status_code=400, detail="upload_id is required")

    # Check if task is still active
    upload_key = f"{user_id}_{upload_id}"
    if upload_key in document_processor.active_tasks:
        task = document_processor.active_tasks[upload_key]
        if not task.done():
            # Still processing
            return {
                "upload_id": upload_id,
                "status": "processing",
                "progress": 50,
                "protocols_extracted": 0,
                "protocols_indexed": 0,
            }

    # Task completed or not found - return awaiting_approval
    return {
        "upload_id": upload_id,
        "status": "awaiting_approval",
        "progress": 100,
        "protocols_extracted": 3,  # Mock value - will be updated when protocols are fetched
        "protocols_indexed": 0,
        "processing_time": "1m 45s",
        "created_at": "2024-10-08T10:30:00Z"
    }

@app.post("/users/{user_id}/protocols/{protocol_id}/regenerate")
async def regenerate_protocol(
    user_id: str,
    protocol_id: str,
    background_tasks: BackgroundTasks,
    custom_prompt: str = Form(None)
):
    """Regenerate a specific user protocol with new custom prompt"""
    if not user_id or not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id is required")
    if not protocol_id or not protocol_id.strip():
        raise HTTPException(status_code=400, detail="protocol_id is required")

    # Initialize document processor
    # Use global processor to maintain cancellation state

    # Generate new regeneration ID
    regeneration_id = f"regen_{user_id}_{protocol_id}_{hash(custom_prompt or '')}"

    # Add background task for regeneration
    background_tasks.add_task(document_processor.regenerate_protocol, user_id, protocol_id, regeneration_id, custom_prompt)

    return {
        "success": True,
        "regeneration_id": regeneration_id,
        "protocol_id": protocol_id,
        "status": "processing",
        "message": "Protocol regeneration started. This may take a few minutes."
    }


@app.delete("/users/{user_id}/protocols/all")
async def delete_all_user_protocols_endpoint(user_id: str):
    """Delete all protocols for a user (both indexed protocols and preview files)"""
    print(f"🚀 delete_all_user_protocols_endpoint called for user {user_id}")
    if not user_id or not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id is required")

    try:
        # Delete indexed protocols from Elasticsearch
        from services.elasticsearch_service_additions import delete_all_user_protocols as es_delete_all_protocols
        deleted_count = await es_delete_all_protocols(user_id)
        print(f"✅ Successfully deleted {deleted_count} indexed protocols for user {user_id}")

        # Also delete all preview files for this user
        try:
            await document_processor.delete_preview_file(user_id, upload_id=None)
            print(f"✅ Successfully deleted all preview files for user {user_id}")
        except Exception as preview_error:
            print(f"⚠️ Failed to delete preview files: {str(preview_error)}")
            # Don't fail the whole request if preview deletion fails

        return {
            "success": True,
            "message": f"Successfully deleted {deleted_count} protocols and cleared previews",
            "deleted_count": deleted_count
        }
    except Exception as e:
        print(f"❌ Error deleting all protocols for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete protocols: {str(e)}")

@app.delete("/users/{user_id}/protocols/{protocol_id}")
async def delete_user_protocol(user_id: str, protocol_id: str):
    """Delete a specific user-uploaded protocol"""
    print(f"🎯 delete_user_protocol endpoint called with user_id={user_id}, protocol_id={protocol_id}")
    if not user_id or not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id is required")
    if not protocol_id or not protocol_id.strip():
        raise HTTPException(status_code=400, detail="protocol_id is required")

    try:
        print(f"🗑️ Deleting individual protocol {protocol_id} for user {user_id}")
        from services.elasticsearch_service_additions import delete_user_protocol as es_delete_protocol
        deleted = await es_delete_protocol(user_id, protocol_id)

        if deleted:
            return {
                "success": True,
                "message": "Protocol deleted successfully"
            }
        else:
            raise HTTPException(status_code=404, detail="Protocol not found")

    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        print(f"❌ Unexpected error deleting protocol {protocol_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete protocol: {str(e)}")

@app.put("/users/{user_id}/protocols/{protocol_id}/title")
async def update_user_protocol_title(
    user_id: str,
    protocol_id: str,
    title_update: dict  # {"title": "new title"}
):
    """Update the title of a specific user-uploaded protocol"""
    if not user_id or not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id is required")
    if not protocol_id or not protocol_id.strip():
        raise HTTPException(status_code=400, detail="protocol_id is required")

    new_title = title_update.get('title')
    if not new_title or not new_title.strip():
        raise HTTPException(status_code=400, detail="title is required")

    try:
        # Import Elasticsearch service
        from services.elasticsearch_service_additions import update_user_protocol_title as es_update_title

        # Update protocol title in user's Elasticsearch index
        updated = await es_update_title(user_id, protocol_id, new_title.strip())

        if updated:
            return {
                "success": True,
                "message": "Protocol title updated successfully"
            }
        else:
            raise HTTPException(status_code=404, detail="Protocol not found")

    except Exception as e:
        print(f"❌ Error updating protocol {protocol_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update protocol: {str(e)}")


@app.get("/users/{user_id}/upload-preview/{upload_id}")
async def get_upload_preview(user_id: str, upload_id: str):
    """Get preview of generated protocols before indexing"""
    if not user_id or not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id is required")
    if not upload_id or not upload_id.strip():
        raise HTTPException(status_code=400, detail="upload_id is required")

    try:
        # Initialize document processor
        # Use global processor to maintain cancellation state

        # Get stored protocols for this upload
        preview_data = await document_processor.get_preview_protocols(user_id, upload_id)
        protocols = preview_data.get("protocols", [])
        status = preview_data.get("status", "completed")

        return {
            "success": True,
            "upload_id": upload_id,
            "protocols": protocols,
            "status": status,
            "total": len(protocols)
        }

    except Exception as e:
        print(f"❌ Error getting upload preview: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get upload preview: {str(e)}")

@app.post("/users/{user_id}/upload-approve/{upload_id}")
async def approve_and_index_upload(user_id: str, upload_id: str, background_tasks: BackgroundTasks):
    """Approve and index the generated protocols"""
    if not user_id or not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id is required")
    if not upload_id or not upload_id.strip():
        raise HTTPException(status_code=400, detail="upload_id is required")

    try:
        # Initialize document processor
        # Use global processor to maintain cancellation state

        # Add background task for indexing
        background_tasks.add_task(document_processor.approve_and_index_protocols, user_id, upload_id)

        return {
            "success": True,
            "upload_id": upload_id,
            "status": "indexing",
            "message": "Protocols approved. Indexing in progress..."
        }

    except Exception as e:
        print(f"❌ Error approving upload: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to approve upload: {str(e)}")

@app.post("/users/{user_id}/upload-regenerate/{upload_id}")
async def regenerate_upload_protocols(
    user_id: str,
    upload_id: str,
    background_tasks: BackgroundTasks,
    custom_prompt: str = Form(None)
):
    """Regenerate protocols from an upload preview with new custom prompt"""
    if not user_id or not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id is required")
    if not upload_id or not upload_id.strip():
        raise HTTPException(status_code=400, detail="upload_id is required")

    try:
        # Initialize document processor
        # Use global processor to maintain cancellation state

        # Generate new regeneration ID
        regeneration_id = f"regen_{user_id}_{upload_id}_{hash(custom_prompt or '')}"

        # Add background task for regeneration
        background_tasks.add_task(document_processor.regenerate_upload_protocols, user_id, upload_id, regeneration_id, custom_prompt)

        return {
            "success": True,
            "regeneration_id": regeneration_id,
            "upload_id": upload_id,
            "status": "processing",
            "message": "Upload protocols regeneration started. This may take a few minutes."
        }

    except Exception as e:
        print(f"❌ Error regenerating upload protocols: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to regenerating upload protocols: {str(e)}")

@app.post("/users/{user_id}/upload-cancel/{upload_id}")
async def cancel_upload(user_id: str, upload_id: str):
    """Cancel an ongoing upload processing"""
    if not user_id or not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id is required")
    if not upload_id or not upload_id.strip():
        raise HTTPException(status_code=400, detail="upload_id is required")

    try:
        # Initialize document processor
        # Use global processor to maintain cancellation state

        # Set cancellation flag for the upload
        success = await document_processor.cancel_upload(user_id, upload_id)

        if success:
            print(f"🚫 Upload {upload_id} cancelled successfully")
            return {
                "success": True,
                "upload_id": upload_id,
                "message": "Upload cancelled successfully"
            }
        else:
            return {
                "success": False,
                "upload_id": upload_id,
                "message": "Upload not found or already completed"
            }
    except Exception as e:
        print(f"❌ Error cancelling upload: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to cancel upload: {str(e)}")

@app.delete("/users/{user_id}/upload-preview/{upload_id}")
async def delete_upload_preview(user_id: str, upload_id: str):
    """Delete preview file for a completed upload (Clear All functionality)"""
    if not user_id or not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id is required")
    if not upload_id or not upload_id.strip():
        raise HTTPException(status_code=400, detail="upload_id is required")

    try:
        # Delete the preview file
        deleted = await document_processor.delete_preview_file(user_id, upload_id)

        if deleted:
            print(f"🧹 Preview file deleted for upload {upload_id}")
            return {
                "success": True,
                "upload_id": upload_id,
                "message": "Preview file deleted successfully"
            }
        else:
            print(f"⚠️ Preview file not found for upload {upload_id}")
            return {
                "success": True,  # Still return success since the goal (no preview file) is achieved
                "upload_id": upload_id,
                "message": "Preview file not found (already deleted or never existed)"
            }
    except Exception as e:
        print(f"❌ Error deleting preview file: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete preview file: {str(e)}")


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.DEBUG
    )
