"""
Content Moderation Service
Uses LLM to intelligently validate user input with domain-specific validation
"""

import json
from typing import Dict, Optional
from config.settings import settings

# Import Gemini API
try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False


class ContentModerationService:
    """Service for moderating user input content using LLM"""

    MODERATION_SYSTEM_PROMPT = """You are a content moderation system for ProCheck, a medical protocol search platform.

ProCheck specializes in these medical topics:
- Infectious diseases (dengue, malaria, COVID-19)
- Emergency conditions (heart attack, stroke, asthma attack, cardiac arrest)
- Chronic disease management (diabetes, hypertension)
- Emergency protocols (CPR, FAST test, first aid)
- Preventive care (mosquito-borne diseases, vaccinations)
- Common conditions (fever, wounds, allergies)
- Pediatric and geriatric care

Your job is to categorize user queries into ONE of these categories:

1. **in_scope**: Medical questions that match ProCheck's domain (infectious diseases, emergencies, chronic diseases, etc.)
   - Example: "dengue fever symptoms", "heart attack treatment", "diabetes management"

2. **out_of_scope_medical**: Medical/health questions OUTSIDE ProCheck's specific domain
   - Example: "pregnancy nutrition", "mental health counseling", "cosmetic surgery options"
   - These are valid medical topics but not in ProCheck's index

3. **harmful**: Dangerous, illegal, or harmful content
   - Example: "how to make poison", "suicide methods", "drug synthesis"

4. **irrelevant**: Completely non-medical topics
   - Example: "pizza recipe", "football scores", "stock trading tips"

5. **too_short**: Queries with less than 3 characters
   - Example: "hi", "ok", "a"

RESPONSE FORMAT:
Respond ONLY with valid JSON in this exact format:
{
  "valid": true/false,
  "category": "in_scope"|"out_of_scope_medical"|"harmful"|"irrelevant"|"too_short",
  "reason": "User-friendly message explaining why (null if valid)",
  "confidence": 0.0-1.0,
  "suggestion": "Optional suggestion for out_of_scope_medical queries"
}

EXAMPLES:

Query: "dengue fever symptoms"
{"valid": true, "category": "in_scope", "reason": null, "confidence": 0.95, "suggestion": null}

Query: "how to treat malaria"
{"valid": true, "category": "in_scope", "reason": null, "confidence": 0.95, "suggestion": null}

Query: "pregnancy diet recommendations"
{"valid": false, "category": "out_of_scope_medical", "reason": "This is a valid medical question, but ProCheck currently focuses on infectious diseases, emergency protocols, and chronic disease management. We don't have pregnancy-specific protocols in our database.", "confidence": 0.90, "suggestion": "Try searching for emergency protocols, infectious diseases, or chronic conditions."}

Query: "how to make a bomb"
{"valid": false, "category": "harmful", "reason": "This query contains potentially harmful or dangerous content. ProCheck is designed for medical protocol queries only. Please ask a healthcare-related question.", "confidence": 0.99, "suggestion": null}

Query: "best pizza recipe"
{"valid": false, "category": "irrelevant", "reason": "This query is not related to medical or healthcare topics. ProCheck specializes in medical protocols for infectious diseases, emergencies, and chronic conditions.", "confidence": 0.95, "suggestion": "Try asking about medical symptoms, treatments, or emergency protocols."}



Query: "mental health depression treatment"
{"valid": false, "category": "out_of_scope_medical", "reason": "Mental health is an important medical topic, but ProCheck currently focuses on infectious diseases, emergency medical protocols, and chronic physical conditions. We don't have mental health protocols in our database.", "confidence": 0.85, "suggestion": "Try searching for emergency medical conditions, infectious diseases, or chronic disease management."}

Now analyze this query:"""

    @staticmethod
    def validate_query(query: str) -> Dict[str, any]:
        """
        Validate user query using LLM with domain-specific categorization

        Args:
            query: User's search query or message

        Returns:
            Dict with 'valid', 'reason', 'category', 'confidence', and 'suggestion'
        """
        # Basic checks
        if not query or not query.strip():
            return {
                'valid': False,
                'reason': 'Query cannot be empty. Please enter a medical question or search term.',
                'category': 'empty',
                'confidence': 1.0,
                'suggestion': None
            }

        # Check for greetings (hi, hello, hey, etc.)
        query_lower = query.strip().lower()
        greetings = ['hi', 'hello', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening', 'hola', 'namaste']
        if query_lower in greetings or any(query_lower.startswith(g) for g in greetings):
            return {
                'valid': False,
                'reason': 'Hello! Welcome to ProCheck. I\'m here to help you find medical protocols and emergency information.',
                'category': 'greeting',
                'confidence': 1.0,
                'suggestion': 'To get started, try asking a medical question'
            }

        if len(query.strip()) < 2:
            return {
                'valid': False,
                'reason': 'Query is too short. Please provide more details about your medical question.',
                'category': 'too_short',
                'confidence': 1.0,
                'suggestion': None
            }

        # Use LLM for intelligent content moderation
        if GEMINI_AVAILABLE and settings.GEMINI_API_KEY:
            try:
                genai.configure(api_key=settings.GEMINI_API_KEY)
                model = genai.GenerativeModel(
                    model_name=settings.GEMINI_MODEL,
                    generation_config={
                        "temperature": 0.1,  # Low temperature for consistent moderation
                        "top_p": 0.95,
                        "top_k": 40,
                        "max_output_tokens": 300,
                    }
                )

                # Create the full prompt
                full_prompt = f"{ContentModerationService.MODERATION_SYSTEM_PROMPT}\n\nQuery: \"{query}\"\nResponse:"

                # Get LLM response
                response = model.generate_content(full_prompt)
                response_text = response.text.strip()

                # Parse JSON response
                # Remove markdown code blocks if present
                if response_text.startswith('```json'):
                    response_text = response_text.split('```json')[1].split('```')[0].strip()
                elif response_text.startswith('```'):
                    response_text = response_text.split('```')[1].split('```')[0].strip()

                result = json.loads(response_text)

                # Validate response structure
                if 'valid' in result and 'category' in result:
                    return {
                        'valid': result.get('valid', False),
                        'reason': result.get('reason'),
                        'category': result.get('category', 'unknown'),
                        'confidence': result.get('confidence', 0.5),
                        'suggestion': result.get('suggestion')
                    }
                else:
                    # Fallback if LLM response is malformed
                    print(f"⚠️ LLM moderation returned invalid format: {response_text}")
                    return ContentModerationService._fallback_validation(query)

            except json.JSONDecodeError as e:
                print(f"⚠️ Failed to parse LLM moderation response: {e}")
                print(f"⚠️ Raw response: {response_text}")
                return ContentModerationService._fallback_validation(query)
            except Exception as e:
                print(f"⚠️ LLM moderation error: {e}")
                return ContentModerationService._fallback_validation(query)
        else:
            # Fallback to basic validation if Gemini is not available
            print("⚠️ Gemini not available, using fallback validation")
            return ContentModerationService._fallback_validation(query)

    @staticmethod
    def _fallback_validation(query: str) -> Dict[str, any]:
        """
        Fallback validation using simple heuristics when LLM is unavailable
        """
        query_lower = query.lower()

        # Simple harmful keywords check
        harmful_keywords = ['bomb', 'weapon', 'kill', 'murder', 'suicide', 'hack', 'exploit', 'poison']
        if any(keyword in query_lower for keyword in harmful_keywords):
            return {
                'valid': False,
                'reason': 'This query may contain inappropriate content. Please ask a medical-related question.',
                'category': 'harmful',
                'confidence': 0.7,
                'suggestion': None
            }

        # Simple medical keywords check
        medical_keywords = [
            'symptom', 'disease', 'treatment', 'fever', 'pain', 'doctor', 'hospital',
            'dengue', 'malaria', 'covid', 'heart', 'stroke', 'diabetes', 'asthma'
        ]
        has_medical = any(keyword in query_lower for keyword in medical_keywords)

        if not has_medical:
            return {
                'valid': False,
                'reason': 'This query does not appear to be medical-related. ProCheck specializes in medical protocols.',
                'category': 'irrelevant',
                'confidence': 0.6,
                'suggestion': 'Try asking about medical symptoms, treatments, or emergency protocols.'
            }

        # By default, allow the query (lenient fallback)
        return {
            'valid': True,
            'reason': None,
            'category': 'in_scope',
            'confidence': 0.5,
            'suggestion': None
        }

    @staticmethod
    def validate_protocol_generation(title: str, instructions: Optional[str] = None) -> Dict[str, any]:
        """
        Validate protocol generation requests

        Args:
            title: Protocol title
            instructions: Optional custom instructions

        Returns:
            Dict with 'valid', 'reason', 'category', 'confidence', and 'suggestion'
        """
        # Validate title
        title_validation = ContentModerationService.validate_query(title)
        if not title_validation['valid']:
            return title_validation

        # Validate instructions if provided
        if instructions and instructions.strip():
            instructions_validation = ContentModerationService.validate_query(instructions)
            if not instructions_validation['valid']:
                return {
                    'valid': False,
                    'reason': f"Instructions contain inappropriate content: {instructions_validation['reason']}",
                    'category': instructions_validation['category'],
                    'confidence': instructions_validation['confidence'],
                    'suggestion': instructions_validation.get('suggestion')
                }

        return {
            'valid': True,
            'reason': None,
            'category': 'in_scope',
            'confidence': title_validation['confidence'],
            'suggestion': None
        }


# Singleton instance
content_moderator = ContentModerationService()
