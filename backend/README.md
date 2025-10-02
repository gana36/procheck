# ProCheck Backend API

FastAPI backend service for medical protocol search and generation using **Elastic Hybrid Search** and **Google Cloud Gemini AI**.

## 🏆 **NEW: Hybrid Search Feature!**

This implementation combines **BM25 keyword search** with **semantic vector search** using Elasticsearch's RRF (Reciprocal Rank Fusion) - perfect for the Elastic + Google Cloud hackathon challenge!

**Key Features:**
- 🔍 **Hybrid Search**: Combines text matching + semantic understanding
- 🤖 **AI Query Enhancement**: Gemini expands queries with medical terminology
- 📊 **Vector Embeddings**: 768-dim Gemini embeddings for semantic search
- ⚡ **RRF Ranking**: Intelligent result fusion from multiple retrievers

👉 **See [HYBRID_SEARCH_GUIDE.md](HYBRID_SEARCH_GUIDE.md) for detailed documentation**

## 🚀 Quick Start

### Prerequisites
- Python 3.8+
- pip or poetry
- Elasticsearch cluster (GCP)
- Gemini API key

### Installation

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your actual configuration
```

5. Run the development server:
```bash
python main.py
```

The API will be available at:
- API: http://localhost:8000
- Documentation: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## 📁 Project Structure

```
backend/
├── main.py                 # FastAPI application entry point
├── requirements.txt        # Python dependencies
├── .env.example           # Environment variables template
├── .env                   # Your environment variables (not in git)
├── config/                # Configuration modules
├── services/              # Business logic services
├── models/                # Pydantic models
├── utils/                 # Utility functions
└── tests/                 # Test files
```

## 🔧 Configuration

### Environment Variables

Required:
- `ELASTICSEARCH_URL`: Your Elasticsearch Cloud URL
- `ELASTICSEARCH_API_KEY`: Elasticsearch API key (or username/password)
- `ELASTICSEARCH_INDEX_NAME`: Index name (default: medical_protocols)
- `GEMINI_API_KEY`: Google Gemini API key

Optional:
- `GEMINI_MODEL`: Gemini model name (default: gemini-2.0-flash-exp)
- `API_HOST`: Host to bind the server (default: 0.0.0.0)
- `API_PORT`: Port to bind the server (default: 8000)
- `DEBUG`: Enable debug mode (default: True)
- `ALLOWED_ORIGINS`: Comma-separated list of allowed CORS origins

## 🏥 API Endpoints

### Health & Status
- `GET /` - Root endpoint with basic info
- `GET /health` - Detailed health check
- `GET /elasticsearch/health` - Elasticsearch cluster health

### Protocol Search ✨ **NEW HYBRID SEARCH**
- `POST /protocols/search?use_hybrid=true` - **Hybrid search** (BM25 + vectors + RRF)
- `POST /protocols/search?use_hybrid=true&enhance_query=true` - With AI query enhancement
- `POST /protocols/generate` - Generate protocol checklist with Gemini

### Elasticsearch Management
- `POST /elasticsearch/ensure-index` - Create index with vector field mapping
- `GET /elasticsearch/count` - Count indexed documents
- `GET /elasticsearch/sample` - Get sample documents

### Conversations
- `POST /conversations/save` - Save user conversation
- `GET /conversations/{user_id}` - Get user's conversations
- `GET /conversations/{user_id}/{conversation_id}` - Get specific conversation
- `DELETE /conversations/{user_id}/{conversation_id}` - Delete conversation

## 🔍 Development Status

✅ **Completed:**
- ✨ **Hybrid Search** with Elasticsearch RRF (BM25 + Vector)
- ✨ **Gemini Embeddings** (text-embedding-004, 768-dim)
- ✨ **AI Query Enhancement** using Gemini LLM
- Elasticsearch integration with dense_vector support
- Gemini API integration for summarization
- Protocol search and generation endpoints
- Firestore conversation storage
- CORS middleware and health checks
- Complete API documentation

📋 **Optional Enhancements:**
- Result re-ranking with LLM
- Search analytics dashboard
- Query suggestions
- Multi-modal search (images)
- Authentication middleware
- Rate limiting
- Docker configuration

## 🧪 Quick Start Guide

### 1. Index Sample Data
```bash
# Index the sample medical protocols with embeddings
python utils/index_documents.py data/sample_protocols.json
```

### 2. Test Hybrid Search
```bash
# Traditional search
curl -X POST "http://localhost:8000/protocols/search?use_hybrid=false" \
  -H "Content-Type: application/json" \
  -d '{"query": "mosquito disease", "size": 5}'

# Hybrid search (BM25 + Vector + RRF)
curl -X POST "http://localhost:8000/protocols/search?use_hybrid=true" \
  -H "Content-Type: application/json" \
  -d '{"query": "mosquito disease", "size": 5}'

# With AI query enhancement
curl -X POST "http://localhost:8000/protocols/search?use_hybrid=true&enhance_query=true" \
  -H "Content-Type: application/json" \
  -d '{"query": "fever from bug bites", "size": 5}'
```

### 3. Test Health Endpoints
```bash
curl http://localhost:8000/health
curl http://localhost:8000/elasticsearch/health
curl http://localhost:8000/elasticsearch/count
```

## 📚 Documentation

- **[Hybrid Search Guide](HYBRID_SEARCH_GUIDE.md)** - Complete technical documentation
- **[Hackathon Plan](../HACKATHON_IMPROVEMENT_PLAN.md)** - Step-by-step implementation guide
- Interactive API docs: http://localhost:8000/docs
- ReDoc documentation: http://localhost:8000/redoc
- OpenAPI schema: http://localhost:8000/openapi.json

## 🎯 For the Hackathon

This implementation directly addresses the **Elastic Challenge**:
- ✅ Elastic's **hybrid search capabilities** (RRF)
- ✅ **Google Cloud's generative AI** (Gemini embeddings + LLM)
- ✅ **Conversational and context-aware** solution
- ✅ Transforms how people interact with **medical protocol data**

See [HACKATHON_IMPROVEMENT_PLAN.md](../HACKATHON_IMPROVEMENT_PLAN.md) for the complete strategy!

