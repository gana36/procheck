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
    
    # Base instructions - STRICT SOURCE-BASED GENERATION
    base_instructions = [
        "You are a medical AI assistant. Your ONLY job is to extract information from the provided sources below.",
        "",
        "⚠️ CRITICAL RULES - VIOLATING THESE IS UNACCEPTABLE:",
        "1. ONLY use information EXPLICITLY stated in the [Source N] snippets below",
        "2. DO NOT add any information from your general knowledge",
        "3. DO NOT make assumptions or extrapolate beyond what the sources say",
        "4. If the sources don't contain information about the query, create fewer steps (3-4 is fine)",
        "5. Every single fact MUST come from the provided sources",
        "",
        "RESPONSE FORMAT:",
        "1. Each step has TWO parts:",
        "   - 'text': Short action (under 15 words) extracted from sources",
        "   - 'explanation': Detailed how-to (2-3 sentences) extracted from sources",
        "2. REPHRASE in your own words but DON'T add new information",
        "3. EXTRACT the citation number from [Source N] tags",
        "4. ONLY include information DIRECTLY related to the query '{title}'",
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
        "⛔ ABSOLUTE FILTERING RULES:",
        "- If a source discusses a DIFFERENT disease/condition, SKIP IT ENTIRELY",
        "- Example: Query is 'dengue treatment', source mentions COVID-19 → IGNORE that source",
        "- ONLY extract information that DIRECTLY answers the query: {title}",
        "- DO NOT include general medical advice not in the sources",
        "- DO NOT add safety warnings unless they're in the sources",
        "- Better to have 3-4 accurate steps from sources than 10 steps with made-up content",
        "",
        "✅ VALIDATION CHECKLIST:",
        "Before including any step, ask yourself:",
        "- Is this EXACTLY from one of the [Source N] snippets? ✓",
        "- Does this DIRECTLY relate to '{title}'? ✓",
        "- Did I cite the correct [Source N]? ✓",
        "- Did I avoid adding my own medical knowledge? ✓",
    ])
    
    if region:
        prompt_parts.append(f"Region: {region}.")
    if year:
        prompt_parts.append(f"Year: {year}.")
    if instructions:
        prompt_parts.append(f"Instructions: {instructions}")

    prompt_parts.append("")
    prompt_parts.append("="*80)
    prompt_parts.append(f"QUERY: {title}")
    prompt_parts.append("="*80)
    prompt_parts.append("")
    prompt_parts.append("🔍 AVAILABLE SOURCES (These are your ONLY source of truth):")
    prompt_parts.append("Each source is labeled [Source N]. You MUST cite the source number.")
    prompt_parts.append("")
    
    # Add sources with clear separation
    for i, snippet in enumerate(context_snippets[:6], 1):
        prompt_parts.append(f"━━━ SOURCE [{i}] ━━━")
        prompt_parts.append(snippet)
        prompt_parts.append("")
    
    prompt_parts.append("="*80)
    prompt_parts.append("⚠️ REMINDER: Use ONLY the information above. Do NOT add external knowledge.")
    prompt_parts.append(f"⚠️ REMINDER: Only include steps relevant to: {title}")
    prompt_parts.append("="*80)

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
    
    return {
        'categories': detected_categories,
        'primary_category': detected_categories[0] if detected_categories else 'general',
        'is_related_topic': topic_overlap > 0.3 or len(message) < 100,  # Short questions usually related
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
    conversation_history: Optional[List[Dict[str, str]]] = None
) -> Dict[str, Any]:
    """
    Handle protocol-level conversational chat.
    Users can ask follow-up questions about the entire protocol/concept.
    Enhanced with intelligent context detection and smart follow-up generation.
    """
    _ensure_client()
    
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
    
    # Format citations
    citations_text = ""
    if citations_list:
        citations_text = "\nAvailable Sources:\n"
        for i, citation in enumerate(citations_list[:5], 1):
            citations_text += f"[Source {i}] {citation[:200]}...\n"
    
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
        'comparison': 'Compare approaches objectively with evidence-based pros and cons.',
        'rationale': 'Explain the medical reasoning, evidence basis, and clinical decision factors.'
    }
    
    category_hint = category_guidance.get(question_category, 'Provide comprehensive, evidence-based information.')
    
    prompt = f"""You are ProCheck's clinical assistant. Current protocol context: "{concept_title}".

🔍 QUESTION ANALYSIS:
- Category: {question_category}
- Related to current protocol: {is_related}
- Topic overlap: {question_analysis['topic_overlap']:.0%}

🎯 RESPONSE STRATEGY:
{category_hint}

⚠️ CRITICAL INSTRUCTIONS:
1. The user is asking about "{concept_title}" protocol
2. You MUST answer using ONLY the Available Sources below
3. If the question is about a DIFFERENT medical condition → Return ONLY "NEW_SEARCH_NEEDED"
4. DO NOT add information from your general medical knowledge
5. If sources don't fully answer the question, say so in the Uncertainty note

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT PROTOCOL CONTEXT:
{protocol_text}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AVAILABLE SOURCES (Your ONLY source of information):
{citations_text}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{f"Recent Conversation:{chr(10)}{history_text}{chr(10)}" if history_text else ""}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
USER QUESTION: {message}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 RESPONSE REQUIREMENTS:

1. **Topic Check:**
   - Same/related condition → Normal response
   - Different condition (e.g., heart attack when discussing dengue) → Return "NEW_SEARCH_NEEDED"
   - If uncertain → Continue conversation

2. **Formatting (CRITICAL):**
   - Use **bold** for: medical terms, symptoms, medications, dosages, warnings
   - Use bullet points (- ) for lists
   - Use numbered lists (1. 2. 3.) for sequential steps
   - Cite sources inline: [Source 1], [Source 2]
   - Keep paragraphs short (2-4 sentences max)

3. **Content Structure (USE ONLY SOURCE INFORMATION):**
   - Start with direct answer (1-2 sentences) - FROM SOURCES
   - Provide clinical rationale (why/how) - FROM SOURCES  
   - Include practical considerations (when/where/how much) - FROM SOURCES
   - Add safety notes ONLY if they're in the sources
   - If sources don't cover an aspect, DON'T make it up

4. **Evidence & Uncertainty (MANDATORY):**
   - EVERY fact must cite a source: [Source N]
   - If you're using information not from sources → DON'T include it
   - If sources don't fully answer the question → Add uncertainty note
   - If sources conflict → Mention both perspectives with citations
   - Prefer quantitative data from sources (percentages, time frames)

5. **Follow-up Questions:**
   - Generate 3-5 SMART questions
   - Avoid repeating the current question topic
   - Cover unexplored aspects of the protocol
   - Be specific to "{concept_title}" (not generic)
   - Categories to consider: dosage, symptoms, timing, complications, safety, procedure

📤 OUTPUT FORMAT:

Answer:
<2-6 sentences with **bold medical terms**, inline [Source N] citations, proper markdown>

Uncertainty (omit if none):
<brief note about limited/conflicting evidence>

Sources:
- [1] <citation details>
- [2] <citation details>

Suggested follow-ups:
- <Question about unexplored aspect 1>
- <Question about unexplored aspect 2>
- <Question about unexplored aspect 3>
- <Question about clinical consideration>
- <Question about practical application>

🎯 EXAMPLE RESPONSE:

Answer:
**Paracetamol** (acetaminophen) is the recommended antipyretic for **dengue fever**, typically dosed at **500-1000mg every 6 hours** for adults [Source 1]. **Avoid NSAIDs** (aspirin, ibuprofen) as they increase bleeding risk due to platelet dysfunction in dengue [Source 2]. Monitor for **warning signs** such as severe abdominal pain or persistent vomiting, which indicate progression to severe dengue [Source 1].

Sources:
- [1] WHO Dengue Guidelines 2009
- [2] CDC Dengue Treatment Recommendations

Suggested follow-ups:
- What symptoms indicate I need to reduce or stop paracetamol?
- How long should I continue fever monitoring?
- What are the early warning signs of dengue hemorrhagic fever?
- When should platelet counts be checked?
- What fluid intake is recommended during dengue recovery?

Now provide your response:"""

    try:
        response = _model.generate_content(prompt)
        answer_text = _extract_text(response)
        
        if not answer_text:
            return _fallback_conversation_response(message, concept_title)
        
        # Parse the structured response
        return _parse_conversation_response(answer_text, citations_list)
        
    except Exception as e:
        return _fallback_conversation_response(message, concept_title)


def _parse_conversation_response(response_text: str, citations_list: List[str]) -> Dict[str, Any]:
    """Parse the structured conversation response from Gemini"""
    response_text = response_text.strip()
    
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
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        if line.startswith("Answer:"):
            current_section = "answer"
            continue
        elif line.startswith("Uncertainty"):
            current_section = "uncertainty"
            continue
        elif line.startswith("Sources:"):
            current_section = "sources"
            continue
        elif line.startswith("Suggested follow-ups:"):
            current_section = "follow_ups"
            continue
        
        if current_section == "answer":
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
    
    return {
        "answer": answer.strip() or "I can help you with questions about this protocol.",
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
