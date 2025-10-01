"""
Elasticsearch service for ProCheck
Provides connection handling and basic operations
"""

from typing import Any, Dict, Optional
from elasticsearch import Elasticsearch, ApiError
from elasticsearch.exceptions import ConnectionError as EsConnectionError
from elasticsearch.exceptions import AuthenticationException
from config.settings import settings

_client: Optional[Elasticsearch] = None


def get_client() -> Elasticsearch:
    global _client
    if _client is not None:
        return _client

    kwargs: Dict[str, Any] = {
        "hosts": [settings.ELASTICSEARCH_URL],
        "verify_certs": True,
        "request_timeout": 30,
    }

    if settings.ELASTICSEARCH_API_KEY:
        kwargs["api_key"] = settings.ELASTICSEARCH_API_KEY
    elif settings.ELASTICSEARCH_USERNAME and settings.ELASTICSEARCH_PASSWORD:
        kwargs["basic_auth"] = (settings.ELASTICSEARCH_USERNAME, settings.ELASTICSEARCH_PASSWORD)

    _client = Elasticsearch(**kwargs)
    return _client


def check_cluster_health() -> Dict[str, Any]:
    client = get_client()
    try:
        # Serverless-compatible health: ping + info
        reachable = client.ping()
        info = client.info()
        return {
            "reachable": reachable,
            "cluster_name": info.get("name"),
            "version": info.get("version", {}).get("number"),
            "tagline": info.get("tagline"),
        }
    except AuthenticationException as e:
        return {"error": "authentication_failed", "details": str(e)}
    except EsConnectionError as e:
        return {"error": "connection_failed", "details": str(e)}
    except ApiError as e:
        return {"error": "api_error", "details": str(e)}
    except Exception as e:
        return {"error": "unexpected_error", "details": str(e)}


def ensure_index(index_name: Optional[str] = None) -> Dict[str, Any]:
    client = get_client()
    index = index_name or settings.ELASTICSEARCH_INDEX_NAME
    try:
        if client.indices.exists(index=index):
            return {"exists": True, "index": index}
        
        # Enhanced mapping with dense_vector for hybrid search
        body = {
            "settings": {
                "number_of_shards": 1,
                "number_of_replicas": 1
            },
            "mappings": {
                "properties": {
                    # Medical document fields
                    "disease": {"type": "keyword"},
                    "region": {"type": "keyword"},
                    "year": {"type": "integer"},
                    "organization": {"type": "keyword"},
                    "title": {
                        "type": "text",
                        "fields": {
                            "keyword": {"type": "keyword"}
                        }
                    },
                    "section": {"type": "text"},
                    "body": {"type": "text"},
                    "source_url": {"type": "keyword"},
                    "last_reviewed": {"type": "date"},
                    "next_review_due": {"type": "date"},
                    
                    # Vector embedding field for semantic search (Gemini text-embedding-004 = 768 dims)
                    "body_embedding": {
                        "type": "dense_vector",
                        "dims": 768,
                        "index": True,
                        "similarity": "cosine"
                    },
                    
                    # Legacy fields for backward compatibility
                    "content": {"type": "text"},
                    "source": {"type": "keyword"},
                    "tags": {"type": "keyword"}
                }
            }
        }
        client.indices.create(index=index, body=body)
        return {"created": True, "index": index}
    except ApiError as e:
        return {"error": "api_error", "details": str(e)}
    except Exception as e:
        return {"error": "unexpected_error", "details": str(e)}


def search_protocols(query: Optional[str] = None, size: int = 5, index_name: Optional[str] = None) -> Dict[str, Any]:
    client = get_client()
    index = index_name or settings.ELASTICSEARCH_INDEX_NAME
    try:
        if query and query.strip():
            es_query: Dict[str, Any] = {
                "multi_match": {
                    "query": query,
                    "fields": ["title^2", "content", "tags", "_all"],
                    "type": "best_fields"
                }
            }
        else:
            es_query = {"match_all": {}}
        resp = client.search(
            index=index,
            body={
                "size": size,
                "query": es_query,
                "sort": [{"_score": {"order": "desc"}}],
                "highlight": {
                    "fields": {
                        "content": {}
                    }
                }
            }
        )
        return resp
    except ApiError as e:
        return {"error": "api_error", "details": str(e)}
    except Exception as e:
        return {"error": "unexpected_error", "details": str(e)}


def count_documents(index_name: Optional[str] = None) -> Dict[str, Any]:
    client = get_client()
    index = index_name or settings.ELASTICSEARCH_INDEX_NAME
    try:
        resp = client.count(index=index, body={"query": {"match_all": {}}})
        return {"index": index, "count": resp.get("count", 0)}
    except ApiError as e:
        return {"error": "api_error", "details": str(e)}
    except Exception as e:
        return {"error": "unexpected_error", "details": str(e)}


def get_sample_documents(size: int = 3, index_name: Optional[str] = None) -> Dict[str, Any]:
    return search_protocols(query=None, size=size, index_name=index_name)


