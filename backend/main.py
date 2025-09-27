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
)
from services.elasticsearch_service import (
    check_cluster_health,
    ensure_index,
    search_protocols,
    count_documents,
    get_sample_documents,
    search_with_filters,
)
from services.gemini_service import summarize_checklist

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
async def protocols_search(payload: ProtocolSearchRequest):
    if not settings.elasticsearch_configured:
        raise HTTPException(status_code=400, detail="Elasticsearch is not configured.")
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

    checklist_items = [
        {"step": item.get("step", idx + 1), "text": item.get("text", "")} 
        for idx, item in enumerate(result.get("checklist", []))
    ]
    return ProtocolGenerateResponse(
        title=result.get("title", payload.title),
        checklist=checklist_items,
        citations=result.get("citations", []),
    )

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.DEBUG
    )
