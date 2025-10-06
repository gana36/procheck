from typing import List, Dict, Any, Optional
import re
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
            "max_output_tokens": 2048,
            "temperature": 0.7,
            "top_p": 0.95,
            "top_k": 40,
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
    
    # Remove [Source N] tags and (disease): prefixes
    text = re.sub(r'\[Source\s+\d+\]\s*', '', text)
    text = re.sub(r'\([a-zA-Z\s]+\):\s*', '', text)
    
    # Remove leading numbers like "1.", "2)", "3 -", etc.
    text = re.sub(r'^[\d\-\.\)]+\s*', '', text.strip())
    
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


def classify_query_intent(title: str) -> str:
    """Classify the query type to choose appropriate template"""
    title_lower = title.lower()
    
    # Emergency keywords
    if any(word in title_lower for word in ['emergency', 'urgent', 'attack', 'crisis', 'acute', 'severe', 'critical']):
        return 'emergency'
    
    # Treatment keywords
    if any(word in title_lower for word in ['treatment', 'manage', 'therapy', 'medication', 'drug', 'protocol']):
        return 'treatment'
    
    # Diagnosis keywords
    if any(word in title_lower for word in ['diagnosis', 'diagnose', 'differential', 'test', 'screening']):
        return 'diagnosis'
    
    # Symptoms keywords
    if any(word in title_lower for word in ['symptom', 'sign', 'presentation', 'manifestation']):
        return 'symptoms'
    
    # Prevention keywords
    if any(word in title_lower for word in ['prevention', 'prevent', 'avoid', 'protect', 'prophylaxis']):
        return 'prevention'
    
    return 'general'


