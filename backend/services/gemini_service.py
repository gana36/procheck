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
            "max_output_tokens": 4096,  # Increased for detailed protocols
            "temperature": 0.3,  # Lower for more consistent structured output
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


def _validate_protocol_response(data: Dict[str, Any]) -> tuple[bool, str]:
    """
    Validate that a protocol response has complete data.
    Returns (is_valid, reason_if_invalid)
    """
    if not isinstance(data, dict):
        return False, "Response is not a dictionary"
    
    checklist = data.get("checklist", [])
    if not checklist:
        return False, "Checklist is empty"
    
    citations = data.get("citations", [])
    
    # Count incomplete steps
    incomplete_steps = 0
    missing_explanations = 0
    missing_citations = 0
    
    for item in checklist:
        if not isinstance(item, dict):
            incomplete_steps += 1
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
    
    # Check if citations array is empty
    if not citations or len(citations) == 0:
        return False, "Citations array is empty"
    
    return True, ""


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
    
    # Concise instructions - STRICT SOURCE-BASED GENERATION
    base_instructions = [
        "Extract a medical protocol from the provided sources. Use ONLY information in the [Source N] snippets.",
        "",
        "⚠️ CRITICAL RULES:",
        "1. ONLY use information EXPLICITLY in sources below",
        "2. EVERY step needs: 'text' (action), 'explanation' (2-3 sentences), 'citation' (1-6)",
        "3. NO empty explanations, NO citation=0, NO made-up content",
        "",
        "OUTPUT FORMAT (JSON only, no markdown):",
        '{"title": "X", "checklist": [{"step": 1, "text": "Brief action", "explanation": "Detailed how-to from source", "citation": 1}], "citations": ["Source 1 text", "Source 2 text"]}',
        "",
        "EXAMPLE STEP:",
        '{"step": 1, "text": "Monitor fever and headache", "explanation": "Check temperature regularly. Dengue causes high fever (39-40°C) with severe frontal headache. Document patterns.", "citation": 1}',
    ]
    
    # Intent-specific templates (concise)
    intent_hints = {
        'emergency': "Start with immediate actions (call 911, etc.). Keep steps urgent and short.",
        'symptoms': "List symptoms chronologically. Include severity levels and when to seek help.",
        'treatment': "Start with first-line treatments. Include specific dosages/instructions.",
        'diagnosis': "Clinical assessment → diagnostic tests → criteria. Be specific.",
        'prevention': "Primary prevention first. Practical, actionable steps.",
        'general': "Logical flow: assessment → intervention → follow-up. Stay concise."
    }
    
    prompt_parts = base_instructions + [
        "",
        f"HINT: {intent_hints.get(intent, intent_hints['general'])}",
        "",
        "⛔ FILTERS:",
        "- Skip sources about DIFFERENT conditions",
        "- Only info DIRECTLY related to: {title}",
        "- 3-4 accurate steps better than 10 with made-up content",
    ]
    
    prompt_parts.append("")
    prompt_parts.append(f"━━━ QUERY: {title}")
    if region:
        prompt_parts.append(f"Region: {region}")
    if year:
        prompt_parts.append(f"Year: {year}")
    if instructions:
        prompt_parts.append(f"Note: {instructions}")
    prompt_parts.append("")
    prompt_parts.append("━━━ SOURCES (cite as [Source N]):")
    
    # Add sources
    for i, snippet in enumerate(context_snippets[:6], 1):
        prompt_parts.append(f"[Source {i}] {snippet}")
        prompt_parts.append("")

    prompt = "\n".join(prompt_parts)
    
    import json
    
    # Retry up to 2 times for incomplete responses
    max_retries = 2
    last_error = None
    
    for attempt in range(max_retries):
        try:
            response = _model.generate_content(prompt)
            text = _extract_text(response)
            
            if not text:
                last_error = "Empty response from model"
                continue
            
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
                
                # Validate the response quality
                is_valid, validation_msg = _validate_protocol_response(data)
                
                if not is_valid:
                    last_error = f"Incomplete response: {validation_msg}"
                    print(f"⚠️ Attempt {attempt + 1}/{max_retries}: {last_error}")
                    print(f"📊 Protocol title: '{title}'")
                    print(f"📊 Steps in response: {len(data.get('checklist', []))}")
                    print(f"📊 Citations in response: {len(data.get('citations', []))}")
                    
                    if attempt < max_retries - 1:
                        # Add stronger reminder to the prompt for retry
                        prompt += "\n\n⚠️⚠️⚠️ CRITICAL: Previous response was incomplete. You MUST include:\n"
                        prompt += "1. 'explanation' field (2-3 sentences) for EVERY step\n"
                        prompt += "2. 'citation' field (1, 2, 3...) for EVERY step\n"
                        prompt += "3. 'citations' array with full source text\n"
                        prompt += "DO NOT leave these fields empty!\n"
                        print(f"🔄 Retrying with enhanced prompt...")
                        continue
                    # On last attempt, accept but log warning
                    print(f"⚠️ WARNING: Using incomplete response after {max_retries} attempts: {validation_msg}")
                    print(f"⚠️ This is the issue reported by the user - protocol has empty explanations/citations")
                
                # Parse and clean the data
                out_title = str(data.get("title", title)).strip() or title
                raw_items = data.get("checklist", [])
                checklist: List[Dict[str, Any]] = []
                
                for idx, item in enumerate(raw_items, start=1):
                    if isinstance(item, dict):
                        step_num = int(item.get("step", idx))
                        step_text = _clean_checklist_step(item.get("text", ""))
                        explanation = item.get("explanation", "").strip()
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
                
                result = {
                    "title": out_title,
                    "checklist": checklist,
                    "citations": citations,
                }
                
                print(f"✅ Successfully generated protocol (attempt {attempt + 1}/{max_retries})")
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
            # Fall through to fallback
    
    print(f"❌ All {max_retries} attempts failed. Last error: {last_error}. Using fallback.")

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
    
    prompt = f"""You are a medical AI assistant. Answer questions about THIS SPECIFIC STEP ONLY.

⚠️ CRITICAL RULES:
1. Use ONLY the information in the SOURCE below
2. DO NOT add information from your general knowledge
3. Stay focused on THIS step - don't discuss other parts of the protocol
4. If the SOURCE doesn't answer the question, say so clearly

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 PROTOCOL: {protocol_title}
📍 STEP {step_id}: {step_text}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔍 SOURCE FOR THIS STEP:
{citation_text if citation_text else "No specific source available for this step."}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{f"DISCUSSION HISTORY:{chr(10)}{history_text}{chr(10)}" if history_text else ""}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
USER QUESTION: {message}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RESPONSE REQUIREMENTS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. **Stay Strictly On Topic**: Answer ONLY about Step {step_id}
2. **Use Only Source Information**: Extract from the SOURCE above, don't add external knowledge
3. **Structure Your Response**:
   • Direct answer (1-2 sentences) - FROM SOURCE
   • Clinical rationale - FROM SOURCE
   • Practical details (timing, dosage, technique) - FROM SOURCE
   • If SOURCE lacks info for the question, state: "The available source doesn't specify [aspect]. Please consult medical guidelines."
   
4. **Citations**: Reference the source when applicable
5. **Scope**: If question is beyond this step, say: "This question is broader than Step {step_id}. Please ask in the main chat."
6. **Formatting**:
   - Use **bold** for medical terms
   - Use bullet points for lists
   - Keep paragraphs concise (2-3 sentences)

EXAMPLE RESPONSE (if SOURCE has the info):
"**Direct Answer:** [Extract from SOURCE].

**Clinical Rationale:** [Why - from SOURCE].

**Practical Considerations:**
- Timing: [from SOURCE]
- Technique: [from SOURCE]
- Monitoring: [from SOURCE]

**Note:** [Warnings from SOURCE, if any]."

EXAMPLE RESPONSE (if SOURCE lacks info):
"The available source for this step doesn't provide specific information about [aspect of question]. For detailed guidance on [topic], please consult the full medical guidelines or ask in the main protocol chat."

⚠️ Remember: ONLY use information from the SOURCE above. Do NOT add external medical knowledge."

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


def _analyze_question_type(message: str, protocol_title: str) -> Dict[str, Any]:
    """
    Analyze the user's question to determine intent and category.
    Returns structured information about the question.
    """
    message_lower = message.lower()
    
    # Question categories with keywords
    categories = {
        'dosage': ['dosage', 'dose', 'how much', 'amount', 'mg', 'ml', 'quantity'],
        'symptoms': ['symptom', 'sign', 'feel', 'looks like', 'presentation', 'manifest'],
        'timing': ['when', 'how long', 'duration', 'frequency', 'how often', 'timing'],
        'complications': ['complication', 'risk', 'side effect', 'adverse', 'danger', 'problem'],
        'safety': ['safe', 'avoid', 'caution', 'warning', 'contraindication', 'dangerous'],
        'procedure': ['how to', 'procedure', 'steps', 'technique', 'method', 'perform'],
        'comparison': ['compare', 'difference', 'versus', 'vs', 'alternative', 'instead'],
        'rationale': ['why', 'reason', 'because', 'explain', 'rationale', 'purpose']
    }
    
    detected_categories = []
    for category, keywords in categories.items():
        if any(keyword in message_lower for keyword in keywords):
            detected_categories.append(category)
    
    # Check if question is about the same topic
    protocol_words = set(protocol_title.lower().split())
    message_words = set(message_lower.split())
    topic_overlap = len(protocol_words & message_words) / len(protocol_words) if protocol_words else 0
    
    # Special cases for follow-up questions
    is_clarification = any(word in message_lower for word in [
        'differentiate', 'explain', 'clarify', 'detail', 'specific', 'more about',
        'tell me', 'what about', 'how do', 'mild', 'severe', 'compare'
    ])
    
    # Very permissive for follow-ups: assume related unless obviously different disease
    is_related = topic_overlap > 0.2 or len(message) < 120 or is_clarification or detected_categories
    
    return {
        'categories': detected_categories,
        'primary_category': detected_categories[0] if detected_categories else 'general',
        'is_related_topic': is_related,
        'topic_overlap': topic_overlap
    }


def _generate_smart_followups(message: str, protocol_title: str, conversation_history: List[Dict[str, str]], question_analysis: Dict[str, Any]) -> List[str]:
    """
    Generate contextually relevant follow-up questions that avoid repetition.
    Uses conversation history and question analysis to be smart about suggestions.
    """
    # Extract previously asked topics from history
    asked_topics = set()
    for msg in conversation_history[-10:]:
        if msg.get('role') == 'user':
            content = msg.get('content', '').lower()
            # Extract key topics
            for topic in ['dosage', 'symptoms', 'timing', 'complications', 'safety', 'procedure']:
                if topic in content:
                    asked_topics.add(topic)
    
    # Question pool organized by category
    question_templates = {
        'dosage': [
            f"What are alternative dosages for {protocol_title}?",
            f"How do I adjust the dose based on severity?",
            f"What if I miss a dose?"
        ],
        'symptoms': [
            f"What symptoms indicate {protocol_title} is worsening?",
            f"How do I differentiate mild vs severe symptoms?",
            f"What early warning signs should I watch for?"
        ],
        'timing': [
            f"When should I expect improvement?",
            f"How long should I continue monitoring?",
            f"What's the typical recovery timeline?"
        ],
        'complications': [
            f"What are the most serious complications of {protocol_title}?",
            f"How can I prevent complications?",
            f"What complications require immediate attention?"
        ],
        'safety': [
            f"What medications should I avoid with {protocol_title}?",
            f"What are the contraindications?",
            f"When is it unsafe to proceed with this protocol?"
        ],
        'procedure': [
            f"What's the step-by-step procedure?",
            f"What equipment or preparation is needed?",
            f"What are common mistakes to avoid?"
        ],
        'comparison': [
            f"How does this compare to alternative treatments?",
            f"What are the pros and cons of this approach?",
            f"When should I choose this protocol over others?"
        ],
        'general': [
            f"What should healthcare providers know about {protocol_title}?",
            f"What resources are available for more information?",
            f"How has this protocol evolved recently?"
        ]
    }
    
    # Priority order based on current question
    primary_category = question_analysis['primary_category']
    
    # Start with categories NOT yet asked about
    priority_categories = [cat for cat in ['dosage', 'symptoms', 'timing', 'complications', 'safety', 'procedure'] 
                          if cat not in asked_topics and cat != primary_category]
    
    # Add primary category if not just asked
    if primary_category not in asked_topics:
        priority_categories.insert(0, primary_category)
    
    # Add general as fallback
    priority_categories.append('general')
    
    # Generate questions
    suggestions = []
    for category in priority_categories:
        if category in question_templates:
            # Take first question from each category
            suggestions.append(question_templates[category][0])
            if len(suggestions) >= 5:
                break
    
    return suggestions[:5]


def protocol_conversation_chat(
    message: str,
    concept_title: str,
    protocol_json: Dict[str, Any],
    citations_list: List[str],
    filters_json: Optional[Dict[str, Any]] = None,
    conversation_history: Optional[List[Dict[str, str]]] = None,
    enable_context_search: bool = True,
    user_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Handle protocol-level conversational chat with optional context search.
    
    Args:
        message: User's follow-up question
        concept_title: Main protocol/concept title
        protocol_json: Current protocol data
        citations_list: Existing protocol citations
        filters_json: Optional search filters
        conversation_history: Previous messages
        enable_context_search: If True, searches for additional context
        user_id: For personalized search
    
    Returns:
        Dict with answer, citations, sources, follow-up questions
    """
    _ensure_client()
    
    # Fresh context search for long conversations
    additional_sources = []
    additional_citations = []
    used_new_sources = False
    
    print(f"🔎 protocol_conversation_chat called with enable_context_search={enable_context_search}")
    
    if enable_context_search:
        try:
            from services.elasticsearch_service import hybrid_search
            
            # FULL HYBRID SEARCH for follow-up question
            # Strategy: ALWAYS combine protocol context + follow-up question
            # This ensures we get specific info while maintaining topical relevance
            
            # Extract key terms from protocol title (remove common words and punctuation)
            import re
            # Remove punctuation first, then split
            cleaned_title = re.sub(r'[^\w\s]', ' ', concept_title.lower())  # Replace with space, not empty
            protocol_keywords = ' '.join([
                word for word in cleaned_title.split() 
                if word and word not in ['what', 'are', 'the', 'of', 'for', 'how', 'to', 'is', 'a', 'an', 'do', 'i']
            ]).strip()
            
            print(f"🔧 Cleaned title: '{concept_title}' → '{cleaned_title}' → keywords: '{protocol_keywords}'")
            
            # ENHANCED: Detect comparison/differentiation questions and expand query
            message_lower = message.lower()
            is_comparison = any(keyword in message_lower for keyword in [
                'differentiate', 'difference', 'compare', 'vs', 'versus', 'between'
            ])
            
            # Check if it's specifically about mild vs severe
            is_mild_severe = ('mild' in message_lower and 'severe' in message_lower)
            
            print(f"🔍 Question analysis: comparison={is_comparison}, mild_vs_severe={is_mild_severe}")
            
            if is_comparison and is_mild_severe:
                # For mild vs severe comparison, search for BOTH explicitly
                search_query = f"{protocol_keywords} mild symptoms treatment OR {protocol_keywords} severe symptoms emergency warning signs"
                print(f"🔀 Detected MILD VS SEVERE comparison - searching for both severity levels")
            elif is_comparison:
                # General comparison - keep question intact
                search_query = f"{protocol_keywords} {message}"
                print(f"🔀 Detected comparison question - combined search")
            else:
                # Regular follow-up
                search_query = f"{protocol_keywords} {message}"
            
            print(f"🔍 HYBRID SEARCH for follow-up: '{message}'")
            print(f"📋 Protocol context: '{concept_title}' → keywords: '{protocol_keywords}'")
            print(f"🎯 Combined search query: '{search_query}'")
            
            # Use full hybrid search (semantic + keyword) with more results
            search_result = hybrid_search(
                query=search_query,
                size=8,  # Get more results for better coverage
                filters=filters_json or {}
            )
            
            if search_result and not search_result.get("error"):
                hits = search_result.get("hits", {}).get("hits", [])
                print(f"📊 Hybrid search returned {len(hits)} results")
                
                # Normalize scores to 0-1 range based on max score
                max_score = max([hit.get("_score", 0) for hit in hits[:6]], default=1.0)
                if max_score == 0:
                    max_score = 1.0
                
                for idx, hit in enumerate(hits[:6], start=len(citations_list) + 1):  # Take top 6
                    source = hit.get("_source", {})
                    title = source.get("title", "")
                    body = source.get("body", "")
                    organization = source.get("organization", "")
                    url = source.get("source_url", "")
                    score = hit.get("_score", 0)
                    
                    # Normalize score to 0-1 range
                    normalized_score = score / max_score
                    
                    # Add to additional sources
                    source_text = f"{title} ({organization}): {body[:300]}"
                    additional_sources.append(source_text)
                    
                    # Add structured citation
                    additional_citations.append({
                        "id": idx,
                        "title": title,
                        "organization": organization,
                        "source_url": url,
                        "excerpt": body[:400],
                        "relevance_score": normalized_score
                    })
                
                if additional_sources:
                    used_new_sources = True
                    print(f"✅ Found {len(additional_sources)} additional sources via HYBRID search")
                    print(f"🎯 Top result: {hits[0].get('_source', {}).get('title', 'N/A')[:60]}...")
                    # Show all new source titles for debugging
                    for idx, hit in enumerate(hits[:6], 1):
                        title = hit.get('_source', {}).get('title', 'N/A')
                        print(f"   [{idx}] {title}")
            else:
                print(f"⚠️ No results from hybrid search")
        except Exception as e:
            print(f"⚠️ Hybrid search failed: {e}")
            import traceback
            traceback.print_exc()
            # Continue without additional sources
    
    if conversation_history is None:
        conversation_history = []
    
    # Analyze the question to understand intent
    question_analysis = _analyze_question_type(message, concept_title)
    
    # Build conversation history
    history_text = ""
    if conversation_history:
        history_text = "\n".join([
            f"{msg.get('role', 'user').upper()}: {msg.get('content', '')}"
            for msg in conversation_history[-8:]  # Last 8 messages for context
        ])
    
    # Combine all sources FIRST (before using in prompt)
    all_sources = citations_list + additional_sources if used_new_sources else citations_list
    
    # Format protocol data
    protocol_text = f"Title: {protocol_json.get('title', concept_title)}\n"
    if 'checklist' in protocol_json:
        protocol_text += "Steps:\n"
        for step in protocol_json['checklist'][:10]:  # Limit to 10 steps
            step_num = step.get('step', 0)
            step_text = step.get('text', '')
            explanation = step.get('explanation', '')
            citation = step.get('citation', 0)
            protocol_text += f"{step_num}. {step_text}"
            if explanation:
                protocol_text += f" - {explanation[:100]}..."
            if citation:
                protocol_text += f" [Source {citation}]"
            protocol_text += "\n"
    
    # Format citations - PRIORITIZE new search results for follow-up questions
    citations_text = ""
    
    if used_new_sources and additional_sources:
        # Show NEW sources FIRST and in FULL (for follow-up questions)
        # Map to actual citation IDs from additional_citations
        citations_text = "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        citations_text += "🆕 NEW SOURCES (From fresh search - USE THESE FIRST):\n"
        citations_text += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        for idx, citation_obj in enumerate(additional_citations):
            citation_id = citation_obj.get('id', idx + 1)
            title = citation_obj.get('title', 'Unknown')
            excerpt = citation_obj.get('excerpt', '')
            # Show with actual citation ID
            citations_text += f"\n[{citation_id}] {title}\n{excerpt}\n"
        
        # Then show original sources as reference (if any)
        if citations_list:
            citations_text += "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            citations_text += "📚 ORIGINAL PROTOCOL SOURCES (Background context):\n"
            citations_text += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            for i, citation in enumerate(citations_list[:3], 1):
                citations_text += f"[Original {i}] {citation[:150]}...\n"
    else:
        # No new sources - just show original
        citations_text = "\nAvailable Sources:\n"
        for i, citation in enumerate(citations_list[:8], 1):
            citations_text += f"[Source {i}] {citation[:250]}...\n"
    
    # Format filters if any
    filters_text = ""
    if filters_json:
        filters_text = f"\nUser Filters: {filters_json}"

    # Enhanced prompt with question categorization
    question_category = question_analysis['primary_category']
    is_related = question_analysis['is_related_topic']
    
    # Add category-specific guidance
    category_guidance = {
        'dosage': 'Focus on specific dosage recommendations, adjustments based on patient factors, and administration guidelines.',
        'symptoms': 'Describe symptom progression, severity indicators, and how to differentiate from similar conditions.',
        'timing': 'Provide clear timelines, frequency schedules, and duration expectations.',
        'complications': 'Explain risk factors, early warning signs, and prevention strategies.',
        'safety': 'Emphasize contraindications, warning signs, and when to seek help.',
        'procedure': 'Give step-by-step instructions, required materials, and technique tips.',
        'comparison': 'Compare approaches objectively with evidence-based pros and cons. Use side-by-side comparison format.',
        'rationale': 'Explain the medical reasoning, evidence basis, and clinical decision factors.'
    }
    
    # Detect if this is a comparison question (mild vs severe, etc.)
    is_comparison_question = any(keyword in message.lower() for keyword in [
        'differentiate', 'difference', 'compare', 'vs', 'versus', 'between', 'mild vs severe'
    ])
    
    category_hint = category_guidance.get(question_category, 'Provide comprehensive, evidence-based information.')
    
    # Add special instructions for comparison questions
    if is_comparison_question:
        category_hint += "\n\n⚠️ COMPARISON FORMAT REQUIRED:\n"
        category_hint += "Structure your answer as:\n"
        category_hint += "**Mild/Early Stage:** [describe from sources] [Source N]\n"
        category_hint += "**Severe/Advanced Stage:** [describe from sources] [Source N]\n"
        category_hint += "**Key Differences:** [highlight distinguishing factors] [Source N]"
    
    # Simple prompt - lists for everything except tables
    if is_comparison_question:
        format_instruction = "Use a markdown TABLE to compare (| Column1 | Column2 |)."
    else:
        format_instruction = "Format as a BULLETED LIST using - for each point."
    
    prompt = f"""Answer this question about {concept_title}: {message}

Available sources:
{citations_text}

{f"Previous conversation:{chr(10)}{history_text}{chr(10)}" if history_text else ""}
Answer using information from the sources above. {format_instruction} Use **bold** for key medical terms. Cite sources as [N].

**Answer:**
<your answer>

**Follow-up questions:**
- <question 1>
- <question 2>
- <question 3>"""

    # Debug logging
    print(f"📝 Prompt: {len(prompt)} chars, {len(all_sources)} sources")
    if used_new_sources:
        print(f"🔍 New search: {len(additional_sources)} sources, IDs: {[c.get('id') for c in additional_citations]}")

    try:
        response = _model.generate_content(prompt)
        answer_text = _extract_text(response)
        
        print(f"🤖 AI Response: {answer_text[:200]}..." if len(answer_text) > 200 else f"🤖 AI Response: {answer_text}")
        
        if not answer_text:
            print("❌ Empty response from AI - using fallback")
            return _fallback_conversation_response(message, concept_title)
        
        # Parse the structured response directly (NO second AI call)
        result = _parse_conversation_response(answer_text, all_sources)
        result["used_new_sources"] = used_new_sources
        result["citations"] = additional_citations
        return result
        
    except Exception as e:
        print(f"❌ Exception in protocol_conversation_chat: {e}")
        import traceback
        traceback.print_exc()
        return _fallback_conversation_response(message, concept_title)


