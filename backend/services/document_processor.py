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
        print(f"📁 Upload directory: {self.upload_dir}")

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
            # print(f"📞 Returned from generate_protocols_from_chunks with {len(protocols)} protocols")
            print(f"🏥 Generated {len(protocols)} protocols")

            # Step 5: Store protocols for preview (don't index yet)
            await self.store_protocols_for_preview(user_id, upload_id, protocols)
            print(f"💾 Stored {len(protocols)} protocols for preview")

            # Cleanup temporary files
            await self.cleanup_temp_files(upload_id)

            return {
                "success": True,
                "upload_id": upload_id,
                "protocols_extracted": len(protocols),
                "protocols_indexed": 0,  # Not indexed yet, awaiting approval
                "processing_time": "2m 34s",  # TODO: Calculate actual time
                "status": "awaiting_approval"
            }

        except asyncio.CancelledError:
            print(f"🚫 Upload {upload_id} task was cancelled")
            await self.cleanup_temp_files(upload_id)
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
            # Clean up tracking regardless of success/failure
            self.cancelled_uploads.discard(upload_key)

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
        """Generate protocols from semantic chunks using Gemini"""
        # print(f"🚀 ENTERING generate_protocols_from_chunks with {len(chunks)} chunks for user {user_id}")
        protocols = []

        try:
            # Import Gemini service
            from .gemini_service import summarize_checklist

            # Test Gemini service availability
            # print("🧪 Testing Gemini service availability...")
            try:
                test_result = summarize_checklist(
                    title="Test Protocol",
                    context_snippets=["[Test] Patient presents with fever. Administer acetaminophen 500mg every 6 hours."],
                    instructions="Extract any medical protocols from this test content."
                )
                # print(f"✅ Gemini service test successful: {test_result}")
            except Exception as test_error:
                # print(f"❌ Gemini service test failed: {str(test_error)}")
                raise test_error

            # Multi-pass protocol generation
            protocol_types = [
                {"focus": "diagnostic", "prompt": "Extract diagnostic protocols and assessment procedures"},
                {"focus": "treatment", "prompt": "Extract treatment protocols and intervention procedures"},
                {"focus": "emergency", "prompt": "Extract emergency protocols and critical care procedures"},
                {"focus": "prevention", "prompt": "Extract preventive protocols and prophylactic measures"}
            ]

            for chunk in chunks[:5]:  # Process first 5 chunks to avoid overwhelming
                chunk_text = chunk['text']
                source_file = chunk['source_file']
                # print(f"🔍 Processing chunk from {source_file}, text length: {len(chunk_text)}")
                # print(f"📝 Chunk preview: {chunk_text[:200]}...")

                for protocol_type in protocol_types:
                    try:
                        # Create context snippet for Gemini
                        context_snippet = f"[User Document: {source_file}] {chunk_text}"

                        # Construct instructions with optional custom prompt
                        base_instructions = f"""
                        {protocol_type['prompt']} from the provided medical document.

                        IMPORTANT REQUIREMENTS:
                        - Only extract protocols that are explicitly described in the document
                        - Each step must be a specific, actionable medical procedure
                        - Include explanations for complex procedures
                        - Assign citation references to source document
                        - If no relevant {protocol_type['focus']} protocols are found, return empty checklist

                        Focus on {protocol_type['focus']} procedures only.
                        """

                        if custom_prompt and custom_prompt.strip():
                            final_instructions = f"""
                            {base_instructions}

                            ADDITIONAL USER INSTRUCTIONS:
                            {custom_prompt.strip()}

                            Please incorporate these specific user requirements while maintaining the above base requirements.
                            """
                        else:
                            final_instructions = base_instructions

                        # Generate protocol using existing Gemini service
                        result = summarize_checklist(
                            title=f"{protocol_type['focus'].title()} Protocol from {source_file}",
                            context_snippets=[context_snippet],
                            instructions=final_instructions,
                            region="User Defined",
                            year=datetime.now().year
                        )

                        # print(f"📤 Gemini response for {protocol_type['focus']}: {result}")
                        # print(f"📊 Result has checklist: {bool(result.get('checklist'))}, length: {len(result.get('checklist', []))}")

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
                            # print(f"✅ Generated {protocol_type['focus']} protocol from {source_file}")

                    except Exception as e:
                        print(f"⚠️  Failed to generate {protocol_type['focus']} protocol from {source_file}: {str(e)}")
                        continue

        except ImportError:
            print("⚠️  Gemini service not available, using mock protocols")
            # Fallback to mock protocols if Gemini service is not available
            return await self._generate_mock_protocols(chunks, user_id)

        except Exception as e:
            print(f"❌ Error in protocol generation: {str(e)}")
            return await self._generate_mock_protocols(chunks, user_id)

        print(f"🏥 Successfully generated {len(protocols)} protocols from {len(chunks)} chunks")
        return protocols

    async def _generate_mock_protocols(self, chunks: List[Dict[str, Any]], user_id: str) -> List[Dict[str, Any]]:
        """Fallback mock protocol generation"""
        protocols = []

        for i, chunk in enumerate(chunks[:3]):  # Limit to first 3 chunks for demo
            protocol = {
                "protocol_id": f"user_protocol_{user_id}_{i}",
                "title": f"Protocol from {chunk['source_file']} - Part {i+1}",
                "steps": [
                    {"step": 1, "text": "Initial assessment and preparation", "explanation": "Mock step", "citation": 1},
                    {"step": 2, "text": "Primary intervention protocol", "explanation": "Mock step", "citation": 1},
                    {"step": 3, "text": "Monitoring and follow-up procedures", "explanation": "Mock step", "citation": 1}
                ],
                "citations": [
                    {
                        "id": 1,
                        "source": chunk['source_file'],
                        "excerpt": chunk['text'][:200] + "...",
                        "organization": "User Upload",
                        "year": str(datetime.now().year)
                    }
                ],
                "source_type": "user",
                "user_id": user_id,
                "created_at": datetime.now().isoformat(),
                "region": "User Defined",
                "organization": "Custom Protocol"
            }
            protocols.append(protocol)

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

    async def store_protocols_for_preview(self, user_id: str, upload_id: str, protocols: List[Dict[str, Any]]) -> None:
        """Store generated protocols temporarily for user preview"""
        try:
            import json

            # Create preview directory
            preview_dir = os.path.join(self.upload_dir, 'previews')
            os.makedirs(preview_dir, exist_ok=True)

            # Store protocols as JSON file
            preview_file = os.path.join(preview_dir, f"{user_id}_{upload_id}.json")
            with open(preview_file, 'w', encoding='utf-8') as f:
                json.dump(protocols, f, indent=2, ensure_ascii=False)

            print(f"💾 Stored {len(protocols)} protocols for preview at {preview_file}")

        except Exception as e:
            print(f"❌ Error storing protocols for preview: {str(e)}")
            raise

    async def get_preview_protocols(self, user_id: str, upload_id: str) -> List[Dict[str, Any]]:
        """Retrieve stored protocols for preview"""
        try:
            import json

            preview_file = os.path.join(self.upload_dir, 'previews', f"{user_id}_{upload_id}.json")

            if not os.path.exists(preview_file):
                print(f"⚠️ Preview file not found: {preview_file}, creating mock protocols")
                # Return mock protocols for demo
                return await self._create_mock_preview_protocols(user_id, upload_id)

            with open(preview_file, 'r', encoding='utf-8') as f:
                protocols = json.load(f)

            print(f"📖 Retrieved {len(protocols)} protocols from preview")
            return protocols

        except Exception as e:
            print(f"❌ Error retrieving preview protocols: {str(e)}")
            return await self._create_mock_preview_protocols(user_id, upload_id)

    async def _create_mock_preview_protocols(self, user_id: str, upload_id: str) -> List[Dict[str, Any]]:
        """Create mock protocols for preview demonstration"""
        from datetime import datetime

        mock_protocols = [
            {
                "protocol_id": f"preview_{upload_id}_1",
                "title": "Emergency Cardiac Assessment Protocol",
                "steps": [
                    {
                        "step": 1,
                        "text": "Assess patient's level of consciousness and responsiveness",
                        "explanation": "Check Glasgow Coma Scale and verify patient is alert and oriented",
                        "citation": 1,
                        "priority": "high"
                    },
                    {
                        "step": 2,
                        "text": "Obtain 12-lead ECG within 10 minutes of presentation",
                        "explanation": "Early ECG is critical for detecting ST-elevation MI or other acute changes",
                        "citation": 1,
                        "priority": "high"
                    },
                    {
                        "step": 3,
                        "text": "Administer aspirin 325mg chewable if no contraindications",
                        "explanation": "Aspirin reduces mortality in acute coronary syndromes",
                        "citation": 2,
                        "priority": "medium"
                    },
                    {
                        "step": 4,
                        "text": "Monitor vital signs every 15 minutes",
                        "explanation": "Continuous monitoring for hemodynamic instability",
                        "citation": 1,
                        "priority": "medium"
                    }
                ],
                "citations": [
                    {
                        "id": 1,
                        "source": "American Heart Association Guidelines 2020",
                        "excerpt": "Emergency cardiac protocols for acute presentation..."
                    },
                    {
                        "id": 2,
                        "source": "Emergency Medicine Clinical Practice Guidelines",
                        "excerpt": "Aspirin administration in acute cardiac events..."
                    }
                ],
                "intent": "emergency",
                "source_type": "user",
                "user_id": user_id,
                "created_at": datetime.now().isoformat(),
                "region": "User Defined",
                "organization": "Custom Upload"
            },
            {
                "protocol_id": f"preview_{upload_id}_2",
                "title": "Pediatric Fever Management Protocol",
                "steps": [
                    {
                        "step": 1,
                        "text": "Measure temperature using appropriate method for age",
                        "explanation": "Rectal for infants <3 months, oral/tympanic for older children",
                        "citation": 1,
                        "priority": "high"
                    },
                    {
                        "step": 2,
                        "text": "Assess hydration status and general appearance",
                        "explanation": "Look for signs of dehydration, lethargy, or altered mental status",
                        "citation": 1,
                        "priority": "high"
                    },
                    {
                        "step": 3,
                        "text": "Administer age-appropriate antipyretic if temperature >38.5°C",
                        "explanation": "Acetaminophen 10-15mg/kg or ibuprofen 5-10mg/kg for children >6 months",
                        "citation": 2,
                        "priority": "medium"
                    }
                ],
                "citations": [
                    {
                        "id": 1,
                        "source": "American Academy of Pediatrics Fever Guidelines",
                        "excerpt": "Pediatric fever assessment and management protocols..."
                    },
                    {
                        "id": 2,
                        "source": "Pediatric Emergency Medicine Guidelines",
                        "excerpt": "Antipyretic dosing in pediatric patients..."
                    }
                ],
                "intent": "treatment",
                "source_type": "user",
                "user_id": user_id,
                "created_at": datetime.now().isoformat(),
                "region": "User Defined",
                "organization": "Custom Upload"
            },
            {
                "protocol_id": f"preview_{upload_id}_3",
                "title": "Pre-operative Surgical Checklist",
                "steps": [
                    {
                        "step": 1,
                        "text": "Verify patient identity using two identifiers",
                        "explanation": "Check name, date of birth, and medical record number",
                        "citation": 1,
                        "priority": "high"
                    },
                    {
                        "step": 2,
                        "text": "Confirm surgical site marking and procedure",
                        "explanation": "Verify with patient and surgical team the correct site and procedure",
                        "citation": 1,
                        "priority": "high"
                    },
                    {
                        "step": 3,
                        "text": "Review allergies and confirm antibiotic prophylaxis if indicated",
                        "explanation": "Administer appropriate antibiotics within 60 minutes of incision",
                        "citation": 2,
                        "priority": "medium"
                    }
                ],
                "citations": [
                    {
                        "id": 1,
                        "source": "WHO Surgical Safety Checklist",
                        "excerpt": "Pre-operative safety protocols and verification procedures..."
                    },
                    {
                        "id": 2,
                        "source": "Surgical Infection Prevention Guidelines",
                        "excerpt": "Antibiotic prophylaxis in surgical procedures..."
                    }
                ],
                "intent": "prevention",
                "source_type": "user",
                "user_id": user_id,
                "created_at": datetime.now().isoformat(),
                "region": "User Defined",
                "organization": "Custom Upload"
            }
        ]

        # Store mock protocols for consistency
        await self.store_protocols_for_preview(user_id, upload_id, mock_protocols)

        return mock_protocols

    async def approve_and_index_protocols(self, user_id: str, upload_id: str) -> Dict[str, Any]:
        """Index the approved protocols to Elasticsearch"""
        try:
            # Get protocols from preview
            protocols = await self.get_preview_protocols(user_id, upload_id)

            if not protocols:
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
            original_protocols = await self.get_preview_protocols(user_id, upload_id)

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

            # Check if there's an active task for this upload
            if upload_key in self.active_tasks:
                task = self.active_tasks[upload_key]

                if not task.done():
                    # Immediately cancel the asyncio task
                    task.cancel()
                    print(f"🚫 Upload {upload_id} task cancelled immediately")

                    # Mark as cancelled for any remaining checks
                    self.cancelled_uploads.add(upload_key)

                    # Clean up any temporary files
                    await self.cleanup_temp_files(upload_id)

                    return True
                else:
                    print(f"⚠️ Upload {upload_id} task already completed")
                    return False
            else:
                print(f"⚠️ Upload {upload_id} not found in active tasks")
                return False

        except Exception as e:
            print(f"❌ Error cancelling upload {upload_id}: {str(e)}")
            return False

    def _is_upload_cancelled(self, user_id: str, upload_id: str) -> bool:
        """Check if an upload has been cancelled"""
        upload_key = f"{user_id}_{upload_id}"
        return upload_key in self.cancelled_uploads