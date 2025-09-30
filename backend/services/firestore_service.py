"""
Firestore service for ProCheck conversation storage
Handles conversation data persistence in GCP Firestore
"""

from typing import Dict, List, Any, Optional
from datetime import datetime
import json
import os
from google.cloud import firestore
from google.cloud.exceptions import GoogleCloudError
from google.oauth2 import service_account
from config.settings import settings

# Initialize Firestore client with service account credentials
def _initialize_firestore_client():
    """Initialize Firestore client with service account credentials"""
    try:
        # Get credentials path from environment variable or use default
        credentials_path = settings.GOOGLE_CLOUD_CREDENTIALS_PATH

        # Fallback to legacy cred.json location for backward compatibility
        if not credentials_path:
            current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            credentials_path = os.path.join(current_dir, "cred.json")
            if not os.path.exists(credentials_path):
                credentials_path = None

        if credentials_path and os.path.exists(credentials_path):
            credentials = service_account.Credentials.from_service_account_file(credentials_path)
            # Use the specific database name 'esting'
            client = firestore.Client(credentials=credentials, project=credentials.project_id, database='esting')
            print(f"Firestore initialized successfully with project: {credentials.project_id}, database: esting")
            return client
        else:
            error_msg = f"Error: Google Cloud credentials not found. Set GOOGLE_CLOUD_CREDENTIALS_PATH environment variable to your service account JSON file path."
            print(error_msg)
            raise Exception(error_msg)
    except Exception as e:
        print(f"Error: Firestore client initialization failed: {e}")
        raise

db = _initialize_firestore_client()