def _format_response_with_markdown(raw_response: str, question: str, is_comparison: bool) -> str:
    """
    Format AI response with proper markdown structure using a second AI call.
    Ensures tables for comparisons, lists for differences, proper headers, etc.
    """
    _ensure_client()
    
    question_lower = question.lower()
    
    # Detect question type
    is_comparison_question = is_comparison or any(keyword in question_lower for keyword in [
        'differentiate', 'difference', 'compare', 'vs', 'versus', 'between'
    ])
    is_list_question = any(keyword in question_lower for keyword in [
        'what are', 'list', 'types', 'kinds', 'categories', 'warning signs', 'symptoms'
    ])
    is_how_question = question_lower.startswith('how')
    
    # Build formatting instructions based on question type
    if is_comparison_question:
        format_instruction = """Format the response as a COMPARISON using this structure:

Use a markdown TABLE for side-by-side comparison (adapt column names based on what's being compared):

| Characteristic | Mild/Early Stage | Severe/Advanced Stage |
|----------------|-----------------|----------------------|
| Symptoms | Mild chest pressure, brief [1] | Intense crushing pain, prolonged [2] |
| Urgency | Monitor closely [3] | Immediate 911 call [4] |
| Duration | Minutes [5] | Sustained, worsening [6] |

**Key Differences:**
- **Severity**: Mild cases present with... [1] while severe cases show... [2]
- **Time Sensitivity**: Early intervention for mild [3], immediate emergency care for severe [4]
- **Risk Level**: Lower immediate danger [5] vs life-threatening emergency [6]

**When to Escalate:**
- Brief explanation of when mild becomes severe [7]

Use **bold** for emphasis.
Create clear distinctions between the two being compared.
Preserve all [N] citation numbers from the original response."""
        
    elif is_list_question:
        format_instruction = """Format the response as a STRUCTURED LIST with a brief intro:

Start with a one-sentence summary, then list items:

The critical warning signs of a heart attack include: [7]

**Primary Warning Signs:**
- **Chest Discomfort**: Uncomfortable pressure, squeezing, or pain in the center of the chest lasting more than a few minutes [7]
- **Shortness of Breath**: May occur with or without chest discomfort [8]
- **Upper Body Discomfort**: Pain or discomfort in arms, back, neck, jaw, or stomach [9]

**Additional Symptoms:**
- Cold sweat, nausea, or lightheadedness [10]

Use **bold** for important medical terms.
Group related items under descriptive headers.
Preserve all [N] citation numbers from the original response."""
        
    elif is_how_question:
        format_instruction = """Format the response as STEP-BY-STEP instructions:

**Steps:**

1. **Step 1**: Description with citations [1]
2. **Step 2**: Description with citations [2]
3. **Step 3**: Description with citations [3]

Use numbered lists for sequential steps.
Preserve all [N] citation numbers from the original response."""
        
    else:
        format_instruction = """Format the response with CLEAR STRUCTURE:

Use headers, bold text, and bullet points:

**Main Point**: Brief intro [1]

**Key Information:**
- Point 1 with citations [2]
- Point 2 with citations [3]

Use **bold** for medical terms and important concepts.
Preserve all [N] citation numbers from the original response."""
    
    formatting_prompt = f"""You are a markdown formatting expert. Format this medical response to be clear and well-structured.

ORIGINAL QUESTION: {question}

RAW RESPONSE TO FORMAT:
{raw_response}

FORMATTING REQUIREMENTS:
{format_instruction}

CRITICAL RULES:
1. Keep ALL citation numbers [N] exactly as they appear
2. Use proper markdown syntax (tables, lists, bold, headers)
3. Keep the content IDENTICAL - only improve structure
4. Do NOT add new information
5. Do NOT remove any citations
6. Return ONLY the formatted response, no explanations

FORMATTED RESPONSE:"""

    try:
        print(f"🎨 Question type: {'comparison' if is_comparison_question else 'list' if is_list_question else 'how-to' if is_how_question else 'general'}")
        print(f"📤 Sending formatting request to AI...")
        
        formatting_response = _model.generate_content(formatting_prompt)
        formatted_text = _extract_text(formatting_response)
        
        print(f"📥 Received formatted response (length: {len(formatted_text)} chars)")
        
        # Verify citations weren't lost
        import re
        original_citations = set(re.findall(r'\[(\d+)\]', raw_response))
        formatted_citations = set(re.findall(r'\[(\d+)\]', formatted_text))
        
        if len(formatted_citations) < len(original_citations) * 0.8:  # Lost more than 20% of citations
            print(f"⚠️ Formatting lost citations ({len(formatted_citations)}/{len(original_citations)}) - using original")
            return raw_response
            
        print(f"✅ Formatted response with {len(formatted_citations)} citations preserved")
        print(f"📊 Preview: {formatted_text[:150]}...")
        return formatted_text
        
    except Exception as e:
        print(f"⚠️ Formatting failed: {e} - using original response")
        import traceback
        traceback.print_exc()
        return raw_response


