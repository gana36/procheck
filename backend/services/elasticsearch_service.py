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
        # Note: Serverless mode doesn't allow shard/replica settings
        body = {
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


def index_user_protocols(protocols: list[Dict[str, Any]], user_id: str, index_name: Optional[str] = None) -> Dict[str, Any]:
    """
    Index user-generated protocols into user-specific Elasticsearch index

    Args:
        protocols: List of protocol dictionaries with steps, citations, etc.
        user_id: Firebase Auth user ID
        index_name: Optional index name (defaults to user-specific index)

    Returns:
        Dict with indexing results
    """
    client = get_client()
    # Use user-specific index instead of global index
    index = index_name or get_user_index_name(user_id)
    try:
        # Ensure index exists
        ensure_result = ensure_index(index)
        if ensure_result.get("error"):
            return ensure_result

        # Prepare bulk indexing operations
        bulk_operations = []
        indexed_count = 0

        for protocol in protocols:
            try:
                # Transform protocol to Elasticsearch document format
                doc = transform_protocol_to_es_doc(protocol, user_id)

                # Add bulk index operation
                bulk_operations.extend([
                    {"index": {"_index": index, "_id": protocol.get("protocol_id")}},
                    doc
                ])
                indexed_count += 1

            except Exception as e:
                print(f"⚠️  Failed to prepare protocol {protocol.get('protocol_id', 'unknown')} for indexing: {str(e)}")
                continue

        if not bulk_operations:
            return {"success": False, "error": "No valid protocols to index", "indexed_count": 0}

        # Execute bulk indexing
        response = client.bulk(operations=bulk_operations, refresh=True)

        # Check for errors in bulk response
        errors = []
        successful_count = 0

        if response.get("errors"):
            for item in response.get("items", []):
                if "index" in item and item["index"].get("error"):
                    errors.append(item["index"]["error"])
                else:
                    successful_count += 1
        else:
            successful_count = indexed_count

        return {
            "success": True,
            "indexed_count": successful_count,
            "total_protocols": len(protocols),
            "errors": errors,
            "user_id": user_id,
            "index": index
        }

    except ApiError as e:
        return {"success": False, "error": "api_error", "details": str(e)}
    except Exception as e:
        print(f"❌ Unexpected Error: {str(e)}")
        return {"success": False, "error": "unexpected_error", "details": str(e)}


def transform_protocol_to_es_doc(protocol: Dict[str, Any], user_id: str) -> Dict[str, Any]:
    """
    Transform user protocol to Elasticsearch document format

    Args:
        protocol: Protocol dictionary from document processor
        user_id: Firebase Auth user ID

    Returns:
        Elasticsearch document
    """
    # Extract protocol information
    title = protocol.get("title", "Untitled Protocol")
    steps = protocol.get("steps", [])
    citations = protocol.get("citations", [])

    # Create content from steps for searchability
    content_parts = [title]
    step_texts = []

    for step in steps:
        step_text = step.get("text", "")
        explanation = step.get("explanation", "")
        if step_text:
            step_texts.append(step_text)
            content_parts.append(step_text)
        if explanation:
            content_parts.append(explanation)

    # Join all content for full-text search
    full_content = " ".join(content_parts)

    # Extract metadata
    source_file = ""
    if citations:
        source_file = citations[0].get("source", "")

    # Create Elasticsearch document
    es_doc = {
        # Core protocol fields
        "title": title,
        "body": full_content,
        "content": full_content,  # Legacy field for compatibility
        "section": "User Protocol",

        # User-specific fields (user_id not needed since we're in user-specific index)
        "source_type": protocol.get("source_type", "user"),
        "protocol_id": protocol.get("protocol_id"),

        # Medical metadata
        "disease": "User Defined",
        "region": protocol.get("region", "User Defined"),
        "year": int(protocol.get("created_at", "2024")[:4]) if protocol.get("created_at") else 2024,
        "organization": protocol.get("organization", "Custom Protocol"),

        # Additional metadata
        "tags": ["user-generated", protocol.get("intent", "general")],
        "source_url": f"user://{user_id}/{protocol.get('protocol_id', 'unknown')}",
        "source": source_file,
        "last_reviewed": protocol.get("created_at"),

        # Protocol-specific data
        "steps_count": len(steps),
        "citations_count": len(citations),
        "step_details": step_texts
    }

    return es_doc


def get_user_index_name(user_id: str) -> str:
    """
    Generate user-specific index name

    Args:
        user_id: Firebase Auth user ID

    Returns:
        User-specific index name (e.g., "user-abc123")
    """
    # Clean user_id to make it safe for Elasticsearch index names
    # Index names must be lowercase, no special chars except hyphens/underscores
    # Remove any non-alphanumeric characters and convert to lowercase
    import re
    safe_user_id = re.sub(r'[^a-zA-Z0-9]', '', user_id.lower())
    # Ensure it doesn't start with underscore, hyphen, or plus
    safe_user_id = safe_user_id.lstrip('_-+')
    # Limit length to avoid issues
    safe_user_id = safe_user_id[:50]
    return f"user-{safe_user_id}"


def search_user_protocols(user_id: str, query: Optional[str] = None, size: int = 10, index_name: Optional[str] = None) -> Dict[str, Any]:
    """
    Search protocols specific to a user in their dedicated index

    Args:
        user_id: Firebase Auth user ID
        query: Optional search query
        size: Number of results to return
        index_name: Optional index name

    Returns:
        Elasticsearch response with user protocols only
    """
    client = get_client()
    # Use user-specific index
    index = index_name or get_user_index_name(user_id)

    try:
        # Check if user index exists first
        if not client.indices.exists(index=index):
            return {
                "hits": {"total": {"value": 0}, "hits": []},
                "message": f"No protocols found for user {user_id}"
            }

        # Build query - no need to filter by user_id since we're in user-specific index
        if query and query.strip():
            es_query = {
                "multi_match": {
                    "query": query,
                    "fields": ["title^3", "body^2", "content", "step_details"],
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


def search_mixed_protocols(user_id: str, query: Optional[str] = None, size: int = 10, user_protocols_first: bool = True) -> Dict[str, Any]:
    """
    Search both user protocols and global protocols across separate indexes

    Args:
        user_id: Firebase Auth user ID
        query: Optional search query
        size: Number of results to return
        user_protocols_first: Whether to boost user protocols in ranking

    Returns:
        Combined results from both global and user indexes
    """
    client = get_client()
    global_index = settings.ELASTICSEARCH_INDEX_NAME
    user_index = get_user_index_name(user_id)

    try:
        # Determine how to split the results
        user_size = int(size * 0.6) if user_protocols_first else int(size * 0.4)
        global_size = size - user_size

        # Search user protocols
        user_results = search_user_protocols(user_id, query, user_size)
        user_hits = user_results.get("hits", {}).get("hits", [])

        # Search global protocols
        global_query = {
            "multi_match": {
                "query": query,
                "fields": ["title^2", "body", "content", "tags"],
                "type": "best_fields"
            }
        } if query and query.strip() else {"match_all": {}}

        global_resp = client.search(
            index=global_index,
            body={
                "size": global_size,
                "query": global_query,
                "highlight": {
                    "fields": {
                        "body": {"fragment_size": 150, "number_of_fragments": 3},
                        "title": {}
                    }
                }
            }
        )
        global_hits = global_resp.get("hits", {}).get("hits", [])

        # Combine results and sort by relevance score for better topical matching
        all_hits = []

        # Add user protocols with small score boost if user_protocols_first is True
        for hit in user_hits:
            score_boost = 0.1 if user_protocols_first else 0
            all_hits.append({
                **hit,
                "_score": hit.get("_score", 0) + score_boost,
                "_source_type": "user"
            })

        # Add global protocols
        for hit in global_hits:
            all_hits.append({
                **hit,
                "_source_type": "global"
            })

        # Sort by relevance score (highest first) for better topical coherence
        combined_hits = sorted(all_hits, key=lambda x: x.get("_score", 0), reverse=True)

        # Create combined response
        total_user = user_results.get("hits", {}).get("total", {}).get("value", 0)
        total_global = global_resp.get("hits", {}).get("total", {}).get("value", 0)

        combined_response = {
            "hits": {
                "total": {"value": total_user + total_global},
                "hits": combined_hits[:size]  # Limit to requested size
            },
            "user_protocols_count": total_user,
            "global_protocols_count": total_global
        }

        return combined_response

    except ApiError as e:
        return {"error": "api_error", "details": str(e)}
    except Exception as e:
        return {"error": "unexpected_error", "details": str(e)}