def search_with_filters(payload: Dict[str, Any], index_name: Optional[str] = None) -> Dict[str, Any]:
    client = get_client()
    index = index_name or settings.ELASTICSEARCH_INDEX_NAME
    try:
        query = payload.get("query")
        size = int(payload.get("size", 10))
        filters = payload.get("filters") or {}

        must_clause: list[Dict[str, Any]] = []
        filter_clause: list[Dict[str, Any]] = []

        if query and str(query).strip():
            must_clause.append({
                "multi_match": {
                    "query": query,
                    "fields": ["title^3", "disease^2.5", "section^2", "body", "content", "tags", "organization"],
                    "type": "best_fields"
                }
            })
        else:
            must_clause.append({"match_all": {}})

        # term filters
        def add_terms(field: str, values: Any):
            if isinstance(values, list) and values:
                filter_clause.append({"terms": {field: values}})

        add_terms("region", filters.get("region"))
        add_terms("year", filters.get("year"))
        add_terms("organization", filters.get("organization"))
        add_terms("tags", filters.get("tags"))
        add_terms("disease", filters.get("disease"))

        es_query = {
            "bool": {
                "must": must_clause,
                "filter": filter_clause
            }
        }

        resp = client.search(
            index=index,
            body={
                "size": size,
                "query": es_query,
                "highlight": {
                    "fields": {
                        "body": {"fragment_size": 150, "number_of_fragments": 3},
                        "content": {"fragment_size": 150, "number_of_fragments": 3}
                    }
                }
            }
        )
        return resp
    except ApiError as e:
        return {"error": "api_error", "details": str(e)}
    except Exception as e:
        return {"error": "unexpected_error", "details": str(e)}


def hybrid_search(
    query: str,
    query_vector: Optional[list[float]] = None,
    size: int = 10,
    filters: Optional[Dict[str, Any]] = None,
    index_name: Optional[str] = None,
    use_rrf: bool = False
) -> Dict[str, Any]:
    """
    HYBRID SEARCH: Combines BM25 keyword search with vector semantic search.
    Uses kNN + text query combination (or RRF if supported).
    
    This is the core feature for the Elastic hackathon challenge!
    
    Args:
        query: User's search query text
        query_vector: Query embedding vector (768 dims for Gemini)
        size: Number of results to return
        filters: Optional filters (region, year, organization, etc.)
        index_name: Elasticsearch index name
        use_rrf: Whether to use RRF (True) or kNN approach (False, default)
    
    Returns:
        Elasticsearch response with merged results
    """
    client = get_client()
    index = index_name or settings.ELASTICSEARCH_INDEX_NAME
    filters = filters or {}
    
    try:
        # Build filter clause
        filter_clause: list[Dict[str, Any]] = []
        
        def add_terms(field: str, values: Any):
            if isinstance(values, list) and values:
                filter_clause.append({"terms": {field: values}})
        
        add_terms("region", filters.get("region"))
        add_terms("year", filters.get("year"))
        add_terms("organization", filters.get("organization"))
        add_terms("disease", filters.get("disease"))
        add_terms("tags", filters.get("tags"))
        
        # If no vector provided, fall back to text-only search
        if query_vector is None:
            text_query = {
                "bool": {
                    "must": [{
                        "multi_match": {
                            "query": query,
                            "fields": ["title^3", "disease^2.5", "section^2", "body", "content"],
                            "type": "best_fields"
                        }
                    }],
                    "filter": filter_clause
                }
            }
            
            resp = client.search(
                index=index,
                body={
                    "size": size,
                    "query": text_query,
                    "highlight": {
                        "fields": {
                            "body": {"fragment_size": 150, "number_of_fragments": 3},
                            "title": {}
                        }
                    }
                }
            )
            return resp
        
        # HYBRID SEARCH with RRF (Reciprocal Rank Fusion)
        # This combines keyword search (BM25) + semantic search (vectors)
        if use_rrf:
            # Use Elasticsearch's built-in RRF retriever (available in ES 8.9+)
            # RRF formula: score = sum(1 / (rank + k)) where k=60 by default
            resp = client.search(
                index=index,
                body={
                    "size": size,
                    "retriever": {
                        "rrf": {
                            "retrievers": [
                                {
                                    # BM25 text search retriever
                                    "standard": {
                                        "query": {
                                            "bool": {
                                                "must": [{
                                                    "multi_match": {
                                                        "query": query,
                                                        "fields": ["title^3", "disease^2.5", "section^2", "body"],
                                                        "type": "best_fields"
                                                    }
                                                }],
                                                "filter": filter_clause
                                            }
                                        }
                                    }
                                },
                                {
                                    # Vector semantic search retriever
                                    "standard": {
                                        "query": {
                                            "bool": {
                                                "must": [{
                                                    "script_score": {
                                                        "query": {"match_all": {}},
                                                        "script": {
                                                            "source": "cosineSimilarity(params.query_vector, 'body_embedding') + 1.0",
                                                            "params": {"query_vector": query_vector}
                                                        }
                                                    }
                                                }],
                                                "filter": filter_clause
                                            }
                                        }
                                    }
                                }
                            ],
                            "rank_window_size": size * 2,  # Consider more docs for ranking
                            "rank_constant": 60  # RRF k parameter
                        }
                    },
                    "highlight": {
                        "fields": {
                            "body": {"fragment_size": 150, "number_of_fragments": 3},
                            "title": {}
                        }
                    }
                }
            )
            return resp
        else:
            # Alternative: Manual combination using kNN + text query
            resp = client.search(
                index=index,
                body={
                    "size": size,
                    "query": {
                        "bool": {
                            "should": [
                                {
                                    # Text search component
                                    "multi_match": {
                                        "query": query,
                                        "fields": ["title^3", "disease^2.5", "section^2", "body"],
                                        "type": "best_fields",
                                        "boost": 1.0
                                    }
                                }
                            ],
                            "filter": filter_clause
                        }
                    },
                    "knn": {
                        "field": "body_embedding",
                        "query_vector": query_vector,
                        "k": size,
                        "num_candidates": 100,
                        "boost": 1.0
                    },
                    "highlight": {
                        "fields": {
                            "body": {"fragment_size": 150, "number_of_fragments": 3},
                            "title": {}
                        }
                    }
                }
            )
            return resp
            
    except ApiError as e:
        return {"error": "api_error", "details": str(e)}
    except Exception as e:
        return {"error": "unexpected_error", "details": str(e)}
