#!/usr/bin/env python3
"""
Test script for protocol conversation functionality
"""

import json
from models.protocol_models import ProtocolConversationRequest, ChatMessage
from services.gemini_service import protocol_conversation_chat

def test_conversation():
    """Test the protocol conversation chat functionality"""
    
    # Sample protocol data (like dengue fever)
    sample_protocol = {
        "title": "Dengue Fever Management Protocol",
        "checklist": [
            {
                "step": 1,
                "text": "Monitor fever and vital signs",
                "explanation": "Check temperature every 4 hours. Dengue causes high fever (39-40°C) with headache and body pain.",
                "citation": 1
            },
            {
                "step": 2,
                "text": "Assess for warning signs",
                "explanation": "Look for abdominal pain, persistent vomiting, bleeding, or plasma leakage signs.",
                "citation": 1
            },
            {
                "step": 3,
                "text": "Provide supportive care",
                "explanation": "Give paracetamol for fever. Maintain fluid balance. Avoid aspirin and NSAIDs.",
                "citation": 2
            }
        ]
    }
    
    sample_citations = [
        "WHO Guidelines for Dengue Management 2023 - Fever monitoring and assessment protocols",
        "CDC Dengue Treatment Guidelines - Supportive care and medication recommendations"
    ]
    
    # Test cases
    test_cases = [
        {
            "message": "What dosage of paracetamol should I give?",
            "expected_category": "dosage"
        },
        {
            "message": "What are the warning signs I should watch for?",
            "expected_category": "symptoms"
        },
        {
            "message": "When should I seek immediate medical attention?",
            "expected_category": "safety"
        }
    ]
    
    print("🧪 Testing Protocol Conversation Chat")
    print("=" * 50)
    
    for i, test_case in enumerate(test_cases, 1):
        print(f"\n📝 Test Case {i}: {test_case['message']}")
        print("-" * 30)
        
        try:
            # Test the conversation function
            result = protocol_conversation_chat(
                message=test_case["message"],
                concept_title="Dengue Fever Management",
                protocol_json=sample_protocol,
                citations_list=sample_citations,
                filters_json=None,
                conversation_history=[]
            )
            
            print(f"✅ Answer: {result.get('answer', 'No answer')}")
            print(f"⚠️  Uncertainty: {result.get('uncertainty_note', 'None')}")
            print(f"📚 Sources: {len(result.get('sources', []))} sources")
            print(f"🔄 Used new sources: {result.get('used_new_sources', False)}")
            
            follow_ups = result.get('follow_up_questions', [])
            print(f"💡 Follow-up questions ({len(follow_ups)}):")
            for j, fq in enumerate(follow_ups[:3], 1):
                category = fq.get('category', 'general')
                text = fq.get('text', '')
                print(f"   {j}. [{category}] {text}")
            
        except Exception as e:
            print(f"❌ Error: {str(e)}")
    
    print(f"\n🎉 Test completed!")

if __name__ == "__main__":
    test_conversation()