def _parse_conversation_response(response_text: str, citations_list: List[str]) -> Dict[str, Any]:
    """Parse the structured conversation response from Gemini"""
    response_text = response_text.strip()
    
    print(f"🔍 Parsing AI response (length: {len(response_text)} chars)")
    
    # Check for special NEW_SEARCH_NEEDED response first
    if "NEW_SEARCH_NEEDED" in response_text:
        return {
            "answer": "NEW_SEARCH_NEEDED",
            "uncertainty_note": None,
            "sources": [],
            "used_new_sources": False,
            "follow_up_questions": [],
            "updated_protocol": None
        }
    
    lines = response_text.split('\n')
    
    answer = ""
    uncertainty = None
    sources = []
    follow_ups = []
    
    current_section = None
    has_structured_format = False
    
    # Check if response has structured format
    if any(line.strip().lower().startswith(("answer:", "**answer")) for line in lines):
        has_structured_format = True
    
    # If no structured format, try to extract answer and follow-ups directly
    if not has_structured_format:
        print("⚠️ No structured format detected - using fallback parsing")
        # Split at follow-up questions
        response_parts = response_text.split('**Follow-up questions:**')
        if len(response_parts) == 1:
            response_parts = response_text.split('Follow-up questions:')
        
        # Everything before follow-up questions is the answer
        answer = response_parts[0].strip()
        
        # Extract follow-up questions if they exist
        if len(response_parts) > 1:
            follow_up_section = response_parts[1]
            for line in follow_up_section.split('\n'):
                line = line.strip()
                if line.startswith('- ') or line.startswith('* '):
                    question = line[2:].strip()
                    if question:
                        follow_ups.append({
                            "text": question,
                            "category": _categorize_follow_up(question)
                        })
    else:
        # Parse structured format
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Flexible matching - handle both "Answer:" and "**Answer:**"
            if line.lower().startswith("answer:") or line.lower().startswith("**answer"):
                current_section = "answer"
                # If answer is on the same line, extract it
                if ":" in line:
                    answer_part = line.split(":", 1)[1].strip()
                    if answer_part and not answer_part.startswith("*"):
                        answer = answer_part + " "
                continue
            elif line.lower().startswith("uncertainty") or line.lower().startswith("**uncertainty"):
                current_section = "uncertainty"
                continue
            elif line.lower().startswith("sources:") or line.lower().startswith("**sources"):
                current_section = "sources"
                continue
            elif "follow-up" in line.lower() and ("question" in line.lower() or "suggested" in line.lower()):
                # Matches: "Follow-up questions:", "**Follow-up questions:**", "Suggested follow-ups:"
                current_section = "follow_ups"
                continue
            
            if current_section == "answer":
                # Preserve markdown formatting - keep line breaks
                # Check for section headers (e.g., **Mild Stage:** or **Key Differences:**)
                is_header = ("**" in line and ":" in line) or line.startswith("**")
                is_bullet = line.startswith("-") or line.startswith("* ")
                
                if is_header:
                    # Section header - preserve with double line break before
                    answer += "\n\n" + line + "\n"
                elif is_bullet:
                    # Bullet point - preserve with single line break
                    answer += "\n" + line
                elif not line.strip():
                    # Empty line - preserve as paragraph break
                    answer += "\n"
                else:
                    # Regular text - append with space, but preserve line breaks between sentences
                    if answer and not answer.endswith("\n"):
                        answer += " " + line
                    else:
                        answer += line + " "
            elif current_section == "uncertainty":
                uncertainty = line
            elif current_section == "sources" and line.startswith("- "):
                sources.append(line[2:])  # Remove "- " prefix
            elif current_section == "follow_ups" and line.startswith("- "):
                follow_up_text = line[2:]  # Remove "- " prefix
                if follow_up_text:
                    follow_ups.append({
                        "text": follow_up_text,
                        "category": _categorize_follow_up(follow_up_text)
                    })
    
    # Clean up the answer: remove extra spaces, normalize line breaks
    parsed_answer = answer.strip()
    if parsed_answer:
        # Replace multiple spaces with single space
        import re
        parsed_answer = re.sub(r' +', ' ', parsed_answer)
        # Clean up line breaks
        parsed_answer = re.sub(r'\n\n+', '\n\n', parsed_answer)  # Max 2 line breaks
        parsed_answer = parsed_answer.strip()
    else:
        parsed_answer = "I can help you with questions about this protocol."
    
    print(f"✅ Parsed answer: {parsed_answer[:150]}...")
    print(f"📚 Parsed sources: {len(sources)}")
    print(f"❓ Parsed follow-ups: {len(follow_ups)}")
    if len(follow_ups) == 0:
        print("⚠️ WARNING: No follow-up questions detected! Check AI response format.")
    
    return {
        "answer": parsed_answer,
        "uncertainty_note": uncertainty,
        "sources": sources,
        "used_new_sources": False,  # For now, we're using existing sources
        "follow_up_questions": follow_ups[:5],  # Limit to 5
        "updated_protocol": None
    }