def summarize_checklist(title: str, context_snippets: List[str], instructions: str | None = None, region: str | None = None, year: int | None = None) -> Dict[str, Any]:
    _ensure_client()
    assert _model is not None

    # Classify query intent for smart templating
    intent = classify_query_intent(title)
    
    # Base instructions - SIMPLE AND DIRECT
    base_instructions = [
        "You are a medical AI assistant. Your job is to READ medical sources and CREATE a concise checklist with detailed explanations.",
        "",
        "STRICT RULES:",
        "1. Each step has TWO parts:",
        "   - 'text': Short action (under 15 words) - what to do",
        "   - 'explanation': Detailed how-to (2-3 sentences) - how to do it",
        "2. REPHRASE everything in your own words (NO copying)",
        "3. EXTRACT the citation number from [Source N] in the context",
        "4. ONLY include relevant information for this specific query",
        "",
        "EXAMPLE:",
        "BAD: \"Dengue symptoms include high fever 39-40°C, severe headache...\"",
        "GOOD:",
        '{',
        '  "text": "Monitor fever and headache",',
        '  "explanation": "Check patient temperature regularly. Dengue typically causes high fever (39-40°C) along with severe frontal headache and pain behind the eyes. Document fever patterns and intensity.",',
        '  "citation": 1',
        '}',
        "",
        "Output format:",
        '{"title": "X", "checklist": [{"step": 1, "text": "action", "explanation": "how to do it", "citation": 1}], "citations": []}',
        "",
        "NO markdown, NO code blocks, ONLY the JSON object.",
    ]
    
    # Intent-specific templates
    if intent == 'emergency':
        prompt_parts = base_instructions + [
            "",
            "⚠️ EMERGENCY PROTOCOL FORMAT:",
            "- Start with IMMEDIATE ACTIONS (call 911, position patient, etc.)",
            "- Include critical warning signs to watch for",
            "- Each step: urgent, clear command (e.g., 'Call emergency services immediately')",
            "- Add severity indicators where relevant",
            "- Keep steps SHORT (max 20 words) and ACTIONABLE",
        ]
    elif intent == 'symptoms':
        prompt_parts = base_instructions + [
            "",
            "📋 SYMPTOMS GUIDE FORMAT:",
            "- Start with EARLY symptoms and timeline (e.g., 'Within 2-5 days: fever, headache')",
            "- Progress to LATER symptoms if applicable",
            "- Include severity levels (mild/moderate/severe) where relevant",
            "- Mention WHEN to seek medical attention",
            "- Group related symptoms together",
        ]
    elif intent == 'treatment':
        prompt_parts = base_instructions + [
            "",
            "💊 TREATMENT PROTOCOL FORMAT:",
            "- Start with FIRST-LINE interventions",
            "- Include specific actions (e.g., 'Administer paracetamol 500mg every 6 hours')",
            "- Progress logically through treatment steps",
            "- Mention monitoring requirements",
            "- Each step: specific, actionable medical instruction",
        ]
    elif intent == 'diagnosis':
        prompt_parts = base_instructions + [
            "",
            "🔬 DIAGNOSTIC APPROACH FORMAT:",
            "- Start with CLINICAL ASSESSMENT (history, examination)",
            "- List KEY diagnostic criteria or tests",
            "- Include differential diagnoses if relevant",
            "- Mention specific test values or findings",
            "- Each step: diagnostic action or criterion",
        ]
    elif intent == 'prevention':
        prompt_parts = base_instructions + [
            "",
            "🛡️ PREVENTION GUIDE FORMAT:",
            "- Start with PRIMARY prevention measures",
            "- Include practical, actionable steps (e.g., 'Use mosquito repellent containing DEET')",
            "- Prioritize most effective interventions first",
            "- Mention risk factors to avoid",
            "- Each step: preventive action",
        ]
    else:  # general
        prompt_parts = base_instructions + [
            "",
            "📌 GENERAL PROTOCOL FORMAT:",
            "- Synthesize key information from context",
            "- Each step: clear, actionable medical point",
            "- Organize logically (assessment → intervention → follow-up)",
            "- Keep steps concise (max 20 words)",
            "- Focus on practical clinical guidance",
        ]
    
    prompt_parts.extend([
        "",
        "SYNTHESIS REQUIREMENTS:",
        "- DO NOT copy numbered lists from context (e.g., '1. Assess... 2. Order...')",
        "- REPHRASE and CONDENSE information in your own words",
        "- Each step should be ONE clear action (max 15 words)",
        "- COMBINE related information from multiple sources",
        "- Remove redundancy and wordiness",
        "",
        "CITATION REQUIREMENTS:",
        "- Each step MUST have a 'citation' field (1, 2, 3...)",
        "- Extract source number from [Source N] in context",
        "- If synthesizing multiple sources, cite the primary one",
        "",
        "FILTERING RULES:",
        "- ONLY use information relevant to the query",
        "- IGNORE unrelated diseases completely",
        "- Better 4-6 synthesized steps than 10+ copied steps",
    ])
    
    if region:
        prompt_parts.append(f"Region: {region}.")
    if year:
        prompt_parts.append(f"Year: {year}.")
    if instructions:
        prompt_parts.append(f"Instructions: {instructions}")

    prompt_parts.append(f"Title: {title}")
    prompt_parts.append("")
    prompt_parts.append("Context Sources:")
    prompt_parts.append("(Each source is labeled [Source N]. Extract the number N for your citation field.)")
    prompt_parts.append("")
    for snippet in context_snippets[:6]:  # Limit context to avoid verbosity
        prompt_parts.append(snippet)
    prompt_parts.append("")
    prompt_parts.append("Remember: Extract the [Source N] number from each snippet and use N in your 'citation' field.")

    prompt = "\n".join(prompt_parts)
    
    response = _model.generate_content(prompt)
    text = _extract_text(response)

    import json
    if text:
        # Try to parse JSON, fixing common issues
        try:
            # Remove markdown code blocks if present
            cleaned_text = text.strip()
            if cleaned_text.startswith("```json"):
                cleaned_text = cleaned_text[7:]
            if cleaned_text.startswith("```"):
                cleaned_text = cleaned_text[3:]
            if cleaned_text.endswith("```"):
                cleaned_text = cleaned_text[:-3]
            cleaned_text = cleaned_text.strip()
            
            # Try to fix incomplete JSON by adding closing braces
            if not cleaned_text.endswith("}"):
                # Count opening vs closing braces
                open_braces = cleaned_text.count("{")
                close_braces = cleaned_text.count("}")
                if open_braces > close_braces:
                    # Add missing closing braces
                    cleaned_text += "]}" * (open_braces - close_braces)
            
            data = json.loads(cleaned_text)
            out_title = str(data.get("title", title)).strip() or title
            raw_items = data.get("checklist", [])
            checklist: List[Dict[str, Any]] = []
            
            for idx, item in enumerate(raw_items, start=1):
                if isinstance(item, dict):
                    step_num = int(item.get("step", idx))
                    step_text = _clean_checklist_step(item.get("text", ""))
                    explanation = item.get("explanation", "")
                    citation = item.get("citation", 0)  # Get citation number
                else:
                    step_num = idx
                    step_text = _clean_checklist_step(str(item))
                    explanation = ""
                    citation = 0
                
                if step_text and len(step_text) > 3:  # Only include meaningful steps
                    checklist.append({
                        "step": step_num, 
                        "text": step_text,
                        "explanation": explanation,
                        "citation": citation if isinstance(citation, int) else 0
                    })
            
            citations = data.get("citations", [])
            if not isinstance(citations, list):
                citations = []
            citations = [str(c).strip() for c in citations if str(c).strip()]
            
            return {
                "title": out_title,
                "checklist": checklist,
                "citations": citations,
            }
        except Exception as e:
            pass  # Silently continue to fallback

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


