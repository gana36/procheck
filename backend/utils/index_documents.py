"""
Utility script to index medical protocol documents with embeddings.
This script reads JSON documents and indexes them in Elasticsearch with vector embeddings.
"""

import json
import sys
from typing import List, Dict, Any
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.elasticsearch_service import get_client, ensure_index
from services.embedding_service import generate_embedding
from config.settings import settings


def index_document_with_embedding(doc: Dict[str, Any], index_name: str = None) -> Dict[str, Any]:
    """
    Index a single document with its embedding.
    
    Args:
        doc: Document dictionary with fields like disease, title, body, etc.
        index_name: Elasticsearch index name
    
    Returns:
        Result dictionary with success status
    """
    client = get_client()
    index = index_name or settings.ELASTICSEARCH_INDEX_NAME
    
    try:
        # Generate embedding for the body text
        body_text = doc.get("body", "")
        if not body_text:
            print(f"Warning: Document has no body text, skipping embedding")
            embedding = None
        else:
            print(f"Generating embedding for: {doc.get('title', 'Untitled')[:50]}...")
            embedding = generate_embedding(body_text, task_type="retrieval_document")
        
        # Prepare document for indexing
        index_doc = doc.copy()
        if embedding:
            index_doc["body_embedding"] = embedding
        
        # Index the document
        response = client.index(
            index=index,
            document=index_doc
        )
        
        return {
            "success": True,
            "id": response.get("_id"),
            "title": doc.get("title", "Untitled")
        }
    
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "title": doc.get("title", "Untitled")
        }


def index_documents_from_json(file_path: str, index_name: str = None, batch_size: int = 10):
    """
    Index documents from a JSON file.
    
    Args:
        file_path: Path to JSON file (can be a single object or array of objects)
        index_name: Elasticsearch index name
        batch_size: Number of documents to process before showing progress
    
    Returns:
        Summary of indexing operation
    """
    print(f"Reading documents from: {file_path}")
    
    # Read the JSON file
    with open(file_path, 'r') as f:
        data = json.load(f)
    
    # Handle both single object and array
    if isinstance(data, dict):
        documents = [data]
    elif isinstance(data, list):
        documents = data
    else:
        raise ValueError("JSON file must contain an object or array of objects")
    
    print(f"Found {len(documents)} document(s) to index")
    
    # Ensure index exists
    print("Ensuring index exists with proper mapping...")
    ensure_result = ensure_index(index_name)
    print(f"Index status: {ensure_result}")
    
    # Index documents
    results = {
        "total": len(documents),
        "success": 0,
        "failed": 0,
        "errors": []
    }
    
    for idx, doc in enumerate(documents, 1):
        print(f"\n[{idx}/{len(documents)}] Indexing document...")
        
        result = index_document_with_embedding(doc, index_name)
        
        if result.get("success"):
            results["success"] += 1
            print(f"✓ Success: {result.get('title')}")
        else:
            results["failed"] += 1
            error_info = {
                "title": result.get("title"),
                "error": result.get("error")
            }
            results["errors"].append(error_info)
            print(f"✗ Failed: {result.get('title')} - {result.get('error')}")
        
        # Show progress
        if idx % batch_size == 0:
            print(f"\nProgress: {idx}/{len(documents)} documents processed")
            print(f"Success: {results['success']}, Failed: {results['failed']}")
    
    # Final summary
    print("\n" + "="*60)
    print("INDEXING COMPLETE")
    print("="*60)
    print(f"Total documents: {results['total']}")
    print(f"Successfully indexed: {results['success']}")
    print(f"Failed: {results['failed']}")
    
    if results["errors"]:
        print(f"\nErrors:")
        for error in results["errors"]:
            print(f"  - {error['title']}: {error['error']}")
    
    return results


def index_documents_batch(documents: List[Dict[str, Any]], index_name: str = None):
    """
    Index multiple documents that are already in memory.
    
    Args:
        documents: List of document dictionaries
        index_name: Elasticsearch index name
    
    Returns:
        Summary of indexing operation
    """
    print(f"Indexing {len(documents)} documents...")
    
    # Ensure index exists
    ensure_index(index_name)
    
    results = {
        "total": len(documents),
        "success": 0,
        "failed": 0,
        "errors": []
    }
    
    for idx, doc in enumerate(documents, 1):
        result = index_document_with_embedding(doc, index_name)
        
        if result.get("success"):
            results["success"] += 1
        else:
            results["failed"] += 1
            results["errors"].append({
                "title": result.get("title"),
                "error": result.get("error")
            })
    
    return results


if __name__ == "__main__":
    """
    Run this script from command line:
    
    python utils/index_documents.py path/to/documents.json
    
    Or from backend directory:
    python -m utils.index_documents path/to/documents.json
    """
    
    if len(sys.argv) < 2:
        print("Usage: python index_documents.py <path_to_json_file>")
        print("\nExample:")
        print("  python index_documents.py data/medical_protocols.json")
        sys.exit(1)
    
    json_file_path = sys.argv[1]
    
    # Optional: custom index name
    custom_index = sys.argv[2] if len(sys.argv) > 2 else None
    
    try:
        results = index_documents_from_json(json_file_path, custom_index)
        
        if results["failed"] > 0:
            sys.exit(1)
        
    except Exception as e:
        print(f"\n✗ Fatal error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


