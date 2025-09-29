from typing import List, Dict, Any
import google.generativeai as genai
from config.settings import settings

_client_initialized = False
_model: Any | None = None

def _ensure_client():
    global _client_initialized, _model
    if _client_initialized and _model is not None:
        return
    if not settings.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured")
    genai.configure(api_key=settings.GEMINI_API_KEY)
    _model = genai.GenerativeModel(
        model_name=settings.GEMINI_MODEL,
        generation_config={
            "max_output_tokens": 768,
            "temperature": 0.2,
        },
    )
    _client_initialized = True


def _extract_text(response: Any) -> str:
    # Try the quick accessor, then fall back to candidates->parts
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


def _clean_checklist_step(text: str) -> str:
    """Clean and shorten a checklist step to be concise and actionable."""
    text = str(text).strip()
    if not text:
        return ""
    
    # Remove common prefixes that make it verbose
    prefixes_to_remove = [
        "Step", "Action", "Task", "Procedure", "Process", "Check", "Verify", "Ensure", "Confirm",
        "The patient should", "The healthcare provider should", "The clinician should",
        "It is important to", "It is recommended to", "It is necessary to",
        "First", "Next", "Then", "Finally", "Additionally", "Furthermore",
    ]
    
    for prefix in prefixes_to_remove:
        if text.lower().startswith(prefix.lower()):
            text = text[len(prefix):].strip()
            if text.startswith(":"):
                text = text[1:].strip()
            break
    
    # Remove verbose endings
    endings_to_remove = [
        "as needed", "if necessary", "if required", "if appropriate", "if indicated",
        "according to protocol", "per guidelines", "as per standard practice",
        "to ensure patient safety", "for optimal outcomes", "for best results",
    ]
    
    for ending in endings_to_remove:
        if text.lower().endswith(ending.lower()):
            text = text[:-len(ending)].strip()
            break
    
    # Limit length to keep it concise
    if len(text) > 120:
        # Try to cut at a natural break
        for delimiter in [". ", "; ", ", "]:
            if delimiter in text[:120]:
                text = text[:text[:120].rfind(delimiter) + 1].strip()
                break
        else:
            text = text[:117] + "..."
    
    return text


def summarize_checklist(title: str, context_snippets: List[str], instructions: str | None = None, region: str | None = None, year: int | None = None) -> Dict[str, Any]:
    _ensure_client()
    assert _model is not None

    prompt_parts: List[str] = [
        "You are a medical protocol assistant. Generate a concise, actionable checklist.",
        "CRITICAL: Each step must be SHORT (max 15 words), ACTIONABLE, and CLEAR.",
        "Output ONLY JSON with this exact structure:",
        '{"title": "string", "checklist": [{"step": 1, "text": "short action"}, ...], "citations": []}',
        "Rules:",
        "- Steps must be imperative commands (e.g., 'Assess vital signs', 'Administer medication')",
        "- NO explanations, NO context, NO 'ensure that' or 'make sure'",
        "- NO code fences, NO extra text",
        "- Keep each step under 15 words",
        "- Number steps 1, 2, 3...",
        "- Analyze ALL provided context and select the MOST RELEVANT information for the user's query",
        "- If context contains conflicting information, prioritize the most authoritative or recent sources",
        "- Ignore irrelevant information that doesn't directly relate to the user's specific query",
    ]
    
    if region:
        prompt_parts.append(f"Region: {region}.")
    if year:
        prompt_parts.append(f"Year: {year}.")
    if instructions:
        prompt_parts.append(f"Instructions: {instructions}")

    prompt_parts.append(f"Title: {title}")
    prompt_parts.append("Context:")
    for i, snippet in enumerate(context_snippets[:6], start=1):  # Limit context to avoid verbosity
        prompt_parts.append(f"{i}. {snippet}")

    prompt = "\n".join(prompt_parts)
    response = _model.generate_content(prompt)
    text = _extract_text(response)

    import json
    if text:
        try:
            data = json.loads(text)
            out_title = str(data.get("title", title)).strip() or title
            raw_items = data.get("checklist", [])
            checklist: List[Dict[str, Any]] = []
            
            for idx, item in enumerate(raw_items, start=1):
                if isinstance(item, dict):
                    step_num = int(item.get("step", idx))
                    step_text = _clean_checklist_step(item.get("text", ""))
                else:
                    step_num = idx
                    step_text = _clean_checklist_step(str(item))
                
                if step_text and len(step_text) > 3:  # Only include meaningful steps
                    checklist.append({"step": step_num, "text": step_text})
            
            citations = data.get("citations", [])
            if not isinstance(citations, list):
                citations = []
            citations = [str(c).strip() for c in citations if str(c).strip()]
            
            return {
                "title": out_title,
                "checklist": checklist,
                "citations": citations,
            }
        except Exception:
            pass

    # Fallback: create concise steps from context
    fallback_steps = []
    for i, snippet in enumerate(context_snippets[:6], start=1):
        cleaned = _clean_checklist_step(snippet)
        if cleaned and len(cleaned) > 3:
            fallback_steps.append({"step": i, "text": cleaned})
    
    return {
        "title": title,
        "checklist": fallback_steps,
        "citations": [],
    }
