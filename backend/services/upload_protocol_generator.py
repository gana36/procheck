"""
Upload Protocol Generator Service
Dedicated service for generating protocols from user-uploaded documents
Isolated from the main gemini_service to avoid conflicts with other features
"""

from typing import List, Dict, Any, Optional
import json
import google.generativeai as genai
from config.settings import settings

_client_initialized = False
_model: Any | None = None


def _ensure_client():
    """Initialize Gemini client if not already initialized"""
    global _client_initialized, _model
    if _client_initialized and _model is not None:
        return
    if not settings.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured")
    genai.configure(api_key=settings.GEMINI_API_KEY)
    _model = genai.GenerativeModel(
        model_name=settings.GEMINI_MODEL,
        generation_config={
            "max_output_tokens": 4096,
            "temperature": 0.3,
            "top_p": 0.95,
            "top_k": 40,
        },
    )
    _client_initialized = True


def _extract_text(response: Any) -> str:
    """Extract text from Gemini response"""
    try:
        if hasattr(response, "text") and response.text:
            return response.text
    except Exception:
        pass
    try:
        if getattr(response, "candidates", None):
            for cand in response.candidates:
                content = getattr(cand, "content", None)
                if not content:
                    continue
                parts = getattr(content, "parts", [])
                texts: List[str] = []
                for part in parts:
                    t = getattr(part, "text", None)
                    if t:
                        texts.append(t)
                if texts:
                    return "\n".join(texts)
    except Exception:
        pass
    return ""


def _validate_protocol_response(data: Dict[str, Any]) -> tuple[bool, str]:
    """
    Validate that a protocol response has complete data.
    Returns (is_valid, reason_if_invalid)

    Note: Empty checklist is VALID (means no protocols found in content)
    We only validate protocols that DO exist have proper structure.
    """
    if not isinstance(data, dict):
        return False, "Response is not a dictionary"

    checklist = data.get("checklist", [])

    # Empty checklist is VALID - means no relevant protocols found
    if not checklist:
        return True, ""  # Changed from False to True

    citations = data.get("citations", [])

    # If we HAVE steps, they should have citations available
    if not citations or len(citations) == 0:
        return False, "Has steps but no citations array"

    # Count incomplete steps
    missing_explanations = 0
    missing_citations = 0

    for item in checklist:
        if not isinstance(item, dict):
            continue

        explanation = item.get("explanation", "").strip()
        citation = item.get("citation", 0)

        if not explanation or len(explanation) < 10:
            missing_explanations += 1

        if citation == 0:
            missing_citations += 1

    total_steps = len(checklist)

    # If more than 50% of steps are incomplete, reject
    if missing_explanations > total_steps * 0.5:
        return False, f"{missing_explanations}/{total_steps} steps missing explanations"

    if missing_citations > total_steps * 0.5:
        return False, f"{missing_citations}/{total_steps} steps missing citations"

    return True, ""


