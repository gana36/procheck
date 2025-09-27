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
        body = {
            "settings": {
                "number_of_shards": 1,
                "number_of_replicas": 1
            },
            "mappings": {
                "properties": {
                    "title": {"type": "text"},
                    "content": {"type": "text"},
                    "source": {"type": "keyword"},
                    "year": {"type": "integer"},
                    "region": {"type": "keyword"},
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
                    "fields": ["title^2", "content", "tags", "organization", "region"],
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