class FirestoreService:
    """Service for managing conversation data in Firestore"""

    CONVERSATIONS_COLLECTION = "conversations"

    @staticmethod
    def _get_db():
        """Get Firestore database client"""
        if db is None:
            raise Exception("Firestore client not initialized. Check your GCP credentials.")
        return db

    @staticmethod
    def save_conversation(user_id: str, conversation_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Save or update a conversation for a user

        Args:
            user_id: Firebase Auth user ID
            conversation_data: Conversation data including messages and metadata

        Returns:
            Dict with success status and conversation ID
        """
        try:
            db = FirestoreService._get_db()

            # Use provided conversation ID or generate new one
            conversation_id = conversation_data.get('id') or f"conv_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

            # Use frontend timestamp or generate fallback
            created_at = conversation_data.get('created_at') or datetime.now().isoformat()
            created_timestamp = created_at.replace(':', '').replace('-', '').replace('.', '').replace('T', '_')

            # Keep frontend timestamps as-is for consistency
            messages = conversation_data.get('messages', [])

            # Prepare conversation document
            doc_data = {
                "user_id": user_id,
                "conversation_id": conversation_id,
                "title": conversation_data.get('title', 'Untitled Conversation'),
                "messages": messages,
                "created_at": created_at,
                "updated_at": datetime.now().isoformat(),
                "protocol_data": conversation_data.get('protocol_data'),
                "metadata": {
                    "message_count": len(conversation_data.get('messages', [])),
                    "last_query": conversation_data.get('last_query', ''),
                    "tags": conversation_data.get('tags', []),
                }
            }

            # Create unique document ID: user_id + conversation_id + created_at
            doc_id = f"{user_id}_{conversation_id}_{created_timestamp}"
            doc_ref = db.collection(FirestoreService.CONVERSATIONS_COLLECTION).document(doc_id)
            doc_ref.set(doc_data)  # No merge - create new document each time

            return {
                "success": True,
                "conversation_id": conversation_id,
                "document_id": doc_id
            }

        except GoogleCloudError as e:
            return {"success": False, "error": "firestore_error", "details": str(e)}
        except Exception as e:
            return {"success": False, "error": "unexpected_error", "details": str(e)}

    @staticmethod
    def get_user_conversations(user_id: str, limit: int = 20) -> Dict[str, Any]:
        """
        Get all conversations for a user

        Args:
            user_id: Firebase Auth user ID
            limit: Maximum number of conversations to return

        Returns:
            Dict with conversations list
        """
        try:
            db = FirestoreService._get_db()

            conversations = []
            docs = (db.collection(FirestoreService.CONVERSATIONS_COLLECTION)
                   .where("user_id", "==", user_id)
                   .order_by("updated_at", direction=firestore.Query.DESCENDING)
                   .limit(limit)
                   .stream())

            for doc in docs:
                data = doc.to_dict()
                conversations.append({
                    "id": data.get("conversation_id"),
                    "title": data.get("title"),
                    "created_at": data.get("created_at"),
                    "updated_at": data.get("updated_at"),
                    "message_count": data.get("metadata", {}).get("message_count", 0),
                    "last_query": data.get("metadata", {}).get("last_query", "")
                })

            return {
                "success": True,
                "conversations": conversations,
                "total": len(conversations)
            }

        except GoogleCloudError as e:
            return {"success": False, "error": "firestore_error", "details": str(e)}
        except Exception as e:
            return {"success": False, "error": "unexpected_error", "details": str(e)}

    @staticmethod
    def get_conversation(user_id: str, conversation_id: str) -> Dict[str, Any]:
        """
        Get a specific conversation for a user

        Args:
            user_id: Firebase Auth user ID
            conversation_id: Conversation ID

        Returns:
            Dict with conversation data
        """
        try:
            db = FirestoreService._get_db()

            doc_ref = db.collection(FirestoreService.CONVERSATIONS_COLLECTION).document(f"{user_id}_{conversation_id}")
            doc = doc_ref.get()

            if not doc.exists:
                return {"success": False, "error": "not_found", "details": "Conversation not found"}

            data = doc.to_dict()
            return {
                "success": True,
                "conversation": data
            }

        except GoogleCloudError as e:
            return {"success": False, "error": "firestore_error", "details": str(e)}
        except Exception as e:
            return {"success": False, "error": "unexpected_error", "details": str(e)}

    @staticmethod
    def delete_conversation(user_id: str, conversation_id: str) -> Dict[str, Any]:
        """
        Delete a conversation for a user

        Args:
            user_id: Firebase Auth user ID
            conversation_id: Conversation ID

        Returns:
            Dict with success status
        """
        try:
            db = FirestoreService._get_db()

            doc_ref = db.collection(FirestoreService.CONVERSATIONS_COLLECTION).document(f"{user_id}_{conversation_id}")

            # Check if document exists
            if not doc_ref.get().exists:
                return {"success": False, "error": "not_found", "details": "Conversation not found"}

            doc_ref.delete()

            return {"success": True, "message": "Conversation deleted successfully"}

        except GoogleCloudError as e:
            return {"success": False, "error": "firestore_error", "details": str(e)}
        except Exception as e:
            return {"success": False, "error": "unexpected_error", "details": str(e)}

    @staticmethod
    def update_conversation_title(user_id: str, conversation_id: str, new_title: str) -> Dict[str, Any]:
        """
        Update conversation title

        Args:
            user_id: Firebase Auth user ID
            conversation_id: Conversation ID
            new_title: New title for the conversation

        Returns:
            Dict with success status
        """
        try:
            db = FirestoreService._get_db()

            doc_ref = db.collection(FirestoreService.CONVERSATIONS_COLLECTION).document(f"{user_id}_{conversation_id}")

            # Check if document exists
            if not doc_ref.get().exists:
                return {"success": False, "error": "not_found", "details": "Conversation not found"}

            doc_ref.update({
                "title": new_title,
                "updated_at": datetime.now().isoformat()
            })

            return {"success": True, "message": "Title updated successfully"}

        except GoogleCloudError as e:
            return {"success": False, "error": "firestore_error", "details": str(e)}
        except Exception as e:
            return {"success": False, "error": "unexpected_error", "details": str(e)}