async def delete_user_protocol(user_id: str, protocol_id: str) -> bool:
    """
    Delete a specific protocol from user's Elasticsearch index

    Args:
        user_id: Firebase Auth user ID
        protocol_id: ID of the protocol to delete

    Returns:
        bool: True if protocol was deleted, False if not found
    """
    try:
        from .elasticsearch_service import get_client, get_user_index_name
        from elasticsearch.exceptions import ApiError

        client = get_client()
        user_index = get_user_index_name(user_id)

        # Delete protocol by ID
        response = client.delete(
            index=user_index,
            id=protocol_id,
            ignore=[404]  # Don't error if document doesn't exist
        )

        # Check if document was deleted
        if response.get('result') == 'deleted':
            print(f"✅ Protocol {protocol_id} deleted from user index {user_index}")
            return True
        elif response.get('result') == 'not_found':
            print(f"⚠️ Protocol {protocol_id} not found in user index {user_index}")
            return False
        else:
            print(f"⚠️ Unexpected delete response: {response}")
            return False

    except ApiError as e:
        print(f"❌ Elasticsearch API error deleting protocol {protocol_id}: {str(e)}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error deleting protocol {protocol_id}: {str(e)}")
        return False


async def update_user_protocol_title(user_id: str, protocol_id: str, new_title: str) -> bool:
    """
    Update the title of a specific protocol in user's Elasticsearch index

    Args:
        user_id: Firebase Auth user ID
        protocol_id: ID of the protocol to update
        new_title: New title for the protocol

    Returns:
        bool: True if protocol was updated, False if not found
    """
    try:
        from .elasticsearch_service import get_client, get_user_index_name
        from elasticsearch.exceptions import ApiError

        client = get_client()
        user_index = get_user_index_name(user_id)

        # Update protocol title using partial update
        response = client.update(
            index=user_index,
            id=protocol_id,
            body={
                "doc": {
                    "title": new_title
                }
            },
            ignore=[404]  # Don't error if document doesn't exist
        )

        # Check if document was updated
        if response.get('result') in ['updated', 'noop']:
            print(f"✅ Protocol {protocol_id} title updated in user index {user_index}")
            return True
        elif response.get('result') == 'not_found':
            print(f"⚠️ Protocol {protocol_id} not found in user index {user_index}")
            return False
        else:
            print(f"⚠️ Unexpected update response: {response}")
            return False

    except ApiError as e:
        print(f"❌ Elasticsearch API error updating protocol {protocol_id}: {str(e)}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error updating protocol {protocol_id}: {str(e)}")
        return False


async def delete_all_user_protocols(user_id: str) -> int:
    """
    Delete all protocols from user's Elasticsearch index

    Args:
        user_id: Firebase Auth user ID

    Returns:
        int: Number of protocols deleted
    """
    print(f"🚀 delete_all_user_protocols called for user {user_id}")
    try:
        from .elasticsearch_service import get_client, get_user_index_name
        from elasticsearch.exceptions import ApiError, NotFoundError

        client = get_client()
        user_index = get_user_index_name(user_id)
        print(f"🔍 Target user index: {user_index}")

        # First check if the index exists
        index_exists = client.indices.exists(index=user_index)
        print(f"🔍 Index exists: {index_exists}")

        if not index_exists:
            print(f"⚠️ User index {user_index} does not exist - user has no protocols to delete")
            return 0

        # Get count of documents before deletion
        count_response = client.count(index=user_index, ignore=[404])
        total_docs = count_response.get('count', 0)
        print(f"🔍 Documents found in index: {total_docs}")

        if total_docs == 0:
            print(f"⚠️ No protocols found in user index {user_index}")
            return 0

        print(f"🗑️ Attempting to delete {total_docs} documents from {user_index}")

        # Delete all documents using delete_by_query
        delete_response = client.delete_by_query(
            index=user_index,
            body={
                "query": {
                    "match_all": {}
                }
            },
            wait_for_completion=True,
            refresh=True,  # Refresh the index immediately after deletion
            ignore=[404]  # Ignore 404 errors if index doesn't exist
        )

        deleted_count = delete_response.get('deleted', 0)
        failures = delete_response.get('failures', [])

        if failures:
            print(f"⚠️ Some deletions failed: {failures}")

        print(f"✅ Successfully deleted {deleted_count} protocols from user index {user_index}")
        print(f"🔍 Full delete response: {delete_response}")

        return deleted_count

    except NotFoundError as e:
        print(f"⚠️ User index not found: {str(e)}")
        return 0
    except ApiError as e:
        print(f"❌ Elasticsearch API error deleting all protocols: {str(e)}")
        print(f"🔍 Error details: {e.info if hasattr(e, 'info') else 'No additional info'}")
        return 0
    except Exception as e:
        print(f"❌ Unexpected error deleting all protocols: {str(e)}")
        import traceback
        print(f"🔍 Full traceback: {traceback.format_exc()}")
        return 0