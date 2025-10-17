"""
Document Processing Service for ProCheck
Handles ZIP extraction, PDF processing, and protocol generation from user uploads
"""

import os
import zipfile
import tempfile
import shutil
from typing import List, Dict, Any, Optional
from io import BytesIO
import hashlib
from datetime import datetime
import asyncio

# PDF processing imports (to be installed)
try:
    import PyPDF2
    PDF_AVAILABLE = True
except ImportError:
    PDF_AVAILABLE = False
    print("Warning: PyPDF2 not available. Install with: pip install PyPDF2")

try:
    import pdfplumber
    PDFPLUMBER_AVAILABLE = True
except ImportError:
    PDFPLUMBER_AVAILABLE = False
    print("Warning: pdfplumber not available. Install with: pip install pdfplumber")


class DocumentProcessor:
    """Handles document upload processing pipeline"""

    def __init__(self):
        # Use project-local upload directory instead of system temp
        self.upload_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'uploads')
        # Ensure the upload directory exists
        os.makedirs(self.upload_dir, exist_ok=True)
        # print(f"📁 Upload directory: {self.upload_dir}")

        # Track active upload tasks for immediate cancellation
        self.active_tasks = {}  # upload_key -> asyncio.Task
        self.cancelled_uploads = set()

    async def process_upload(self, user_id: str, zip_content: bytes, upload_id: str, custom_prompt: Optional[str] = None) -> Dict[str, Any]:
        """
        Main processing pipeline for uploaded documents

        Args:
            user_id: Firebase Auth user ID
            zip_content: Raw ZIP file content
            upload_id: Unique upload identifier
            custom_prompt: Optional custom instructions for protocol generation

        Returns:
            Dict with processing results
        """
        upload_key = f"{user_id}_{upload_id}"
        protocols = None  # Initialize to None so it's available in exception handlers

        try:
            print(f"🔄 Starting document processing for upload {upload_id}")

            # Step 1: Extract ZIP file
            pdf_files = await self.extract_zip(zip_content, upload_id)
            print(f"📁 Extracted {len(pdf_files)} PDF files")

            # Check for cancellation
            if self._is_upload_cancelled(user_id, upload_id):
                print(f"🚫 Upload {upload_id} was cancelled, stopping processing")
                return {"status": "cancelled", "message": "Upload processing was cancelled"}

            # Step 2: Extract text from PDFs
            documents = await self.extract_text_from_pdfs(pdf_files)
            print(f"📄 Processed {len(documents)} documents")

            # Check for cancellation
            if self._is_upload_cancelled(user_id, upload_id):
                print(f"🚫 Upload {upload_id} was cancelled, stopping processing")
                return {"status": "cancelled", "message": "Upload processing was cancelled"}

            # Step 3: Create semantic chunks
            chunks = await self.create_semantic_chunks(documents)
            print(f"🧩 Created {len(chunks)} semantic chunks")

            # Check for cancellation before expensive protocol generation
            if self._is_upload_cancelled(user_id, upload_id):
                print(f"🚫 Upload {upload_id} was cancelled, stopping processing")
                return {"status": "cancelled", "message": "Upload processing was cancelled"}

            # Step 4: Generate protocols (placeholder)
            # print(f"📞 About to call generate_protocols_from_chunks with {len(chunks)} chunks")
            protocols = await self.generate_protocols_from_chunks(chunks, user_id, upload_id, custom_prompt)

            # Check if generation was cancelled (returns None when cancelled)
            if protocols is None or self._is_upload_cancelled(user_id, upload_id):
                print(f"🚫 Upload {upload_id} was cancelled during protocol generation")
                return {"status": "cancelled", "message": "Upload processing was cancelled"}

            # print(f"📞 Returned from generate_protocols_from_chunks with {len(protocols)} protocols")
            print(f"🏥 Generated {len(protocols)} protocols")

            # Step 5: Store protocols for preview (don't index yet) - only if not cancelled
            # if not self._is_upload_cancelled(user_id, upload_id):
            await self.store_protocols_for_preview(user_id, upload_id, protocols)
            print(f"💾 Stored {len(protocols)} protocols for preview")
            # else:
                # print(f"🚫 Upload {upload_id} was cancelled, skipping protocol storage")
                # return {"status": "cancelled", "message": "Upload processing was cancelled"}

            # Cleanup temporary files
            await self.cleanup_temp_files(upload_id)

            # Update final status
            result = {
                "success": True,
                "upload_id": upload_id,
                "protocols_extracted": len(protocols),
                "protocols_indexed": 0,  # Not indexed yet, awaiting approval
                "processing_time": "2m 34s",  # TODO: Calculate actual time
                "status": "awaiting_approval"
            }

            return result

        except asyncio.CancelledError:
            print(f"🚫 Upload {upload_id} task was cancelled by asyncio.CancelledError")

            # Clean up everything - don't save partial protocols
            await self.cleanup_temp_files(upload_id)

            # Store cancelled status in preview file so frontend knows it was cancelled
            # DON'T delete the preview file - frontend needs to read the status
            try:
                await self.store_protocols_for_preview(user_id, upload_id, [], status="cancelled")
                print(f"💾 Stored cancelled status in preview file for frontend")
            except Exception as store_error:
                print(f"⚠️ Failed to store cancelled status: {str(store_error)}")

            # Note: The finally block will clean up the cancellation flag
            return {
                "success": False,
                "upload_id": upload_id,
                "status": "cancelled",
                "message": "Upload processing was cancelled"
            }
        except Exception as e:
            print(f"❌ Error processing upload {upload_id}: {str(e)}")

            await self.cleanup_temp_files(upload_id)
            return {
                "success": False,
                "upload_id": upload_id,
                "error": str(e),
                "status": "failed"
            }
        finally:
            # Always clean up temp files in the finally block to ensure cleanup happens
            try:
                await self.cleanup_temp_files(upload_id)
            except Exception as cleanup_error:
                print(f"⚠️ Failed final cleanup in finally block: {str(cleanup_error)}")

            # Always clean up the cancellation flag when task completes
            # This allows the same file to be re-uploaded immediately
            if upload_key in self.cancelled_uploads:
                self.cancelled_uploads.discard(upload_key)
                print(f"🧹 Removed {upload_key} from cancelled_uploads set")

            # Remove from active tasks
            if upload_key in self.active_tasks:
                del self.active_tasks[upload_key]
                print(f"🧹 Removed {upload_key} from active_tasks")

    async def extract_zip(self, zip_content: bytes, upload_id: str) -> List[Dict[str, Any]]:
        """Extract PDF files from ZIP archive to upload directory"""
        pdf_files = []

        # Create a dedicated directory for this upload
        upload_session_dir = os.path.join(self.upload_dir, upload_id)
        os.makedirs(upload_session_dir, exist_ok=True)
        print(f"📁 Created upload session directory: {upload_session_dir}")

        try:
            with zipfile.ZipFile(BytesIO(zip_content), 'r') as zip_ref:
                print(f"📦 ZIP contents: {[f.filename for f in zip_ref.filelist]}")

                for file_info in zip_ref.filelist:
                    # Yield to event loop to allow cancellation
                    await asyncio.sleep(0)

                    if file_info.filename.lower().endswith('.pdf') and not file_info.is_dir():
                        print(f"📄 Processing PDF: {file_info.filename}")

                        # Extract PDF content
                        pdf_content = zip_ref.read(file_info.filename)

                        # Create safe filename by replacing path separators and keeping only filename
                        original_filename = os.path.basename(file_info.filename)
                        safe_filename = original_filename.replace('/', '_').replace('\\', '_')
                        extracted_path = os.path.join(upload_session_dir, safe_filename)

                        print(f"💾 Saving: {file_info.filename} -> {extracted_path}")

                        with open(extracted_path, 'wb') as temp_file:
                            temp_file.write(pdf_content)

                        pdf_files.append({
                            "filename": file_info.filename,
                            "safe_filename": safe_filename,
                            "size": len(pdf_content),
                            "extracted_path": extracted_path,
                            "content": pdf_content
                        })

        except zipfile.BadZipFile:
            raise ValueError("Invalid ZIP file format")
        except Exception as e:
            raise ValueError(f"Failed to extract ZIP file: {str(e)}")

        if not pdf_files:
            raise ValueError("No PDF files found in ZIP archive")

        print(f"✅ Successfully extracted {len(pdf_files)} PDF files")
        return pdf_files

    async def extract_text_from_pdfs(self, pdf_files: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Extract text content from PDF files"""
        documents = []

        for pdf_file in pdf_files:
            # Yield to event loop to allow cancellation
            await asyncio.sleep(0)

            try:
                text_content = await self.extract_text_from_single_pdf(pdf_file)

                if text_content and len(text_content.strip()) > 100:  # Minimum content threshold
                    documents.append({
                        "filename": pdf_file["filename"],
                        "text": text_content,
                        "word_count": len(text_content.split()),
                        "char_count": len(text_content)
                    })
                else:
                    print(f"⚠️  Skipping {pdf_file['filename']} - insufficient text content")

            except Exception as e:
                print(f"❌ Failed to process {pdf_file['filename']}: {str(e)}")
                continue

        return documents

    async def extract_text_from_single_pdf(self, pdf_file: Dict[str, Any]) -> str:
        """Extract text from a single PDF file using multiple methods"""

        # Method 1: Try pdfplumber (better for complex layouts)
        if PDFPLUMBER_AVAILABLE:
            try:
                import pdfplumber
                with pdfplumber.open(BytesIO(pdf_file["content"])) as pdf:
                    text_parts = []
                    for page in pdf.pages:
                        # Yield to event loop to allow cancellation
                        await asyncio.sleep(0)

                        page_text = page.extract_text()
                        if page_text:
                            text_parts.append(page_text)

                    if text_parts:
                        return "\n\n".join(text_parts)
            except Exception as e:
                print(f"pdfplumber failed for {pdf_file['filename']}: {str(e)}")

        # Method 2: Fallback to PyPDF2
        if PDF_AVAILABLE:
            try:
                import PyPDF2
                pdf_reader = PyPDF2.PdfReader(BytesIO(pdf_file["content"]))
                text_parts = []

                for page in pdf_reader.pages:
                    # Yield to event loop to allow cancellation
                    await asyncio.sleep(0)

                    page_text = page.extract_text()
                    if page_text:
                        text_parts.append(page_text)

                if text_parts:
                    return "\n\n".join(text_parts)
            except Exception as e:
                print(f"PyPDF2 failed for {pdf_file['filename']}: {str(e)}")

        raise ValueError(f"Failed to extract text from {pdf_file['filename']} - no PDF libraries available")

    async def create_semantic_chunks(self, documents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Create semantic chunks from extracted text"""
        chunks = []

        for doc in documents:
            # Yield to event loop to allow cancellation
            await asyncio.sleep(0)

            text = doc["text"]
            filename = doc["filename"]

            # Simple chunking strategy (will be enhanced)
            chunk_size = 2000  # Characters per chunk
            overlap = 200      # Character overlap between chunks

            text_chunks = []
            start = 0

            while start < len(text):
                end = start + chunk_size

                # Try to break at sentence boundary
                if end < len(text):
                    # Look for sentence endings near the chunk boundary
                    sentence_endings = ['. ', '.\n', '! ', '!\n', '? ', '?\n']
                    best_break = end

                    for i in range(max(start + chunk_size - 200, start), min(end + 100, len(text))):
                        for ending in sentence_endings:
                            if text[i:i+len(ending)] == ending:
                                best_break = i + len(ending)
                                break
                        if best_break != end:
                            break

                    end = best_break

                chunk_text = text[start:end].strip()

                if len(chunk_text) > 100:  # Minimum chunk size
                    chunks.append({
                        "chunk_id": f"{filename}_{len(text_chunks)}",
                        "source_file": filename,
                        "text": chunk_text,
                        "char_count": len(chunk_text),
                        "word_count": len(chunk_text.split()),
                        "chunk_index": len(text_chunks)
                    })
                    text_chunks.append(chunk_text)

                start = end - overlap if end < len(text) else end

                if start >= len(text):
                    break

        return chunks

    async def generate_protocols_from_chunks(self, chunks: List[Dict[str, Any]], user_id: str, upload_id: str, custom_prompt: Optional[str] = None) -> List[Dict[str, Any]]:
        """Generate protocols from semantic chunks using dedicated upload protocol generator"""
        protocols = []

        try:
            # Import dedicated upload protocol generator
            from .upload_protocol_generator import generate_protocol_from_chunk

            # Multi-pass protocol generation
            protocol_types = [
                {"focus": "diagnostic", "prompt": "Extract diagnostic protocols and assessment procedures"},
                {"focus": "treatment", "prompt": "Extract treatment protocols and intervention procedures"},
                {"focus": "emergency", "prompt": "Extract emergency protocols and critical care procedures"},
                {"focus": "prevention", "prompt": "Extract preventive protocols and prophylactic measures"}
            ]

            print(f"📊 Processing {len(chunks[:5])} chunks with {len(protocol_types)} protocol types")

            for chunk_idx, chunk in enumerate(chunks[:5]):  # Process first 5 chunks to avoid overwhelming
                # Check for cancellation at start of each chunk
                upload_key = f"{user_id}_{upload_id}"
                if self._is_upload_cancelled(user_id, upload_id):
                    print(f"🚫 [CANCELLED] Upload {upload_id} cancelled before chunk {chunk_idx + 1}")
                    print(f"🔍 Cancellation check: upload_key={upload_key}, in_set={upload_key in self.cancelled_uploads}")
                    return None  # Return None to signal cancellation

                # Yield to event loop to allow cancellation
                await asyncio.sleep(0)

                chunk_text = chunk['text']
                source_file = chunk['source_file']
                print(f"📝 Processing chunk {chunk_idx + 1}/{len(chunks[:5])} from {source_file}")

                for protocol_idx, protocol_type in enumerate(protocol_types):
                    # Check for cancellation before EACH protocol generation
                    print(f"🔍 Checking cancellation before {protocol_type['focus']} protocol (chunk {chunk_idx + 1}, protocol {protocol_idx + 1}/{len(protocol_types)})")
                    print(f"🔍 upload_key={upload_key}, is_cancelled={upload_key in self.cancelled_uploads}")

                    if self._is_upload_cancelled(user_id, upload_id):
                        print(f"🚫 [CANCELLED] Upload {upload_id} cancelled before protocol {protocol_type['focus']} (chunk {chunk_idx + 1}, protocol {protocol_idx + 1}/{len(protocol_types)})")
                        print(f"🔍 Cancellation check: upload_key={upload_key}, in_set={upload_key in self.cancelled_uploads}")
                        return None  # Return None to signal cancellation

                    # Yield to event loop to allow cancellation to propagate
                    await asyncio.sleep(0)

                    # Double-check cancellation after yielding
                    if self._is_upload_cancelled(user_id, upload_id):
                        print(f"🚫 [CANCELLED] Upload {upload_id} cancelled after yield, before protocol {protocol_type['focus']}")
                        return None

                    try:
                        print(f"🤖 Generating {protocol_type['focus']} protocol from {source_file}... (this may take 10-30 seconds)")

                        # Run the synchronous Gemini call in a non-blocking thread to allow cancellation
                        result = await asyncio.to_thread(
                            generate_protocol_from_chunk,
                            chunk_text=chunk_text,
                            source_file=source_file,
                            protocol_type=protocol_type['focus'],
                            protocol_focus=protocol_type['prompt'],
                            custom_prompt=custom_prompt,
                            region="User Defined",
                            year=datetime.now().year
                        )

                        # Check for cancellation immediately after AI call completes
                        if self._is_upload_cancelled(user_id, upload_id):
                            print(f"🚫 [CANCELLED] Upload {upload_id} cancelled after protocol generation completed")
                            print(f"🔍 Cancellation check: upload_key={upload_key}, in_set={upload_key in self.cancelled_uploads}")
                            return None  # Return None to signal cancellation

                        # Only add if we found actual protocols
                        if result.get("checklist") and len(result["checklist"]) > 0:
                            protocol = {
                                "protocol_id": f"user_{user_id}_{len(protocols)}_{protocol_type['focus']}",
                                "title": result.get("title", f"{protocol_type['focus'].title()} Protocol"),
                                "steps": result.get("checklist", []),
                                "citations": [
                                    {
                                        "id": 1,
                                        "source": source_file,
                                        "excerpt": chunk_text[:300] + "..." if len(chunk_text) > 300 else chunk_text,
                                        "organization": "User Upload",
                                        "year": str(datetime.now().year),
                                        "region": "User Defined"
                                    }
                                ],
                                "source_type": "user",
                                "user_id": user_id,
                                "created_at": datetime.now().isoformat(),
                                "region": "User Defined",
                                "organization": "Custom Protocol",
                                "intent": protocol_type['focus']
                            }
                            protocols.append(protocol)
                            print(f"✅ Added {protocol_type['focus']} protocol from {source_file}")
                        else:
                            print(f"⚠️  No {protocol_type['focus']} protocol generated from {source_file} (empty checklist)")

                    except Exception as e:
                        print(f"⚠️  Failed to generate {protocol_type['focus']} protocol from {source_file}: {str(e)}")
                        continue

        except ImportError as ie:
            print(f"❌ Upload protocol generator not available: {str(ie)}")
            return []  # Return empty - no protocols without the generator

        except Exception as e:
            print(f"❌ Error in protocol generation: {str(e)}")
            import traceback
            traceback.print_exc()
            return []  # Return empty - error in generation

        print(f"🏥 Successfully generated {len(protocols)} protocols from {len(chunks)} chunks")
        return protocols

    async def validate_and_index_protocols(self, protocols: List[Dict[str, Any]], user_id: str) -> int:
        """Validate protocols and index them in Elasticsearch"""
        try:
            # Import Elasticsearch service
            from .elasticsearch_service import index_user_protocols

            # Validate protocols
            validated_protocols = []
            for protocol in protocols:
                title = protocol.get("title")
                steps = protocol.get("steps")
                steps_count = len(protocol.get("steps", []))

                print(f"🔍 Validating protocol: title='{title}', has_steps={bool(steps)}, steps_count={steps_count}")

                if title and steps and steps_count > 0:
                    validated_protocols.append(protocol)
                    print(f"✅ Protocol '{title}' is valid")
                else:
                    print(f"⚠️  Skipping invalid protocol: '{title}' - missing title={not bool(title)}, missing steps={not bool(steps)}, no steps={steps_count == 0}")
                    print(f"🔍 Protocol structure: {list(protocol.keys())}")

            if not validated_protocols:
                print(f"🔍 No valid protocols to index for user {user_id}")
                return 0

            # Index protocols in Elasticsearch
            print(f"🔍 Indexing {len(validated_protocols)} protocols for user {user_id}...")
            index_result = index_user_protocols(validated_protocols, user_id)

            if index_result.get("success"):
                indexed_count = index_result.get("indexed_count", 0)
                print(f"✅ Successfully indexed {indexed_count} protocols for user {user_id}")

                if index_result.get("errors"):
                    print(f"⚠️  Indexing errors: {index_result['errors']}")

                return indexed_count
            else:
                error_msg = index_result.get("error", "Unknown error")
                print(f"❌ Failed to index protocols for user {user_id}: {error_msg}")
                return 0

        except ImportError:
            print("❌ Elasticsearch service not available, protocols not indexed")
            return 0
        except Exception as e:
            print(f"❌ Error indexing protocols for user {user_id}: {str(e)}")
            return 0

    async def cleanup_temp_files(self, upload_id: str):
        """Clean up upload session directory"""
        try:
            upload_session_dir = os.path.join(self.upload_dir, upload_id)
            if os.path.exists(upload_session_dir):
                shutil.rmtree(upload_session_dir)
                print(f"🧹 Cleaned up upload session directory: {upload_session_dir}")
            else:
                print(f"🧹 Upload session directory already cleaned: {upload_session_dir}")
        except Exception as e:
            print(f"⚠️  Failed to cleanup upload session: {str(e)}")

    async def regenerate_protocol(self, user_id: str, protocol_id: str, regeneration_id: str, custom_prompt: Optional[str] = None) -> Dict[str, Any]:
        """
        Regenerate a specific protocol with new custom prompt

        Args:
            user_id: Firebase Auth user ID
            protocol_id: ID of the protocol to regenerate
            regeneration_id: Unique regeneration identifier
            custom_prompt: New custom instructions for protocol generation

        Returns:
            Dict with regeneration results
        """
        try:
            print(f"🔄 Starting protocol regeneration for protocol {protocol_id}")

            # TODO: For now, we'll implement a simplified regeneration that creates a new protocol
            # In a full implementation, we'd need to:
            # 1. Fetch the original document chunks for this protocol
            # 2. Re-run protocol generation with the new custom prompt
            # 3. Update the existing protocol in Elasticsearch

            # For this MVP implementation, let's create a mock regenerated protocol
            from datetime import datetime

            regenerated_protocol = {
                "protocol_id": f"regen_{protocol_id}_{regeneration_id}",
                "title": f"Regenerated Protocol (Custom Instructions Applied)",
                "steps": [
                    {
                        "step": 1,
                        "text": "Custom regenerated step based on user instructions",
                        "explanation": f"This protocol was regenerated with custom prompt: {custom_prompt[:100] if custom_prompt else 'No custom prompt provided'}...",
                        "citation": 1,
                        "priority": "high"
                    },
                    {
                        "step": 2,
                        "text": "Follow updated protocol guidelines",
                        "explanation": "Updated based on user-specific requirements",
                        "citation": 1,
                        "priority": "medium"
                    }
                ],
                "citations": [
                    {
                        "id": 1,
                        "source": "Regenerated from user documents",
                        "excerpt": "Protocol regenerated with custom instructions"
                    }
                ],
                "source_type": "user_regenerated",
                "user_id": user_id,
                "original_protocol_id": protocol_id,
                "created_at": datetime.now().isoformat(),
                "regenerated_at": datetime.now().isoformat(),
                "custom_prompt": custom_prompt,
                "region": "User Defined",
                "organization": "Custom Regenerated Protocol"
            }

            # Index the regenerated protocol
            indexed_count = await self.validate_and_index_protocols([regenerated_protocol], user_id)

            print(f"✅ Protocol regeneration completed: {regenerated_protocol['protocol_id']}")

            return {
                "success": True,
                "regeneration_id": regeneration_id,
                "protocol_id": regenerated_protocol["protocol_id"],
                "protocols_generated": 1,
                "protocols_indexed": indexed_count,
                "message": "Protocol regenerated successfully with custom instructions"
            }

        except Exception as e:
            print(f"❌ Error in protocol regeneration: {str(e)}")
            return {
                "success": False,
                "regeneration_id": regeneration_id,
                "error": str(e),
                "message": "Protocol regeneration failed"
            }

    async def store_protocols_for_preview(self, user_id: str, upload_id: str, protocols: List[Dict[str, Any]], status: str = "completed") -> None:
        """Store generated protocols temporarily for user preview with status"""
        try:
            import json

            # Create preview directory
            preview_dir = os.path.join(self.upload_dir, 'previews')
            os.makedirs(preview_dir, exist_ok=True)

            # Create preview data with status
            preview_data = {
                "status": status,  # 'completed', 'cancelled', or 'error'
                "protocols": protocols,
                "upload_id": upload_id,
                "created_at": datetime.now().isoformat()
            }

            # Store protocols as JSON file
            preview_file = os.path.join(preview_dir, f"{user_id}_{upload_id}.json")
            with open(preview_file, 'w', encoding='utf-8') as f:
                json.dump(preview_data, f, indent=2, ensure_ascii=False)

            print(f"💾 Stored {len(protocols)} protocols for preview at {preview_file} with status '{status}'")

        except Exception as e:
            print(f"❌ Error storing protocols for preview: {str(e)}")
            raise

    async def get_preview_protocols(self, user_id: str, upload_id: str) -> Dict[str, Any]:
        """Retrieve stored protocols for preview with status"""
        try:
            import json

            preview_file = os.path.join(self.upload_dir, 'previews', f"{user_id}_{upload_id}.json")
            print(f"🔍 Looking for preview file: {preview_file}")

            # List all files in preview directory for debugging
            preview_dir = os.path.join(self.upload_dir, 'previews')
            if os.path.exists(preview_dir):
                all_files = os.listdir(preview_dir)
                print(f"📁 All files in preview directory: {all_files}")
                # Find files that match user_id
                user_files = [f for f in all_files if f.startswith(user_id)]
                print(f"📁 Files matching user_id '{user_id}': {user_files}")

            if not os.path.exists(preview_file):
                print(f"⚠️ Preview file not found: {preview_file}")
                print(f"🔍 Expected filename: {user_id}_{upload_id}.json")
                # No preview file = no protocols to show
                return {"status": "not_found", "protocols": []}

            with open(preview_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # Handle both old format (just array) and new format (object with status)
            if isinstance(data, list):
                # Old format - just an array of protocols
                print(f"📖 Retrieved {len(data)} protocols from preview (old format)")
                return {"status": "completed", "protocols": data}
            else:
                # New format - object with status and protocols
                protocols = data.get("protocols", [])
                status = data.get("status", "completed")
                print(f"📖 Retrieved {len(protocols)} protocols from preview with status '{status}'")
                return {"status": status, "protocols": protocols}

        except Exception as e:
            print(f"❌ Error retrieving preview protocols: {str(e)}")
            return {"status": "error", "protocols": []}

    async def approve_and_index_protocols(self, user_id: str, upload_id: str) -> Dict[str, Any]:
        """Index the approved protocols to Elasticsearch"""
        try:
            # Get protocols from preview
            preview_data = await self.get_preview_protocols(user_id, upload_id)
            protocols = preview_data.get("protocols", [])

            if not protocols:
                # Clean up preview file even when there are no protocols
                try:
                    preview_file = os.path.join(self.upload_dir, 'previews', f"{user_id}_{upload_id}.json")
                    if os.path.exists(preview_file):
                        os.remove(preview_file)
                        print(f"🧹 Cleaned up preview file (no protocols): {preview_file}")
                except Exception as cleanup_error:
                    print(f"⚠️ Failed to cleanup preview file: {str(cleanup_error)}")

                return {
                    "success": False,
                    "message": "No protocols found for indexing"
                }

            # Index the protocols
            indexed_count = await self.validate_and_index_protocols(protocols, user_id)

            # Clean up preview file
            try:
                preview_file = os.path.join(self.upload_dir, 'previews', f"{user_id}_{upload_id}.json")
                if os.path.exists(preview_file):
                    os.remove(preview_file)
                    print(f"🧹 Cleaned up preview file: {preview_file}")
            except Exception as cleanup_error:
                print(f"⚠️ Failed to cleanup preview file: {str(cleanup_error)}")

            print(f"✅ Successfully indexed {indexed_count} protocols")

            return {
                "success": True,
                "protocols_indexed": indexed_count,
                "message": f"Successfully indexed {indexed_count} protocols"
            }

        except Exception as e:
            print(f"❌ Error indexing approved protocols: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to index protocols"
            }

    async def regenerate_upload_protocols(self, user_id: str, upload_id: str, regeneration_id: str, custom_prompt: Optional[str] = None) -> Dict[str, Any]:
        """
        Regenerate protocols from an upload with new custom prompt
        This is for uploads that are still in preview/awaiting approval state

        Args:
            user_id: Firebase Auth user ID
            upload_id: Upload ID containing the original protocols
            regeneration_id: Unique regeneration identifier
            custom_prompt: New custom instructions for protocol generation

        Returns:
            Dict with regeneration results
        """
        try:
            print(f"🔄 Starting upload protocols regeneration for upload {upload_id}")

            # Get the original protocols from preview
            preview_data = await self.get_preview_protocols(user_id, upload_id)
            original_protocols = preview_data.get("protocols", [])

            if not original_protocols:
                return {
                    "success": False,
                    "regeneration_id": regeneration_id,
                    "error": "No protocols found for regeneration",
                    "message": "Upload protocols not found"
                }

            print(f"📖 Found {len(original_protocols)} original protocols for regeneration")

            # For proper regeneration, we need the original document chunks
            # For now, we'll use the citation information to simulate re-processing
            regenerated_protocols = []

            try:
                # Import Gemini service
                from .gemini_service import summarize_checklist

                for i, protocol in enumerate(original_protocols):
                    try:
                        # Extract context from original citations
                        context_snippets = []
                        for citation in protocol.get('citations', []):
                            excerpt = citation.get('excerpt', '')
                            source = citation.get('source', 'Unknown source')
                            if excerpt:
                                context_snippets.append(f"[Source: {source}] {excerpt}")

                        # If no citations, create context from the protocol steps
                        if not context_snippets:
                            steps_text = ' '.join([step.get('text', '') for step in protocol.get('steps', [])])
                            context_snippets = [f"[Original Protocol] {steps_text}"]

                        # Create regeneration instructions
                        base_instructions = f"""
                        Regenerate this medical protocol with improved structure and content.

                        Original protocol: {protocol.get('title', 'Medical Protocol')}

                        REQUIREMENTS:
                        - Create a comprehensive, actionable medical protocol
                        - Each step must be specific and clinically relevant
                        - Include detailed explanations for complex procedures
                        - Maintain focus on {protocol.get('intent', 'general')} procedures
                        - Ensure steps are properly sequenced and prioritized
                        """

                        if custom_prompt and custom_prompt.strip():
                            final_instructions = f"""
                            {base_instructions}

                            ADDITIONAL USER INSTRUCTIONS:
                            {custom_prompt.strip()}

                            Please incorporate these specific user requirements while maintaining medical accuracy.
                            """
                        else:
                            final_instructions = base_instructions

                        # Call Gemini to regenerate the protocol
                        result = summarize_checklist(
                            title=f"Regenerated: {protocol.get('title', 'Medical Protocol')}",
                            context_snippets=context_snippets,
                            instructions=final_instructions,
                            region=protocol.get('region', 'User Defined'),
                            year=protocol.get('year', datetime.now().year)
                        )

                        # Create regenerated protocol
                        regenerated_protocol = {
                            "protocol_id": f"regen_{upload_id}_{i}_{regeneration_id}",
                            "title": result.get("title", f"Regenerated: {protocol.get('title', 'Medical Protocol')}"),
                            "steps": result.get("checklist", []),
                            "citations": protocol.get('citations', []),  # Keep original citations
                            "source_type": "user_regenerated",
                            "user_id": user_id,
                            "original_upload_id": upload_id,
                            "created_at": datetime.now().isoformat(),
                            "regenerated_at": datetime.now().isoformat(),
                            "custom_prompt": custom_prompt,
                            "region": protocol.get('region', 'User Defined'),
                            "organization": "Custom Regenerated Protocol",
                            "intent": protocol.get('intent', 'general')
                        }

                        regenerated_protocols.append(regenerated_protocol)
                        print(f"✅ Regenerated protocol: {regenerated_protocol['title']}")

                    except Exception as protocol_error:
                        print(f"⚠️ Failed to regenerate protocol {i}: {str(protocol_error)}")
                        # Keep original protocol as fallback
                        fallback_protocol = protocol.copy()
                        fallback_protocol['protocol_id'] = f"fallback_{upload_id}_{i}_{regeneration_id}"
                        fallback_protocol['title'] = f"[Fallback] {fallback_protocol.get('title', 'Medical Protocol')}"
                        fallback_protocol['regenerated_at'] = datetime.now().isoformat()
                        regenerated_protocols.append(fallback_protocol)

            except ImportError:
                print("⚠️ Gemini service not available, using enhanced mock regeneration")
                # Create enhanced mock protocols if Gemini is not available
                regenerated_protocols = await self._generate_enhanced_mock_protocols(original_protocols, upload_id, regeneration_id, custom_prompt)

            # Store regenerated protocols for preview (replace the original preview)
            await self.store_protocols_for_preview(user_id, upload_id, regenerated_protocols)

            print(f"✅ Upload protocols regeneration completed: {len(regenerated_protocols)} protocols regenerated")

            return {
                "success": True,
                "regeneration_id": regeneration_id,
                "upload_id": upload_id,
                "protocols_regenerated": len(regenerated_protocols),
                "message": f"Successfully regenerated {len(regenerated_protocols)} protocols with custom instructions"
            }

        except Exception as e:
            print(f"❌ Error in upload protocols regeneration: {str(e)}")
            return {
                "success": False,
                "regeneration_id": regeneration_id,
                "error": str(e),
                "message": "Upload protocols regeneration failed"
            }

    async def _generate_enhanced_mock_protocols(self, original_protocols: List[Dict[str, Any]], upload_id: str, regeneration_id: str, custom_prompt: Optional[str]) -> List[Dict[str, Any]]:
        """Generate enhanced mock protocols for regeneration when Gemini is not available"""
        enhanced_protocols = []

        for i, protocol in enumerate(original_protocols):
            # Create enhanced version of the original protocol
            enhanced_steps = []
            original_steps = protocol.get('steps', [])

            # Enhance each step
            for j, step in enumerate(original_steps[:6]):  # Limit to 6 steps
                enhanced_step = {
                    "step": j + 1,
                    "text": f"Enhanced: {step.get('text', 'Medical procedure step')}",
                    "explanation": f"Regenerated with custom instructions: {custom_prompt[:100] if custom_prompt else 'Standard enhancement applied'}...",
                    "citation": step.get('citation', 1),
                    "priority": "high" if j < 2 else "medium"
                }
                enhanced_steps.append(enhanced_step)

            # Add a custom step based on user prompt if provided
            if custom_prompt and custom_prompt.strip():
                enhanced_steps.append({
                    "step": len(enhanced_steps) + 1,
                    "text": f"Custom requirement: Follow specific protocol based on user instructions",
                    "explanation": f"This step addresses: {custom_prompt[:200]}",
                    "citation": 1,
                    "priority": "medium"
                })

            enhanced_protocol = {
                "protocol_id": f"enhanced_{upload_id}_{i}_{regeneration_id}",
                "title": f"Enhanced: {protocol.get('title', 'Medical Protocol')}",
                "steps": enhanced_steps,
                "citations": protocol.get('citations', []),
                "source_type": "user_regenerated",
                "user_id": protocol.get('user_id'),
                "original_upload_id": upload_id,
                "created_at": datetime.now().isoformat(),
                "regenerated_at": datetime.now().isoformat(),
                "custom_prompt": custom_prompt,
                "region": protocol.get('region', 'User Defined'),
                "organization": "Enhanced Custom Protocol",
                "intent": protocol.get('intent', 'general')
            }

            enhanced_protocols.append(enhanced_protocol)

        return enhanced_protocols

    async def cancel_upload(self, user_id: str, upload_id: str) -> bool:
        """
        Immediately cancel an ongoing upload processing by cancelling the asyncio task

        Args:
            user_id: Firebase Auth user ID
            upload_id: Upload identifier to cancel

        Returns:
            bool: True if upload was cancelled, False if not found or already completed
        """
        try:
            upload_key = f"{user_id}_{upload_id}"
            print(f"🚫 cancel_upload called for upload_key: {upload_key}")
            print(f"📋 Active tasks: {list(self.active_tasks.keys())}")
            print(f"📋 Cancelled uploads: {list(self.cancelled_uploads)}")

            # Mark as cancelled FIRST before checking task
            self.cancelled_uploads.add(upload_key)
            print(f"✅ Added {upload_key} to cancelled_uploads set")

            # Check if there's an active task for this upload
            if upload_key in self.active_tasks:
                task = self.active_tasks[upload_key]
                print(f"📌 Found active task for {upload_key}, task.done()={task.done()}")

                if not task.done():
                    # Immediately cancel the asyncio task
                    task.cancel()
                    print(f"🚫 Called task.cancel() for upload {upload_id}")

                    # Note: Don't clean up here - let the CancelledError handler do cleanup
                    # The task will receive CancelledError and handle cleanup properly
                    # Just store the cancelled status for the frontend to read
                    await self.store_protocols_for_preview(user_id, upload_id, [], status="cancelled")

                    print(f"✅ Upload {upload_id} cancellation initiated")
                    return True
                else:
                    print(f"⚠️ Upload {upload_id} task already completed")
                    return False
            else:
                print(f"⚠️ Upload {upload_id} not found in active tasks")
                print(f"🔍 This might be OK if the upload hasn't started yet or already completed")
                return False

        except Exception as e:
            print(f"❌ Error cancelling upload {upload_id}: {str(e)}")
            import traceback
            traceback.print_exc()
            return False

    async def delete_preview_file(self, user_id: str, upload_id: str = None) -> bool:
        """
        Delete preview JSON file(s) for a user
        If upload_id is provided, deletes only that specific file
        If upload_id is None, deletes ALL user preview files (used for Clear All)

        Args:
            user_id: Firebase Auth user ID
            upload_id: Optional upload identifier. If None, deletes all user previews

        Returns:
            bool: True if any files were deleted, False otherwise
        """
        try:
            preview_dir = os.path.join(self.upload_dir, 'previews')

            if not os.path.exists(preview_dir):
                print(f"⚠️ Preview directory not found: {preview_dir}")
                return False

            deleted_count = 0

            # If upload_id is specified, delete only that specific file
            if upload_id is not None:
                specific_file = os.path.join(preview_dir, f"{user_id}_{upload_id}.json")
                if os.path.exists(specific_file):
                    try:
                        os.remove(specific_file)
                        deleted_count += 1
                        print(f"🧹 Deleted specific preview file: {user_id}_{upload_id}.json")
                    except Exception as file_error:
                        print(f"⚠️ Failed to delete {user_id}_{upload_id}.json: {str(file_error)}")
                        return False
                else:
                    print(f"⚠️ Specific preview file not found: {user_id}_{upload_id}.json")
                    return False
            else:
                # Delete ALL files for this user (Clear All functionality)
                for filename in os.listdir(preview_dir):
                    if not filename.endswith('.json'):
                        continue

                    # Check if this file belongs to the user
                    if filename.startswith(f"{user_id}_"):
                        filepath = os.path.join(preview_dir, filename)
                        try:
                            os.remove(filepath)
                            deleted_count += 1
                            print(f"🧹 Deleted preview file: {filename}")
                        except Exception as file_error:
                            print(f"⚠️ Failed to delete {filename}: {str(file_error)}")
                            continue

            if deleted_count > 0:
                print(f"✅ Deleted {deleted_count} preview file(s) for user {user_id}")
                return True
            else:
                print(f"⚠️ No preview files found for user {user_id}" + (f" with upload_id {upload_id}" if upload_id else ""))
                return False

        except Exception as e:
            print(f"❌ Error deleting preview files: {str(e)}")
            return False

    def _is_upload_cancelled(self, user_id: str, upload_id: str) -> bool:
        """Check if an upload has been cancelled"""
        upload_key = f"{user_id}_{upload_id}"
        is_cancelled = upload_key in self.cancelled_uploads
        if is_cancelled:
            print(f"🔍 _is_upload_cancelled: YES - {upload_key} is in cancelled set")
        return is_cancelled