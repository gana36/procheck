# Protocol Conversation Chat Integration Guide

## Overview

The Protocol Conversation Chat system allows users to have ongoing discussions about a specific medical protocol/concept. Users can ask follow-up questions and get contextual answers with suggested next questions (similar to Perplexity Pro).

## Key Features

✅ **Concept-Confined Chat** - All conversations stay within the original protocol concept  
✅ **Contextual Answers** - Responses are grounded in the protocol data and citations  
✅ **Follow-up Suggestions** - 3-5 categorized follow-up questions after each response  
✅ **Citation Support** - Inline source references with uncertainty notes when needed  
✅ **Conversation History** - Maintains context across multiple exchanges  

## API Endpoint

### POST `/protocols/conversation`

**Request Model:**
```typescript
interface ProtocolConversationRequest {
  message: string;                    // User's follow-up question
  concept_title: string;              // Original protocol concept (e.g., "Dengue Fever Management")
  protocol_json: {                    // Current protocol data
    title: string;
    checklist: Array<{
      step: number;
      text: string;
      explanation?: string;
      citation?: number;
    }>;
  };
  citations_list: string[];           // Available source citations
  filters_json?: object;              // Optional user filters
  conversation_history?: Array<{      // Chat history for context
    role: "user" | "assistant";
    content: string;
  }>;
}
```

**Response Model:**
```typescript
interface ProtocolConversationResponse {
  answer: string;                     // Main response (2-6 sentences)
  uncertainty_note?: string;          // Optional uncertainty disclaimer
  sources: string[];                  // Source citations used
  used_new_sources: boolean;          // Whether new retrieval was needed
  follow_up_questions: Array<{        // Suggested follow-ups
    text: string;
    category?: "dosage" | "symptoms" | "complications" | "timing" | "safety" | "general";
  }>;
  updated_protocol?: object;          // Optional protocol updates
}
```

## Frontend Integration Examples

### 1. React Hook for Protocol Chat

```typescript
// hooks/useProtocolChat.ts
import { useState } from 'react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  followUps?: FollowUpQuestion[];
  uncertainty?: string;
  sources?: string[];
}

interface FollowUpQuestion {
  text: string;
  category?: string;
}

export const useProtocolChat = (protocol: any, conceptTitle: string) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async (message: string) => {
    setIsLoading(true);
    
    // Add user message
    const userMessage: ChatMessage = { role: 'user', content: message };
    setMessages(prev => [...prev, userMessage]);

    try {
      const response = await fetch('/api/protocols/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          concept_title: conceptTitle,
          protocol_json: protocol,
          citations_list: protocol.citations || [],
          conversation_history: messages.map(m => ({ role: m.role, content: m.content }))
        })
      });

      const result = await response.json();
      
      // Add assistant response
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: result.answer,
        followUps: result.follow_up_questions,
        uncertainty: result.uncertainty_note,
        sources: result.sources
      };
      
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return { messages, sendMessage, isLoading };
};
```

### 2. Chat Interface Component

```tsx
// components/ProtocolChat.tsx
import React, { useState } from 'react';
import { useProtocolChat } from '../hooks/useProtocolChat';

interface ProtocolChatProps {
  protocol: any;
  conceptTitle: string;
}

export const ProtocolChat: React.FC<ProtocolChatProps> = ({ protocol, conceptTitle }) => {
  const [input, setInput] = useState('');
  const { messages, sendMessage, isLoading } = useProtocolChat(protocol, conceptTitle);

  const handleSend = async () => {
    if (input.trim()) {
      await sendMessage(input);
      setInput('');
    }
  };

  const handleFollowUpClick = (question: string) => {
    sendMessage(question);
  };

  return (
    <div className="protocol-chat">
      {/* Chat Header */}
      <div className="chat-header">
        <h3>Ask about: {conceptTitle}</h3>
        <p className="text-sm text-gray-600">
          Ask follow-up questions about this protocol
        </p>
      </div>

      {/* Messages */}
      <div className="messages-container">
        {messages.map((message, index) => (
          <div key={index} className={`message ${message.role}`}>
            <div className="message-content">
              {message.content}
            </div>
            
            {/* Uncertainty Note */}
            {message.uncertainty && (
              <div className="uncertainty-note">
                ⚠️ {message.uncertainty}
              </div>
            )}
            
            {/* Sources */}
            {message.sources && message.sources.length > 0 && (
              <div className="sources">
                <strong>Sources:</strong>
                <ul>
                  {message.sources.map((source, i) => (
                    <li key={i}>{source}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Follow-up Questions */}
            {message.followUps && message.followUps.length > 0 && (
              <div className="follow-ups">
                <p className="follow-ups-label">Suggested questions:</p>
                <div className="follow-up-chips">
                  {message.followUps.map((fq, i) => (
                    <button
                      key={i}
                      className={`follow-up-chip category-${fq.category || 'general'}`}
                      onClick={() => handleFollowUpClick(fq.text)}
                    >
                      {fq.text}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="chat-input">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask a follow-up question..."
          disabled={isLoading}
        />
        <button onClick={handleSend} disabled={isLoading || !input.trim()}>
          {isLoading ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
};
```