def generate_protocol_from_chunk(
    chunk_text: str,
    source_file: str,
    protocol_type: str,
    protocol_focus: str,
    custom_prompt: Optional[str] = None,
    region: str = "User Defined",
    year: int = 2024
) -> Dict[str, Any]:
    """
    Generate a single protocol from a text chunk.

    Args:
        chunk_text: The text content to generate protocol from
        source_file: Name of the source file
        protocol_type: Type of protocol (diagnostic, treatment, emergency, prevention)
        protocol_focus: Focus description for the protocol
        custom_prompt: Optional custom instructions
        region: Geographic region
        year: Year of the protocol

    Returns:
        Dict with protocol data (title, checklist, citations)
    """
    _ensure_client()
    assert _model is not None

    # Build the prompt
    prompt_parts = [
        "Extract a medical protocol from the provided source. Use ONLY information explicitly in the source.",
        "",
        "⚠️ CRITICAL RULES:",
        "1. ONLY use information EXPLICITLY in the source below",
        "2. EVERY step needs: 'text' (action), 'explanation' (2-3 sentences), 'citation' (1)",
        "3. NO empty explanations, NO citation=0, NO made-up content",
        "4. If no relevant protocols found, return empty checklist",
        "",
        "OUTPUT FORMAT (JSON only, no markdown):",
        '{"title": "Protocol Name", "checklist": [{"step": 1, "text": "Brief action", "explanation": "Detailed how-to", "citation": 1}], "citations": ["Source text"]}',
        "",
        f"FOCUS: Extract {protocol_focus} procedures only.",
        "",
        "━━━ QUERY:",
        f"{protocol_type.title()} Protocol from {source_file}",
        f"Region: {region}",
        f"Year: {year}",
    ]

    if custom_prompt and custom_prompt.strip():
        prompt_parts.extend([
            "",
            f"ADDITIONAL USER INSTRUCTIONS:",
            custom_prompt.strip()
        ])

    prompt_parts.extend([
        "",
        "━━━ SOURCE:",
        f"[Source 1: {source_file}]",
        chunk_text,
        ""
    ])

    base_prompt = "\n".join(prompt_parts)

    # Retry logic with FIXED prompt regeneration
    max_retries = 1
    last_error = None

    for attempt in range(max_retries):
        try:
            # Create prompt based on attempt number
            if attempt == 0:
                current_prompt = base_prompt
            else:
                # For retry, create FRESH enhanced prompt (don't mutate base_prompt)
                current_prompt = base_prompt + "\n\n⚠️⚠️⚠️ CRITICAL: Previous response was incomplete. You MUST include:\n"
                current_prompt += "1. 'explanation' field (2-3 sentences) for EVERY step\n"
                current_prompt += "2. 'citation' field (must be 1) for EVERY step\n"
                current_prompt += "3. 'citations' array with source text\n"
                current_prompt += "DO NOT leave these fields empty!\n"

            response = _model.generate_content(current_prompt)
            text = _extract_text(response)

            if not text:
                last_error = "Empty response from model"
                print(f"⚠️ Attempt {attempt + 1}/{max_retries}: Empty response")
                continue

            # Parse JSON
            try:
                cleaned_text = text.strip()
                if cleaned_text.startswith("```json"):
                    cleaned_text = cleaned_text[7:]
                if cleaned_text.startswith("```"):
                    cleaned_text = cleaned_text[3:]
                if cleaned_text.endswith("```"):
                    cleaned_text = cleaned_text[:-3]
                cleaned_text = cleaned_text.strip()

                # Fix incomplete JSON
                if not cleaned_text.endswith("}"):
                    open_braces = cleaned_text.count("{")
                    close_braces = cleaned_text.count("}")
                    if open_braces > close_braces:
                        cleaned_text += "]}" * (open_braces - close_braces)

                data = json.loads(cleaned_text)

                # Validate response
                is_valid, validation_msg = _validate_protocol_response(data)

                if not is_valid:
                    last_error = f"Incomplete response: {validation_msg}"
                    print(f"⚠️ Attempt {attempt + 1}/{max_retries}: {last_error}")
                    print(f"📊 Protocol: '{protocol_type}' from {source_file}")
                    print(f"📊 Steps: {len(data.get('checklist', []))}, Citations: {len(data.get('citations', []))}")

                    if attempt < max_retries - 1:
                        print(f"🔄 Retrying with enhanced prompt...")
                        continue

                    # Last attempt - use what we have but log warning
                    print(f"⚠️ WARNING: Using incomplete response after {max_retries} attempts")

                # Clean and structure the result
                result = {
                    "title": str(data.get("title", f"{protocol_type.title()} Protocol")).strip(),
                    "checklist": data.get("checklist", []),
                    "citations": data.get("citations", [])
                }

                print(f"✅ Generated protocol (attempt {attempt + 1}/{max_retries})")
                return result

            except json.JSONDecodeError as e:
                last_error = f"JSON parse error: {str(e)}"
                print(f"⚠️ Attempt {attempt + 1}/{max_retries}: {last_error}")
                if attempt < max_retries - 1:
                    continue
                # Fall through to fallback

        except Exception as e:
            last_error = str(e)
            print(f"⚠️ Attempt {attempt + 1}/{max_retries} failed: {last_error}")
            if attempt < max_retries - 1:
                continue

    # Fallback - return empty protocol
    print(f"❌ All {max_retries} attempts failed. Last error: {last_error}")
    return {
        "title": f"{protocol_type.title()} Protocol from {source_file}",
        "checklist": [],
        "citations": []
    }