def _categorize_follow_up(question_text: str) -> str:
    """Categorize follow-up questions for better UX"""
    text_lower = question_text.lower()
    
    if any(word in text_lower for word in ['dose', 'dosage', 'mg', 'ml', 'medication', 'drug']):
        return "dosage"
    elif any(word in text_lower for word in ['symptom', 'sign', 'mild', 'severe', 'presentation']):
        return "symptoms"
    elif any(word in text_lower for word in ['complication', 'risk', 'side effect', 'adverse']):
        return "complications"
    elif any(word in text_lower for word in ['when', 'timing', 'how long', 'duration']):
        return "timing"
    elif any(word in text_lower for word in ['contraindication', 'avoid', 'caution', 'warning']):
        return "safety"
    else:
        return "general"


def _fallback_conversation_response(message: str, concept_title: str) -> Dict[str, Any]:
    """Fallback response when parsing fails"""
    return {
        "answer": f"I can help you with questions about {concept_title}. Could you please rephrase your question?",
        "uncertainty_note": None,
        "sources": [],
        "used_new_sources": False,
        "follow_up_questions": [
            {"text": "What are the key symptoms to monitor?", "category": "symptoms"},
            {"text": "What are the recommended dosages?", "category": "dosage"},
            {"text": "When should I seek immediate medical attention?", "category": "safety"}
        ],
        "updated_protocol": None
    }
