"""
Firestore service for ProCheck conversation storage
Uses direct document access to avoid query limitations on Enterprise databases
"""

from typing import Dict, List, Any, Optional
from datetime import datetime
import os
import firebase_admin
from firebase_admin import credentials, firestore
from config.settings import settings

_firebase_app = None
_db_client = None
_credentials_path = None

def _get_credentials_path():
    """Get the credentials file path"""
    global _credentials_path

    if _credentials_path:
        return _credentials_path

    # Get credentials path from environment variable or use default
    credentials_path = settings.GOOGLE_CLOUD_CREDENTIALS_PATH

    # Fallback to legacy cred.json location for backward compatibility
    if not credentials_path:
        current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        credentials_path = os.path.join(current_dir, "cred.json")
        if not os.path.exists(credentials_path):
            credentials_path = None

    if not credentials_path or not os.path.exists(credentials_path):
        error_msg = (
            "Error: Google Cloud credentials not found. Set GOOGLE_CLOUD_CREDENTIALS_PATH "
            "environment variable to your service account JSON file path."
        )
        print(error_msg)
        raise Exception(error_msg)

    _credentials_path = credentials_path
    return _credentials_path

def _initialize_firebase():
    """Initialize Firebase Admin SDK and return Firestore client (lazy)."""
    global _firebase_app, _db_client

    if _db_client is not None:
        return _db_client

    try:
        credentials_path = _get_credentials_path()

        # Initialize Firebase Admin SDK
        cred = credentials.Certificate(credentials_path)
        if _firebase_app is None:
            _firebase_app = firebase_admin.initialize_app(cred)

        # Get Firestore client - prefer specific database 'esting' with fallback
        try:
            _db_client = firestore.client(app=_firebase_app, database_id='esting')
            print("Firestore initialized successfully with database: esting")
        except Exception:
            _db_client = firestore.client(app=_firebase_app)
            print("Firestore initialized successfully with default database")

        return _db_client
    except Exception as e:
        print(f"Error: Firebase initialization failed: {e}")
        raise