def step_thread_chat(
    message: str,
    step_id: int,
    step_text: str,
    step_citation: Optional[int],
    protocol_title: str,
    protocol_citations: List[str],
    thread_history: Optional[List[Dict[str, str]]] = None
) -> Dict[str, Any]:
    """
    Handle step-level thread conversations.
    Focused discussions about a specific protocol step.
    """
    _ensure_client()
    
    if thread_history is None:
        thread_history = []
    
    # Get the relevant citation if available
    citation_text = ""
    if step_citation and 0 < step_citation <= len(protocol_citations):
        citation_text = f"\n\nSOURCE [{step_citation}]:\n{protocol_citations[step_citation - 1]}"
    
    # Build thread history
    history_text = ""
    if thread_history:
        history_text = "\n".join([
            f"{msg.get('role', 'user').upper()}: {msg.get('content', '')}"
            for msg in thread_history[-5:]  # Last 5 messages
        ])
    
    prompt = f"""You are a knowledgeable medical AI assistant helping with the "{protocol_title}" protocol.

CONTEXT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 STEP {step_id}: {step_text}
{citation_text}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{f"DISCUSSION HISTORY:{chr(10)}{history_text}{chr(10)}" if history_text else ""}

USER QUESTION: {message}

RESPONSE GUIDELINES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. **Stay Focused**: Answer questions specifically about THIS step
2. **Be Comprehensive**: Cover the "why" and "how" when relevant
3. **Structure Your Response**:
   • Start with a direct answer to the question
   • Provide clinical rationale or context
   • Include practical considerations (timing, dosage, technique, etc.)
   • Mention contraindications or warnings if relevant
   • Suggest alternatives when appropriate
   
4. **Use Medical Evidence**: Reference the source citation when applicable
5. **Length**: Aim for 3-5 well-structured sentences (can be longer if needed for complex topics)
6. **Tone**: Professional, clear, and helpful
7. **Scope Limits**: If the question goes beyond this step, politely redirect to the main protocol chat
8. **Formatting**: Use markdown for better readability:
   - Use **bold** for key medical terms or important points
   - Use bullet points (•, -) for lists
   - Use numbered lists for sequential steps
   - Keep paragraphs concise and well-spaced

EXAMPLE RESPONSE:
"**Direct Answer:** [Main response to the question].

**Clinical Rationale:** [Why this step is important, evidence-based reasoning].

**Practical Considerations:**
- Timing: [When to perform]
- Dosage/Technique: [How to perform]
- Monitoring: [What to watch for]

**Important Notes:** [Contraindications, warnings, or alternatives if applicable]."

Now provide a clear, well-formatted, helpful response:"""

    try:
        response = _model.generate_content(prompt)
        answer = _extract_text(response)
        
        return {
            "message": answer.strip() if answer else "Could you clarify your question about this step?",
            "updated_protocol": None
        }
    except Exception as e:
        return {
            "message": "I had trouble processing that. Could you rephrase your question?",
            "updated_protocol": None
        }
