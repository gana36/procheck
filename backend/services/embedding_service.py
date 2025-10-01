"""
Embedding service using Google Gemini
Generates embeddings for hybrid search in Elasticsearch
"""

from typing import List, Optional
import google.generativeai as genai
from config.settings import settings

_embedding_initialized = False

def _ensure_embedding_client():
    global _embedding_initialized
    if _embedding_initialized:
        return
    if not settings.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured")
    genai.configure(api_key=settings.GEMINI_API_KEY)
    _embedding_initialized = True


def generate_embedding(text: str, task_type: str = "retrieval_document") -> Optional[List[float]]:
    """
    Generate embedding for a single text using Gemini.
    
    Args:
        text: Text to embed
        task_type: Type of embedding task
            - "retrieval_document": For indexing documents
            - "retrieval_query": For search queries
            - "semantic_similarity": For similarity comparison
    
    Returns:
        List of floats representing the embedding vector, or None on error
    """
    _ensure_embedding_client()
    
    try:
        # Use Gemini's text-embedding-004 model (768 dimensions)
        result = genai.embed_content(
            model="models/text-embedding-004",
            content=text,
            task_type=task_type,
        )
        return result['embedding']
    except Exception as e:
        print(f"Error generating embedding: {e}")
        return None


def generate_embeddings_batch(texts: List[str], task_type: str = "retrieval_document") -> List[Optional[List[float]]]:
    """
    Generate embeddings for multiple texts.
    
    Args:
        texts: List of texts to embed
        task_type: Type of embedding task
    
    Returns:
        List of embedding vectors (same length as input)
    """
    _ensure_embedding_client()
    
    embeddings = []
    for text in texts:
        emb = generate_embedding(text, task_type)
        embeddings.append(emb)
    
    return embeddings


def enhance_query_with_llm(query: str) -> dict:
    """
    Enhance user query using Gemini for better search results.
    Expands medical terms, adds synonyms, and clarifies intent.
    
    Args:
        query: User's natural language query
    
    Returns:
        Dict with enhanced_query, intent, and keywords
    """
    _ensure_embedding_client()
    
    try:
        model = genai.GenerativeModel(
            model_name="gemini-2.0-flash-exp",
            generation_config={
                "temperature": 0.1,
                "max_output_tokens": 256,
            },
        )
        
        prompt = f"""You are a medical search assistant. Analyze this query and enhance it for better search.

User Query: "{query}"

Provide a JSON response with:
1. "enhanced_query": Expanded query with medical synonyms and related terms (max 20 words)
2. "intent": Classification - one of: diagnostic, treatment, risk_assessment, procedure, general
3. "keywords": Array of 3-5 key medical terms to boost search

Example:
Query: "chest pain treatment"
{{
  "enhanced_query": "chest pain cardiac assessment treatment protocol angina myocardial infarction emergency care",
  "intent": "treatment",
  "keywords": ["chest pain", "cardiac", "treatment", "emergency"]
}}

Output ONLY valid JSON, no markdown or explanation."""

        response = model.generate_content(prompt)
        
        import json
        try:
            result = json.loads(response.text)
            return result
        except:
            # Fallback: return original query
            return {
                "enhanced_query": query,
                "intent": "general",
                "keywords": query.split()[:5]
            }
    
    except Exception as e:
        print(f"Error enhancing query: {e}")
        return {
            "enhanced_query": query,
            "intent": "general",
            "keywords": query.split()[:5]
        }