### 3. CSS Styling

```css
/* styles/protocol-chat.css */
.protocol-chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-width: 800px;
  margin: 0 auto;
}

.chat-header {
  padding: 1rem;
  border-bottom: 1px solid #e5e7eb;
  background: #f9fafb;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  space-y: 1rem;
}

.message {
  margin-bottom: 1.5rem;
}

.message.user .message-content {
  background: #3b82f6;
  color: white;
  padding: 0.75rem 1rem;
  border-radius: 1rem 1rem 0.25rem 1rem;
  margin-left: auto;
  max-width: 80%;
}

.message.assistant .message-content {
  background: #f3f4f6;
  padding: 0.75rem 1rem;
  border-radius: 1rem 1rem 1rem 0.25rem;
  max-width: 80%;
}

.uncertainty-note {
  background: #fef3c7;
  border: 1px solid #f59e0b;
  padding: 0.5rem;
  border-radius: 0.5rem;
  margin-top: 0.5rem;
  font-size: 0.875rem;
}

.sources {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: #6b7280;
}

.follow-ups {
  margin-top: 1rem;
}

.follow-ups-label {
  font-weight: 500;
  margin-bottom: 0.5rem;
  color: #374151;
}

.follow-up-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.follow-up-chip {
  background: #e5e7eb;
  border: none;
  padding: 0.5rem 0.75rem;
  border-radius: 1rem;
  cursor: pointer;
  font-size: 0.875rem;
  transition: background-color 0.2s;
}

.follow-up-chip:hover {
  background: #d1d5db;
}

/* Category-specific colors */
.category-dosage { background: #dbeafe; color: #1e40af; }
.category-symptoms { background: #fef3c7; color: #92400e; }
.category-complications { background: #fecaca; color: #dc2626; }
.category-timing { background: #d1fae5; color: #065f46; }
.category-safety { background: #fde68a; color: #92400e; }

.chat-input {
  display: flex;
  padding: 1rem;
  border-top: 1px solid #e5e7eb;
  gap: 0.5rem;
}

.chat-input input {
  flex: 1;
  padding: 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  outline: none;
}

.chat-input button {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  cursor: pointer;
}

.chat-input button:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}
```

## Usage Flow

1. **Initialize Chat** - When user generates a protocol, show the chat interface
2. **First Question** - User asks a follow-up question about the protocol
3. **Get Response** - System provides contextual answer with follow-up suggestions
4. **Continue Conversation** - User can ask more questions or click suggested follow-ups
5. **Maintain Context** - All responses stay within the original protocol concept

## Example Integration in Protocol View

```tsx
// In your protocol display component
const [showChat, setShowChat] = useState(false);

return (
  <div className="protocol-view">
    {/* Protocol Display */}
    <div className="protocol-content">
      {/* Your existing protocol UI */}
    </div>
    
    {/* Chat Toggle */}
    <button 
      className="chat-toggle"
      onClick={() => setShowChat(!showChat)}
    >
      💬 Ask Questions
    </button>
    
    {/* Chat Interface */}
    {showChat && (
      <div className="chat-sidebar">
        <ProtocolChat 
          protocol={protocolData} 
          conceptTitle={protocolData.title} 
        />
      </div>
    )}
  </div>
);
```

## Benefits

- **Enhanced User Experience** - Users can get immediate clarification on protocol details
- **Contextual Learning** - Answers are always relevant to the specific protocol
- **Guided Discovery** - Follow-up suggestions help users explore related topics
- **Evidence-Based** - All responses are grounded in the protocol's source citations
- **Conversation Flow** - Natural chat experience with maintained context

This creates a powerful, Perplexity-like experience specifically tailored for medical protocol discussions!
