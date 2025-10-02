# 🚀 ProCheck Hybrid Search - Quick Reference

## ⚡ In 5 Minutes

### 1. Start Backend
```bash
cd backend
source venv/bin/activate  # or: venv\Scripts\activate on Windows
python main.py
```

### 2. Create Index
```bash
curl -X POST http://localhost:8000/elasticsearch/ensure-index
```

### 3. Load Sample Data
```bash
python utils/index_documents.py data/sample_protocols.json
```

### 4. Test Hybrid Search
```bash
curl -X POST "http://localhost:8000/protocols/search?use_hybrid=true" \
  -H "Content-Type: application/json" \
  -d '{"query": "mosquito disease symptoms", "size": 5}'
```

---

## 🎯 Key API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/protocols/search?use_hybrid=true` | POST | **Hybrid search** (BM25 + Vector + RRF) |
| `/protocols/search?enhance_query=true` | POST | With AI query enhancement |
| `/protocols/generate` | POST | Generate checklist from context |
| `/elasticsearch/ensure-index` | POST | Create index with vector mapping |
| `/elasticsearch/count` | GET | Count documents |

---

## 📋 Search Request Format

```json
{
  "query": "your search query here",
  "size": 10,
  "filters": {
    "region": ["Global", "UK"],
    "year": [2023, 2024],
    "organization": ["NHS", "WHO"],
    "disease": ["dengue", "malaria"]
  }
}
```

---

## 🏗️ Document Format for Indexing

```json
{
  "disease": "dengue",
  "region": "Global/UK",
  "year": 2023,
  "organization": "NHS",
  "title": "Protocol title",
  "section": "Section name",
  "body": "Full protocol text content...",
  "source_url": "https://source.url",
  "last_reviewed": "2023-01-11",
  "next_review_due": "2026-01-11"
}
```

---

## 🔧 Environment Variables (.env)

```bash
# Required
ELASTICSEARCH_URL=https://your-cluster.es.io:443
ELASTICSEARCH_API_KEY=your_api_key_here
GEMINI_API_KEY=your_gemini_key_here

# Optional
ELASTICSEARCH_INDEX_NAME=medical_protocols
GEMINI_MODEL=gemini-2.0-flash-exp
API_PORT=8000
DEBUG=True
```

---

## 🧪 Testing Comparison

### Traditional Search
```bash
curl -X POST "http://localhost:8000/protocols/search?use_hybrid=false" \
  -H "Content-Type: application/json" \
  -d '{"query": "trouble breathing", "size": 5}'
```

### Hybrid Search
```bash
curl -X POST "http://localhost:8000/protocols/search?use_hybrid=true" \
  -H "Content-Type: application/json" \
  -d '{"query": "trouble breathing", "size": 5}'
```

**Result:** Hybrid finds "respiratory distress" and "dyspnea" protocols!

---

## 📊 How It Works

```
User Query: "mosquito fever"
    ↓
[Optional: Query Enhancement via Gemini LLM]
    ↓
"mosquito fever dengue malaria vector-borne disease"
    ↓
    ├── [BM25 Search] → Keyword matches
    │   (title^3, disease^2.5, section^2, body)
    │
    └── [Vector Search] → Semantic similarity
        (768-dim Gemini embeddings, cosine similarity)
    ↓
[RRF Fusion] → Merge results (1/(rank+60) scoring)
    ↓
Top K Results (best of both worlds!)
```

---

## 🎨 Frontend Integration

```typescript
// In your API client
const searchProtocols = async (query: string) => {
  const response = await fetch(
    `http://localhost:8000/protocols/search?use_hybrid=true`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        size: 10,
        filters: {}
      })
    }
  );
  return response.json();
};
```

---

## 🏆 Hackathon Demo Script

1. **Show the problem**: Traditional search missing relevant results
   ```
   Query: "bug bite fever"
   Traditional: Only finds docs with exact words
   ```

2. **Show hybrid search**: Finding semantically relevant results
   ```
   Query: "bug bite fever"
   Hybrid: Finds dengue, malaria, vector-borne diseases
   ```

3. **Show query enhancement**: AI expanding medical terms
   ```
   Query: "heart attack"
   Enhanced: "heart attack myocardial infarction cardiac arrest chest pain emergency protocol"
   ```

4. **Show filters**: Precise control + AI understanding
   ```
   Query: "diabetes management"
   Filters: Region=UK, Year=2023, Organization=NHS
   Result: Latest UK-specific protocols
   ```

---

## 🐛 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| "body_embedding field not found" | Recreate index: `curl -X DELETE` then `curl -X POST ensure-index` |
| Slow embedding generation | First call initializes client; subsequent calls are fast |
| RRF not supported | Ensure Elasticsearch 8.9+; or set `use_rrf=False` in code |
| Connection refused | Check Elasticsearch URL and API key in `.env` |
| Import errors | Run `pip install -r requirements.txt` |

---

## 📁 New Files Created

✅ `backend/services/embedding_service.py` - Gemini embeddings
✅ `backend/utils/index_documents.py` - Data loading script
✅ `backend/data/sample_protocols.json` - 10 sample documents
✅ `backend/HYBRID_SEARCH_GUIDE.md` - Detailed documentation
✅ `HACKATHON_IMPROVEMENT_PLAN.md` - Complete strategy guide
✅ `QUICK_REFERENCE.md` - This file!

**Modified:**
- `backend/services/elasticsearch_service.py` - Added `hybrid_search()`
- `backend/main.py` - Updated `/protocols/search` endpoint
- `backend/README.md` - Added hybrid search docs

---

## 🎯 Winning Points

1. ✅ **Elastic's hybrid search** (RRF) - Core requirement
2. ✅ **Google Cloud Gemini** - Embeddings + LLM
3. ✅ **Conversational AI** - Natural language queries
4. ✅ **Real-world impact** - Medical protocol search
5. ✅ **Technical depth** - Advanced ES features, proper architecture
6. ✅ **Documentation** - Complete guides and examples

---

## 🚀 Next Steps

1. ✏️ Curate 20-50 medical protocol documents
2. 📦 Index them with embeddings
3. 🧪 Test hybrid search with various queries
4. 🎨 Update frontend to use `use_hybrid=true`
5. 📊 Prepare demo with 5 example queries
6. 🎬 Practice presentation (5-10 min)

---

## 💡 Demo Query Ideas

Great queries to showcase semantic search:

- "trouble breathing" → finds "respiratory distress"
- "bug bite fever" → finds "dengue", "malaria"
- "heart attack" → finds "myocardial infarction", "cardiac arrest"
- "high blood sugar" → finds "diabetes", "hyperglycemia"
- "stroke signs" → finds "cerebrovascular accident", "FAST test"

---

## 📞 Need More Info?

- **Technical Details**: `backend/HYBRID_SEARCH_GUIDE.md`
- **Implementation Plan**: `HACKATHON_IMPROVEMENT_PLAN.md`
- **API Docs**: http://localhost:8000/docs
- **Backend README**: `backend/README.md`

**Good luck! 🏆**


