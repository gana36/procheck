# ProCheck Backend API

FastAPI backend service for medical protocol search and generation using Elasticsearch and Gemini AI.

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

- `ELASTICSEARCH_URL`: Your Elasticsearch cluster URL
- `ELASTICSEARCH_USERNAME`: Elasticsearch username
- `ELASTICSEARCH_PASSWORD`: Elasticsearch password
- `ELASTICSEARCH_INDEX_NAME`: Index name for medical protocols
- `GEMINI_API_KEY`: Google Gemini API key
- `API_HOST`: Host to bind the server (default: 0.0.0.0)
- `API_PORT`: Port to bind the server (default: 8000)
- `DEBUG`: Enable debug mode (default: True)
- `ALLOWED_ORIGINS`: Comma-separated list of allowed CORS origins

## 🏥 API Endpoints

### Health & Status
- `GET /` - Root endpoint with basic info
- `GET /health` - Detailed health check
- `GET /test` - Test endpoint for configuration

### Protocol Search (Coming Soon)
- `POST /api/protocols/search` - Search medical protocols
- `POST /api/protocols/generate` - Generate protocol checklist
- `GET /api/protocols/{protocol_id}` - Get specific protocol

## 🔍 Development Status

✅ **Completed:**
- Basic FastAPI setup
- CORS middleware configuration
- Health check endpoints
- Environment configuration

🚧 **In Progress:**
- Elasticsearch integration
- Gemini API integration
- Protocol search endpoints

📋 **Planned:**
- Authentication middleware
- Rate limiting
- Comprehensive error handling
- Logging and monitoring
- Unit tests
- Docker configuration

## 🧪 Testing

```bash
# Test the health endpoint
curl http://localhost:8000/health

# Test the root endpoint
curl http://localhost:8000/

# Test configuration
curl http://localhost:8000/test
```

## 📚 Documentation

- Interactive API docs: http://localhost:8000/docs
- ReDoc documentation: http://localhost:8000/redoc
- OpenAPI schema: http://localhost:8000/openapi.json

