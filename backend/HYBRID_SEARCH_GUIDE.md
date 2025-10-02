# 🚀 Hybrid Search Implementation Guide

## Overview

This implementation combines **Elastic's Hybrid Search** with **Google Cloud's Gemini AI** to create a powerful, context-aware medical protocol search system.

### Key Technologies
- **Elasticsearch 8.11+**: Vector search with RRF (Reciprocal Rank Fusion)
- **Google Gemini**: Text embeddings (768-dim) and query enhancement
- **FastAPI**: Modern async API framework

---

## 🎯 What Makes This Hybrid Search Special?

### 1. **Dual Search Strategy**
- **BM25 (Keyword Search)**: Traditional full-text search for exact matches
- **Semantic Search (Vectors)**: Understanding meaning and context
- **RRF Fusion**: Intelligently merges both results for best accuracy

### 2. **Query Enhancement** (Optional)
- Uses Gemini LLM to expand medical queries
- Adds relevant synonyms and related terms
- Example: `"chest pain"` → `"chest pain cardiac assessment angina myocardial infarction emergency"`

### 3. **Smart Field Weighting**
```python
Fields and Boost Factors:
- title: 3.0x
- disease: 2.5x
- section: 2.0x
- body: 1.0x (baseline)
```

---

## 📦 Setup Instructions

### Step 1: Install Dependencies
```bash
cd backend
pip install -r requirements.txt
```

### Step 2: Configure Environment Variables
Create a `.env` file in the `backend/` directory:

```bash
# Elasticsearch Configuration
ELASTICSEARCH_URL=https://your-elastic-cloud-deployment.es.io:443
ELASTICSEARCH_API_KEY=your_api_key_here

# Or use username/password
# ELASTICSEARCH_USERNAME=elastic
# ELASTICSEARCH_PASSWORD=your_password

ELASTICSEARCH_INDEX_NAME=medical_protocols

# Google Gemini API
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.0-flash-exp

# API Configuration
API_HOST=0.0.0.0
API_PORT=8000
DEBUG=True
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

### Step 3: Create the Index
```bash
# Start your server
python main.py

# Or use uvicorn
uvicorn main:app --reload

# Create index with vector mapping
curl -X POST http://localhost:8000/elasticsearch/ensure-index
```

---

## 📊 Indexing Your Data

### Option 1: Using the Helper Script

**Single Document:**
```json
// dengue_protocol.json
{
  "disease": "dengue",
  "region": "Global/UK",
  "year": 2023,
  "organization": "NHS",
  "title": "Check if you're at risk of dengue",
  "section": "Risk Factors",
  "body": "You can get dengue if you're bitten by an infected mosquito...",
  "source_url": "https://www.nhs.uk/conditions/dengue/",
  "last_reviewed": "2023-01-11",
  "next_review_due": "2026-01-11"
}
```

**Index it:**
```bash
cd backend
python utils/index_documents.py data/dengue_protocol.json
```

**Multiple Documents:**
```json
// protocols.json
[
  {
    "disease": "dengue",
    "title": "Dengue Risk Assessment",
    "body": "...",
    ...
  },
  {
    "disease": "malaria",
    "title": "Malaria Prevention",
    "body": "...",
    ...
  }
]
```

```bash
python utils/index_documents.py data/protocols.json
```

### Option 2: Programmatically

```python
from utils.index_documents import index_documents_batch

documents = [
    {
        "disease": "dengue",
        "title": "Dengue Protocol",
        "body": "Full protocol text here...",
        "region": "Global",
        "year": 2023,
        "organization": "NHS"
    },
    # ... more documents
]

results = index_documents_batch(documents)
print(f"Indexed {results['success']} documents")
```

---

## 🔍 Using Hybrid Search

### Basic Hybrid Search

**API Request:**
```bash
curl -X POST "http://localhost:8000/protocols/search?use_hybrid=true" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "symptoms of dengue fever",
    "size": 5,
    "filters": {
      "region": ["Global/UK"],
      "year": [2023]
    }
  }'
```

**Python Example:**
```python
import requests

response = requests.post(
    "http://localhost:8000/protocols/search",
    params={"use_hybrid": True, "enhance_query": False},
    json={
        "query": "chest pain treatment protocol",
        "size": 10,
        "filters": {
            "organization": ["NHS"],
            "year": [2023, 2024]
        }
    }
)

results = response.json()
print(f"Found {results['total']} results")

for hit in results['hits']:
    print(f"- {hit['source']['title']} (score: {hit['score']})")
```

### With Query Enhancement

**Request:**
```bash
curl -X POST "http://localhost:8000/protocols/search?use_hybrid=true&enhance_query=true" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "heart attack",
    "size": 5
  }'
```

**What happens:**
1. Query `"heart attack"` is sent to Gemini
2. Gemini expands it: `"heart attack myocardial infarction cardiac arrest chest pain emergency protocol"`
3. Enhanced query is used for both keyword and semantic search
4. Results are merged using RRF

---

## 🎨 How Hybrid Search Works

### The RRF Algorithm

Elasticsearch uses **Reciprocal Rank Fusion** to combine results from multiple retrievers:

```
RRF Score = Σ (1 / (rank + k))