class FirestoreService:
    """Service for managing conversation data in Firestore using document-based operations"""

    CONVERSATIONS_COLLECTION = "conversations"
    USER_INDEX_COLLECTION = "user_conversation_index"
    SAVED_PROTOCOLS_COLLECTION = "saved_protocols"
    USER_PROTOCOLS_INDEX_COLLECTION = "user_protocols_index"

    @staticmethod
    def _get_db():
        """Get Firestore database client"""
        try:
            return _initialize_firebase()
        except Exception as e:
            raise Exception(f"Firestore client not initialized. Check your GCP credentials. Error: {e}")

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
                    "message_count": len(messages),
                    "last_query": conversation_data.get('last_query', ''),
                    "tags": conversation_data.get('tags', []),
                }
            }

            # Create unique document ID: user_id + conversation_id (without timestamp to allow updates)
            doc_id = f"{user_id}_{conversation_id}"
            doc_ref = db.collection(FirestoreService.CONVERSATIONS_COLLECTION).document(doc_id)
            doc_ref.set(doc_data)

            # Also update user index for efficient retrieval
            user_index_ref = db.collection(FirestoreService.USER_INDEX_COLLECTION).document(user_id)
            user_index_data = user_index_ref.get()

            if user_index_data.exists:
                conversations_list = user_index_data.to_dict().get('conversations', [])
            else:
                conversations_list = []

            # Add/update conversation in index
            conv_entry = {
                "conversation_id": conversation_id,
                "document_id": doc_id,
                "title": doc_data["title"],
                "created_at": created_at,
                "updated_at": doc_data["updated_at"],
                "message_count": len(messages),
                "last_query": conversation_data.get('last_query', '')
            }

            # Remove old entry if exists
            conversations_list = [c for c in conversations_list if c.get('conversation_id') != conversation_id]
            conversations_list.append(conv_entry)

            # Update index
            user_index_ref.set({'conversations': conversations_list})

            return {
                "success": True,
                "conversation_id": conversation_id,
                "document_id": doc_id
            }

        except Exception as e:
            return {"success": False, "error": "unexpected_error", "details": str(e)}

    @staticmethod
    def get_user_conversations(user_id: str, limit: int = 20) -> Dict[str, Any]:
        """
        Get all conversations for a user
        Uses user index document to avoid query limitations

        Args:
            user_id: Firebase Auth user ID
            limit: Maximum number of conversations to return

        Returns:
            Dict with conversations list
        """
        try:
            db = FirestoreService._get_db()

            # Get user index document
            user_index_ref = db.collection(FirestoreService.USER_INDEX_COLLECTION).document(user_id)
            user_index_data = user_index_ref.get()

            if not user_index_data.exists:
                return {
                    "success": True,
                    "conversations": [],
                    "total": 0
                }

            conversations_list = user_index_data.to_dict().get('conversations', [])

            # Sort by updated_at descending
            conversations_list.sort(key=lambda x: x.get("updated_at", ""), reverse=True)

            # Limit results
            conversations = conversations_list[:limit]

            # Format for response (remove document_id)
            formatted_conversations = []
            for conv in conversations:
                formatted_conversations.append({
                    "id": conv.get("conversation_id"),
                    "title": conv.get("title"),
                    "created_at": conv.get("created_at"),
                    "updated_at": conv.get("updated_at"),
                    "message_count": conv.get("message_count", 0),
                    "last_query": conv.get("last_query", "")
                })

            return {
                "success": True,
                "conversations": formatted_conversations,
                "total": len(formatted_conversations)
            }

        except Exception as e:
            return {"success": False, "error": "unexpected_error", "details": str(e)}

    @staticmethod
    def get_conversation(user_id: str, conversation_id: str) -> Dict[str, Any]:
        """
        Get a specific conversation for a user
        Uses index to find document ID

        Args:
            user_id: Firebase Auth user ID
            conversation_id: Conversation ID

        Returns:
            Dict with conversation data
        """
        try:
            db = FirestoreService._get_db()

            # Get document ID from user index
            user_index_ref = db.collection(FirestoreService.USER_INDEX_COLLECTION).document(user_id)
            user_index_data = user_index_ref.get()

            if not user_index_data.exists:
                return {"success": False, "error": "not_found", "details": "Conversation not found"}

            conversations_list = user_index_data.to_dict().get('conversations', [])
            doc_id = None

            for conv in conversations_list:
                if conv.get('conversation_id') == conversation_id:
                    doc_id = conv.get('document_id')
                    break

            if not doc_id:
                return {"success": False, "error": "not_found", "details": "Conversation not found"}

            # Get the actual conversation document
            doc_ref = db.collection(FirestoreService.CONVERSATIONS_COLLECTION).document(doc_id)
            doc = doc_ref.get()

            if not doc.exists:
                return {"success": False, "error": "not_found", "details": "Conversation not found"}

            return {
                "success": True,
                "conversation": doc.to_dict()
            }

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
            print(f"\n{'='*80}")
            print(f"🔥 FIRESTORE SERVICE - delete_conversation()")
            print(f"{'='*80}")
            print(f"📋 Input parameters:")
            print(f"   - user_id: {user_id}")
            print(f"   - conversation_id: {conversation_id}")

            db = FirestoreService._get_db()
            print(f"✅ Firestore DB client obtained")

            # Get document ID from user index
            user_index_ref = db.collection(FirestoreService.USER_INDEX_COLLECTION).document(user_id)
            print(f"\n📂 Fetching user index document:")
            print(f"   - Collection: {FirestoreService.USER_INDEX_COLLECTION}")
            print(f"   - Document ID: {user_id}")

            user_index_data = user_index_ref.get()

            if not user_index_data.exists:
                print(f"❌ User index document does not exist!")
                return {"success": False, "error": "not_found", "details": "Conversation not found"}

            conversations_list = user_index_data.to_dict().get('conversations', [])
            print(f"✅ User index found with {len(conversations_list)} conversations")
            print(f"   Conversations in index: {[c.get('conversation_id') for c in conversations_list]}")

            doc_id = None

            for conv in conversations_list:
                if conv.get('conversation_id') == conversation_id:
                    doc_id = conv.get('document_id')
                    print(f"\n🎯 Found matching conversation:")
                    print(f"   - conversation_id: {conversation_id}")
                    print(f"   - document_id: {doc_id}")
                    break

            if not doc_id:
                print(f"❌ Conversation ID '{conversation_id}' not found in user index!")
                return {"success": False, "error": "not_found", "details": "Conversation not found"}

            # Delete the conversation document
            print(f"\n🗑️  Step 1: Deleting conversation document from Firestore:")
            print(f"   - Collection: {FirestoreService.CONVERSATIONS_COLLECTION}")
            print(f"   - Document ID: {doc_id}")

            doc_ref = db.collection(FirestoreService.CONVERSATIONS_COLLECTION).document(doc_id)
            doc_ref.delete()
            print(f"✅ Conversation document deleted from Firestore")

            # Update user index (remove conversation)
            print(f"\n📝 Step 2: Updating user index (removing conversation from cache):")
            original_count = len(conversations_list)
            conversations_list = [c for c in conversations_list if c.get('conversation_id') != conversation_id]
            new_count = len(conversations_list)

            print(f"   - Original conversations count: {original_count}")
            print(f"   - New conversations count: {new_count}")
            print(f"   - Removed: {original_count - new_count} conversation(s)")
            print(f"   - Remaining conversation IDs: {[c.get('conversation_id') for c in conversations_list]}")

            user_index_ref.set({'conversations': conversations_list})
            print(f"✅ User index updated successfully")

            print(f"\n✅ Deletion completed successfully")
            print(f"{'='*80}\n")

            return {"success": True, "message": "Conversation deleted successfully"}

        except Exception as e:
            print(f"\n❌ EXCEPTION in delete_conversation:")
            print(f"   Error type: {type(e).__name__}")
            print(f"   Error message: {str(e)}")
            print(f"{'='*80}\n")
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

            # Get document ID from user index
            user_index_ref = db.collection(FirestoreService.USER_INDEX_COLLECTION).document(user_id)
            user_index_data = user_index_ref.get()

            if not user_index_data.exists:
                return {"success": False, "error": "not_found", "details": "Conversation not found"}

            conversations_list = user_index_data.to_dict().get('conversations', [])
            doc_id = None

            for conv in conversations_list:
                if conv.get('conversation_id') == conversation_id:
                    doc_id = conv.get('document_id')
                    break

            if not doc_id:
                return {"success": False, "error": "not_found", "details": "Conversation not found"}

            updated_at = datetime.now().isoformat()

            # Update the conversation document
            doc_ref = db.collection(FirestoreService.CONVERSATIONS_COLLECTION).document(doc_id)
            doc_ref.update({
                "title": new_title,
                "updated_at": updated_at
            })

            # Update user index
            for conv in conversations_list:
                if conv.get('conversation_id') == conversation_id:
                    conv['title'] = new_title
                    conv['updated_at'] = updated_at
                    break

            user_index_ref.set({'conversations': conversations_list})

            return {"success": True, "message": "Title updated successfully"}

        except Exception as e:
            return {"success": False, "error": "unexpected_error", "details": str(e)}

    # ==================== Saved Protocols Methods ====================

    @staticmethod
    def save_protocol(user_id: str, protocol_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Save/bookmark a single protocol for a user

        Args:
            user_id: Firebase Auth user ID
            protocol_data: Protocol data including title, steps, citations, etc.

        Returns:
            Dict with success status and protocol ID
        """
        try:
            db = FirestoreService._get_db()

            # Generate protocol ID from title or use provided ID
            protocol_id = protocol_data.get('id') or f"protocol_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            saved_at = datetime.now().isoformat()

            # Create document data
            doc_data = {
                "user_id": user_id,
                "protocol_id": protocol_id,
                "title": protocol_data.get('title', 'Untitled Protocol'),
                "protocol_data": protocol_data,
                "saved_at": saved_at,
                "region": protocol_data.get('region', 'Global'),
                "year": protocol_data.get('year', str(datetime.now().year)),
                "organization": protocol_data.get('organization', 'ProCheck'),
                "source_conversation_id": protocol_data.get('source_conversation_id'),  # Optional
            }

            # Create unique document ID
            doc_id = f"{user_id}_{protocol_id}"
            doc_ref = db.collection(FirestoreService.SAVED_PROTOCOLS_COLLECTION).document(doc_id)
            doc_ref.set(doc_data)

            # Also update user protocols index for efficient retrieval
            user_protocols_index_ref = db.collection(FirestoreService.USER_PROTOCOLS_INDEX_COLLECTION).document(user_id)
            user_protocols_index_data = user_protocols_index_ref.get()

            if user_protocols_index_data.exists:
                protocols_list = user_protocols_index_data.to_dict().get('protocols', [])
            else:
                protocols_list = []

            # Add/update protocol in index
            protocol_entry = {
                "protocol_id": protocol_id,
                "document_id": doc_id,
                "title": doc_data["title"],
                "saved_at": saved_at,
                "region": doc_data["region"],
                "year": doc_data["year"],
                "organization": doc_data["organization"]
            }

            # Remove old entry if exists
            protocols_list = [p for p in protocols_list if p.get('protocol_id') != protocol_id]
            protocols_list.append(protocol_entry)

            # Update index
            user_protocols_index_ref.set({'protocols': protocols_list})

            return {
                "success": True,
                "protocol_id": protocol_id,
                "document_id": doc_id
            }

        except Exception as e:
            return {"success": False, "error": "save_protocol_error", "details": str(e)}

    @staticmethod
    def get_saved_protocols(user_id: str, limit: int = 20) -> Dict[str, Any]:
        """
        Get all saved protocols for a user (metadata only, no full protocol data)
        Uses user index document to avoid query limitations

        Args:
            user_id: Firebase Auth user ID
            limit: Maximum number of protocols to return

        Returns:
            Dict with saved protocols list (metadata only)
        """
        try:
            db = FirestoreService._get_db()

            # Get user protocols index document
            user_protocols_index_ref = db.collection(FirestoreService.USER_PROTOCOLS_INDEX_COLLECTION).document(user_id)
            user_protocols_index_data = user_protocols_index_ref.get()

            if not user_protocols_index_data.exists:
                return {
                    "success": True,
                    "protocols": [],
                    "total": 0
                }

            protocols_list = user_protocols_index_data.to_dict().get('protocols', [])

            # Sort by saved_at descending
            protocols_list.sort(key=lambda x: x.get("saved_at", ""), reverse=True)

            # Limit results
            protocols = protocols_list[:limit]

            # Return only metadata from index (no full protocol data fetch)
            # This reduces from N+1 reads to just 1 read
            metadata_protocols = []
            for protocol in protocols:
                metadata_protocols.append({
                    "id": protocol.get("protocol_id"),
                    "title": protocol.get("title"),
                    "saved_at": protocol.get("saved_at"),
                    "region": protocol.get("region"),
                    "year": protocol.get("year"),
                    "organization": protocol.get("organization"),
                    "document_id": protocol.get("document_id")  # Keep for fetching later
                })

            return {
                "success": True,
                "protocols": metadata_protocols,
                "total": len(metadata_protocols)
            }

        except Exception as e:
            return {"success": False, "error": "get_protocols_error", "details": str(e)}

    @staticmethod
    def get_saved_protocol(user_id: str, protocol_id: str) -> Dict[str, Any]:
        """
        Get a single saved protocol with full data

        Args:
            user_id: Firebase Auth user ID
            protocol_id: Protocol ID

        Returns:
            Dict with full protocol data
        """
        try:
            db = FirestoreService._get_db()

            doc_id = f"{user_id}_{protocol_id}"
            doc_ref = db.collection(FirestoreService.SAVED_PROTOCOLS_COLLECTION).document(doc_id)
            doc = doc_ref.get()

            if not doc.exists:
                return {"success": False, "error": "not_found", "details": "Protocol not found"}

            data = doc.to_dict()
            return {
                "success": True,
                "protocol": {
                    "id": data.get("protocol_id"),
                    "title": data.get("title"),
                    "saved_at": data.get("saved_at"),
                    "region": data.get("region"),
                    "year": data.get("year"),
                    "organization": data.get("organization"),
                    "protocol_data": data.get("protocol_data")
                }
            }

        except Exception as e:
            return {"success": False, "error": "get_protocol_error", "details": str(e)}

    @staticmethod
    def delete_saved_protocol(user_id: str, protocol_id: str) -> Dict[str, Any]:
        """
        Delete a saved protocol

        Args:
            user_id: Firebase Auth user ID
            protocol_id: Protocol ID

        Returns:
            Dict with success status
        """
        try:
            db = FirestoreService._get_db()

            doc_id = f"{user_id}_{protocol_id}"
            doc_ref = db.collection(FirestoreService.SAVED_PROTOCOLS_COLLECTION).document(doc_id)

            # Check if exists
            if not doc_ref.get().exists:
                return {"success": False, "error": "not_found", "details": "Protocol not found"}

            # Delete the protocol document
            doc_ref.delete()

            # Update user protocols index (remove protocol)
            user_protocols_index_ref = db.collection(FirestoreService.USER_PROTOCOLS_INDEX_COLLECTION).document(user_id)
            user_protocols_index_data = user_protocols_index_ref.get()

            if user_protocols_index_data.exists:
                protocols_list = user_protocols_index_data.to_dict().get('protocols', [])
                protocols_list = [p for p in protocols_list if p.get('protocol_id') != protocol_id]
                user_protocols_index_ref.set({'protocols': protocols_list})

            return {"success": True, "message": "Protocol deleted successfully"}

        except Exception as e:
            return {"success": False, "error": "delete_protocol_error", "details": str(e)}

    @staticmethod
    def is_protocol_saved(user_id: str, protocol_id: str) -> Dict[str, Any]:
        """
        Check if a protocol is saved by the user

        Args:
            user_id: Firebase Auth user ID
            protocol_id: Protocol ID

        Returns:
            Dict with is_saved boolean
        """
        try:
            db = FirestoreService._get_db()

            doc_id = f"{user_id}_{protocol_id}"
            doc_ref = db.collection(FirestoreService.SAVED_PROTOCOLS_COLLECTION).document(doc_id)

            return {
                "success": True,
                "is_saved": doc_ref.get().exists
            }

        except Exception as e:
            return {"success": False, "error": "check_saved_error", "details": str(e)}

    @staticmethod
    def update_saved_protocol_title(user_id: str, protocol_id: str, new_title: str) -> Dict[str, Any]:
        """
        Update the title of a saved protocol

        Args:
            user_id: Firebase Auth user ID
            protocol_id: Protocol ID
            new_title: New title for the protocol

        Returns:
            Dict with success status
        """
        try:
            db = FirestoreService._get_db()

            doc_id = f"{user_id}_{protocol_id}"
            doc_ref = db.collection(FirestoreService.SAVED_PROTOCOLS_COLLECTION).document(doc_id)

            # Check if exists
            doc = doc_ref.get()
            if not doc.exists:
                return {"success": False, "error": "not_found", "details": "Protocol not found"}

            # Update the protocol document
            doc_ref.update({
                "title": new_title
            })

            # Update user protocols index
            user_protocols_index_ref = db.collection(FirestoreService.USER_PROTOCOLS_INDEX_COLLECTION).document(user_id)
            user_protocols_index_data = user_protocols_index_ref.get()

            if user_protocols_index_data.exists:
                protocols_list = user_protocols_index_data.to_dict().get('protocols', [])
                for protocol in protocols_list:
                    if protocol.get('protocol_id') == protocol_id:
                        protocol['title'] = new_title
                        break
                user_protocols_index_ref.set({'protocols': protocols_list})

            return {"success": True, "message": "Title updated successfully"}

        except Exception as e:
            return {"success": False, "error": "update_title_error", "details": str(e)}

    @staticmethod
    def delete_user_data(user_id: str) -> Dict[str, Any]:
        """
        Delete all user data from Firestore (conversations and saved protocols)

        Args:
            user_id: Firebase Auth user ID

        Returns:
            Dict with success status and details of what was deleted
        """
        try:
            db = FirestoreService._get_db()
            deleted_items = {
                "conversations": 0,
                "saved_protocols": 0,
                "user_conversations_index": False,
                "user_protocols_index": False
            }

            # Delete all conversations for the user
            user_conversations_ref = db.collection(FirestoreService.USER_INDEX_COLLECTION).document(user_id)
            user_conversations_doc = user_conversations_ref.get()

            if user_conversations_doc.exists:
                conversations_list = user_conversations_doc.to_dict().get('conversations', [])

                # Delete each conversation document
                for conversation in conversations_list:
                    conversation_id = conversation.get('id')
                    if conversation_id:
                        doc_id = f"{user_id}_{conversation_id}"
                        conversation_doc_ref = db.collection(FirestoreService.CONVERSATIONS_COLLECTION).document(doc_id)
                        conversation_doc_ref.delete()
                        deleted_items["conversations"] += 1

                # Delete user conversations index
                user_conversations_ref.delete()
                deleted_items["user_conversations_index"] = True

            # Delete all saved protocols for the user
            user_protocols_ref = db.collection(FirestoreService.USER_PROTOCOLS_INDEX_COLLECTION).document(user_id)
            user_protocols_doc = user_protocols_ref.get()

            if user_protocols_doc.exists:
                protocols_list = user_protocols_doc.to_dict().get('protocols', [])

                # Delete each saved protocol document
                for protocol in protocols_list:
                    protocol_id = protocol.get('protocol_id')
                    if protocol_id:
                        doc_id = f"{user_id}_{protocol_id}"
                        protocol_doc_ref = db.collection(FirestoreService.SAVED_PROTOCOLS_COLLECTION).document(doc_id)
                        protocol_doc_ref.delete()
                        deleted_items["saved_protocols"] += 1

                # Delete user protocols index
                user_protocols_ref.delete()
                deleted_items["user_protocols_index"] = True

            return {
                "success": True,
                "message": "All user data deleted successfully",
                "deleted_items": deleted_items
            }

        except Exception as e:
            return {"success": False, "error": "delete_user_data_error", "details": str(e)}