where:
- rank = position in result list (1, 2, 3, ...)
- k = constant (default: 60)
```

**Example:**
```
Document appears at:
- Rank 1 in keyword search → score = 1/(1+60) = 0.0164
- Rank 3 in vector search   → score = 1/(3+60) = 0.0159
- Final RRF score = 0.0323
```

### Search Flow

```mermaid
User Query: "dengue symptoms"
    ↓
[Query Enhancement] (optional)
    ↓
"dengue symptoms fever rash hemorrhagic"
    ↓
    ├─→ [BM25 Search] → Results A
    │   (keyword matching on title, disease, body)
    │
    └─→ [Vector Search] → Results B
        (semantic similarity using embeddings)
    ↓
[RRF Fusion] → Merge A + B
    ↓
Top K Results (ranked by RRF score)
```

---

## 📈 Performance Tips

### 1. Batch Indexing
When indexing many documents, process in batches:

```python
# Index in batches of 50
for i in range(0, len(all_docs), 50):
    batch = all_docs[i:i+50]
    index_documents_batch(batch)
```

### 2. Optimize Search Parameters

```python
# Adjust rank_window_size for better relevance
# Larger = more thorough but slower
hybrid_search(
    query="...",
    size=10,
    rank_window_size=20  # Consider top 20 from each retriever
)
```

### 3. Filter Early
Use filters to reduce search space:

```python
{
    "query": "treatment protocol",
    "filters": {
        "year": [2023, 2024],      # Only recent
        "region": ["UK"],            # Location-specific
        "organization": ["NHS"]      # Trusted sources
    }
}
```

---

## 🧪 Testing Your Implementation

### 1. Test Index Creation
```bash
curl http://localhost:8000/elasticsearch/ensure-index
```

Expected response:
```json
{"exists": true, "index": "medical_protocols"}
```

### 2. Test Document Count
```bash
curl http://localhost:8000/elasticsearch/count
```

### 3. Test Hybrid Search
```bash
curl -X POST "http://localhost:8000/protocols/search?use_hybrid=true" \
  -H "Content-Type: application/json" \
  -d '{"query": "dengue risk factors", "size": 3}'
```

### 4. Compare Search Methods

**Traditional Search:**
```bash
curl -X POST "http://localhost:8000/protocols/search?use_hybrid=false" \
  -H "Content-Type: application/json" \
  -d '{"query": "mosquito disease", "size": 5}'
```

**Hybrid Search:**
```bash
curl -X POST "http://localhost:8000/protocols/search?use_hybrid=true" \
  -H "Content-Type: application/json" \
  -d '{"query": "mosquito disease", "size": 5}'
```

Compare the results to see how semantic search improves relevance!

---

## 🏆 Hackathon Talking Points

### 1. **Technology Integration**
✅ Elasticsearch hybrid search (RRF)
✅ Google Cloud Gemini (embeddings + LLM)
✅ FastAPI with async operations
✅ Firestore for conversation storage

### 2. **Innovation**
- **Query Enhancement**: LLM expands user queries for better medical term coverage
- **Dual Retrieval**: Combines exact matching with semantic understanding
- **Smart Ranking**: RRF intelligently merges results from both strategies

### 3. **Real-World Impact**
- Medical professionals can search using natural language
- Semantic search finds relevant protocols even without exact keyword matches
- Example: Searching "trouble breathing" will find "respiratory distress" protocols

### 4. **Scalability**
- Efficient vector indexing with cosine similarity
- Filters reduce search space before expensive operations
- Async API for concurrent requests

---

## 🐛 Troubleshooting

### Issue: "body_embedding field not found"
**Solution:** Recreate the index with proper mapping
```bash
# Delete old index (WARNING: destroys data)
curl -X DELETE "http://localhost:8000/elasticsearch/medical_protocols"

# Create new index with vector field
curl -X POST "http://localhost:8000/elasticsearch/ensure-index"

# Re-index documents
python utils/index_documents.py data/protocols.json
```

### Issue: Slow embedding generation
**Solution:** The first embedding call initializes the Gemini client. Subsequent calls are faster.

### Issue: RRF retriever not supported
**Solution:** Ensure Elasticsearch version is 8.9+. Check with:
```bash
curl http://localhost:8000/elasticsearch/health
```

If using older ES, set `use_rrf=False` to use kNN fallback:
```python
hybrid_search(..., use_rrf=False)
```

---

## 📚 Additional Resources

- [Elasticsearch RRF Documentation](https://www.elastic.co/guide/en/elasticsearch/reference/current/rrf.html)
- [Google Gemini Embeddings](https://ai.google.dev/gemini-api/docs/embeddings)
- [Dense Vector Field Type](https://www.elastic.co/guide/en/elasticsearch/reference/current/dense-vector.html)

---

## 🎯 Next Steps

1. **Index your curated dataset** using the helper script
2. **Test hybrid search** with various medical queries
3. **Compare results** between traditional and hybrid search
4. **Demo the query enhancement** feature to show LLM integration
5. **Prepare metrics** (search quality, response time, etc.) for the hackathon presentation

Good luck! 🚀


