/**
 * Chat System Utilities
 * Helper functions for chat flow, follow-up detection, and context management
 */

import { Message, ProtocolData, FollowUpQuestion } from '@/types';

// ============================================================================
// FOLLOW-UP DETECTION
// ============================================================================

export interface FollowUpAnalysis {
  isFollowUp: boolean;
  lastProtocol?: ProtocolData;
  confidence: number;
  reason: string;
}

/**
 * Keywords that indicate a follow-up question
 */
const FOLLOW_UP_KEYWORDS = {
  dosage: ['dosage', 'dose', 'how much', 'how many', 'mg', 'ml', 'amount', 'quantity'],
  symptoms: ['symptom', 'sign', 'feel', 'looks like', 'presentation', 'manifest', 'indicate'],
  timing: ['when', 'how long', 'duration', 'frequency', 'how often', 'timing', 'schedule'],
  complications: ['complication', 'risk', 'side effect', 'adverse', 'danger', 'problem', 'worse'],
  safety: ['safe', 'avoid', 'caution', 'warning', 'contraindication', 'dangerous', 'unsafe'],
  procedure: ['how to', 'procedure', 'steps', 'technique', 'method', 'perform', 'do'],
  comparison: ['compare', 'difference', 'versus', 'vs', 'alternative', 'instead', 'better'],
  rationale: ['why', 'reason', 'because', 'explain', 'rationale', 'purpose', 'how come'],
};

/**
 * Detect if a query is a follow-up question to an existing protocol
 */
export function detectFollowUp(content: string, messages: Message[]): FollowUpAnalysis {
  const contentLower = content.toLowerCase();
  
  // Find the most recent protocol (within last 10 messages)
  let lastProtocol: ProtocolData | undefined;
  for (let i = messages.length - 1; i >= Math.max(0, messages.length - 10); i--) {
    const msg = messages[i];
    if (msg.type === 'assistant' && msg.protocolData) {
      lastProtocol = msg.protocolData;
      break;
    }
  }

  // No protocol found -> not a follow-up
  if (!lastProtocol) {
    return {
      isFollowUp: false,
      confidence: 1.0,
      reason: 'No existing protocol in conversation'
    };
  }

  // Check for follow-up keywords
  let hasFollowUpKeyword = false;
  let matchedCategory = '';
  
  for (const [category, keywords] of Object.entries(FOLLOW_UP_KEYWORDS)) {
    for (const keyword of keywords) {
      if (contentLower.includes(keyword)) {
        hasFollowUpKeyword = true;
        matchedCategory = category;
        break;
      }
    }
    if (hasFollowUpKeyword) break;
  }

  // Short questions are likely follow-ups
  const isShortQuestion = content.length < 100;

  // Calculate topic overlap with protocol title
  const protocolWords = new Set(lastProtocol.title.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const contentWords = new Set(contentLower.split(/\s+/).filter(w => w.length > 3));
  const overlap = [...protocolWords].filter(w => contentWords.has(w)).length;
  const topicSimilarity = protocolWords.size > 0 ? overlap / protocolWords.size : 0;

  // Decision logic
  if (hasFollowUpKeyword && isShortQuestion) {
    return {
      isFollowUp: true,
      lastProtocol,
      confidence: 0.9,
      reason: `Follow-up keyword detected (${matchedCategory}) + short query`
    };
  }

  if (hasFollowUpKeyword && topicSimilarity > 0.3) {
    return {
      isFollowUp: true,
      lastProtocol,
      confidence: 0.85,
      reason: `Follow-up keyword (${matchedCategory}) + topic similarity ${(topicSimilarity * 100).toFixed(0)}%`
    };
  }

  if (isShortQuestion && topicSimilarity > 0.5) {
    return {
      isFollowUp: true,
      lastProtocol,
      confidence: 0.75,
      reason: `Short query + high topic similarity ${(topicSimilarity * 100).toFixed(0)}%`
    };
  }

  // Likely a new protocol request
  return {
    isFollowUp: false,
    lastProtocol,
    confidence: 0.7,
    reason: 'Appears to be a new topic'
  };
}

// ============================================================================
// INTENT CLASSIFICATION
// ============================================================================

export type QueryIntent = 'emergency' | 'symptoms' | 'treatment' | 'diagnosis' | 'prevention' | 'general';

/**
 * Classify query intent for appropriate formatting
 */
export function classifyQueryIntent(query: string): QueryIntent {
  const q = query.toLowerCase();

  if (q.match(/\b(emergency|urgent|attack|crisis|acute|severe|critical|immediate)\b/)) {
    return 'emergency';
  }

  if (q.match(/\b(treatment|manage|therapy|medication|drug|protocol|treat)\b/)) {
    return 'treatment';
  }

  if (q.match(/\b(symptom|sign|presentation|manifest)\b/)) {
    return 'symptoms';
  }

  if (q.match(/\b(diagnos|differential|test|screening|evaluation)\b/)) {
    return 'diagnosis';
  }

  if (q.match(/\b(prevent|prophylaxis|avoid|protect)\b/)) {
    return 'prevention';
  }

  return 'general';
}

/**
 * Get intent-specific message prefix
 */
export function getIntentPrefix(intent: QueryIntent): string {
  const prefixes: Record<QueryIntent, string> = {
    emergency: 'Emergency Protocol - Immediate actions required:',
    symptoms: 'Symptom Overview - Clinical presentation:',
    treatment: 'Treatment Protocol - Medical interventions:',
    diagnosis: 'Diagnostic Approach - Assessment criteria:',
    prevention: 'Prevention Guide - Protective measures:',
    general: 'Medical Protocol - Key information:',
  };
  return prefixes[intent];
}

// ============================================================================
// FOLLOW-UP QUESTION GENERATION
// ============================================================================

export interface GenerateFollowUpsOptions {
  intent: QueryIntent;
  protocolTitle: string;
  askedQuestions?: string[]; // Previously asked questions to avoid
}

/**
 * Generate contextual follow-up questions based on intent
 */
export function generateFollowUpQuestions(options: GenerateFollowUpsOptions): FollowUpQuestion[] {
  const { intent, askedQuestions = [] } = options;

  const baseQuestions: FollowUpQuestion[] = [
    { text: "What are the recommended dosages?", category: "dosage" },
    { text: "What symptoms should I monitor?", category: "symptoms" },
    { text: "When should I seek immediate help?", category: "safety" },
    { text: "What are potential complications?", category: "complications" },
    { text: "How often should I check progress?", category: "timing" }
  ];

  const intentSpecificQuestions: Record<QueryIntent, FollowUpQuestion[]> = {
    emergency: [
      { text: "What are the critical warning signs?", category: "safety" },
      { text: "How quickly should I act?", category: "timing" },
      { text: "What should I avoid doing?", category: "safety" }
    ],
    treatment: [
      { text: "What are the side effects to watch for?", category: "complications" },
      { text: "How long does treatment take?", category: "timing" },
      { text: "What if the treatment isn't working?", category: "complications" }
    ],
    symptoms: [
      { text: "How do I differentiate mild vs severe symptoms?", category: "symptoms" },
      { text: "What symptoms indicate worsening?", category: "complications" },
      { text: "When do symptoms typically appear?", category: "timing" }
    ],
    diagnosis: [
      { text: "What tests are most reliable?", category: "general" },
      { text: "How accurate are these diagnostic methods?", category: "general" },
      { text: "What if initial tests are negative?", category: "complications" }
    ],
    prevention: [
      { text: "What are the most effective preventive measures?", category: "general" },
      { text: "How often should prevention be implemented?", category: "timing" },
      { text: "What are common prevention mistakes?", category: "safety" }
    ],
    general: [
      { text: "What are the key steps?", category: "general" },
      { text: "What should I know about timing?", category: "timing" },
      { text: "What are important safety considerations?", category: "safety" }
    ]
  };

  // Get intent-specific questions
  const specific = intentSpecificQuestions[intent] || [];
  const allQuestions = [...specific, ...baseQuestions];

  // Filter out questions similar to already asked
  const filtered = allQuestions.filter(q => {
    const qLower = q.text.toLowerCase();
    return !askedQuestions.some(asked => {
      const askedLower = asked.toLowerCase();
      // Simple similarity: if they share 50%+ words, consider duplicate
      const qWords = new Set(qLower.split(/\s+/).filter(w => w.length > 3));
      const askedWords = new Set(askedLower.split(/\s+/).filter(w => w.length > 3));
      const overlap = [...qWords].filter(w => askedWords.has(w)).length;
      const similarity = qWords.size > 0 ? overlap / qWords.size : 0;
      return similarity > 0.5;
    });
  });

  return filtered.slice(0, 5);
}

// ============================================================================
// MESSAGE UTILITIES
// ============================================================================

/**
 * Check if message is a duplicate (within time window)
 */
export function isDuplicateMessage(
  content: string,
  messages: Message[],
  timeWindowMs: number = 2000
): boolean {
  const now = Date.now();
  
  return messages.some(msg => {
    if (msg.type !== 'user' || msg.content !== content) return false;
    
    const msgTime = new Date(msg.timestamp).getTime();
    const timeDiff = now - msgTime;
    
    // Check if within time window and pending/sent
    if (timeDiff < timeWindowMs && (msg.status === 'pending' || msg.status === 'sent')) {
      return true;
    }
    
    return false;
  });
}

/**
 * Extract asked topics from conversation history
 */
export function extractAskedTopics(messages: Message[]): string[] {
  const topics: string[] = [];
  const recentMessages = messages.slice(-10); // Last 10 messages

  for (const msg of recentMessages) {
    if (msg.type === 'user') {
      const contentLower = msg.content.toLowerCase();
      
      // Check for topic keywords
      for (const [category, keywords] of Object.entries(FOLLOW_UP_KEYWORDS)) {
        for (const keyword of keywords) {
          if (contentLower.includes(keyword) && !topics.includes(category)) {
            topics.push(category);
          }
        }
      }
    }
  }

  return topics;
}

/**
 * Get the current protocol being discussed
 */
export function getCurrentProtocol(messages: Message[]): ProtocolData | null {
  // Find most recent protocol (within last 10 messages)
  const recentMessages = messages.slice(-10);
  
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const msg = recentMessages[i];
    if (msg.type === 'assistant' && msg.protocolData) {
      return msg.protocolData;
    }
  }
  
  return null;
}

/**
 * Check if protocol context has changed (different medical topic)
 */
export function hasProtocolContextChanged(
  newQuery: string,
  currentProtocol: ProtocolData | null
): boolean {
  if (!currentProtocol) return false;

  const newQueryLower = newQuery.toLowerCase();
  const protocolTitleLower = currentProtocol.title.toLowerCase();

  // Extract key medical terms (ignore common words)
  const commonWords = ['disease', 'symptoms', 'treatment', 'protocol', 'management', 'diagnosis'];
  
  const protocolTerms = protocolTitleLower
    .split(/\s+/)
    .filter(w => w.length > 3 && !commonWords.includes(w));
  
  const queryTerms = newQueryLower
    .split(/\s+/)
    .filter(w => w.length > 3 && !commonWords.includes(w));

  // Check for overlap
  const overlap = protocolTerms.filter(term => 
    queryTerms.some(qTerm => qTerm.includes(term) || term.includes(qTerm))
  );

  // If less than 30% overlap, likely different topic
  const overlapRatio = protocolTerms.length > 0 ? overlap.length / protocolTerms.length : 0;
  
  return overlapRatio < 0.3;
}

// ============================================================================
// CONVERSATION CONTEXT
// ============================================================================

export interface ConversationContext {
  hasProtocol: boolean;
  protocol?: ProtocolData;
  messageCount: number;
  lastUserMessage?: Message;
  askedTopics: string[];
  conversationAge: number; // in minutes
}

/**
 * Build conversation context snapshot
 */
export function buildConversationContext(messages: Message[]): ConversationContext {
  const protocol = getCurrentProtocol(messages);
  const askedTopics = extractAskedTopics(messages);
  
  const lastUserMsg = [...messages]
    .reverse()
    .find(m => m.type === 'user');

  let conversationAge = 0;
  if (messages.length > 0) {
    const firstTime = new Date(messages[0].timestamp).getTime();
    const lastTime = new Date(messages[messages.length - 1].timestamp).getTime();
    conversationAge = (lastTime - firstTime) / 1000 / 60; // minutes
  }

  return {
    hasProtocol: protocol !== null,
    protocol: protocol || undefined,
    messageCount: messages.length,
    lastUserMessage: lastUserMsg,
    askedTopics,
    conversationAge
  };
}

// ============================================================================
// RESPONSE FORMATTING
// ============================================================================

/**
 * Format markdown text for display
 */
export function formatMarkdownResponse(text: string): string {
  // Ensure proper spacing around bold markers
  let formatted = text.replace(/\*\*([^*]+)\*\*/g, '**$1**');
  
  // Ensure proper line breaks before lists
  formatted = formatted.replace(/([^\n])\n-/g, '$1\n\n-');
  
  // Ensure proper spacing after citations
  formatted = formatted.replace(/\[Source (\d+)\]/g, ' [Source $1]');
  
  return formatted.trim();
}

/**
 * Extract citations from response text
 */
export function extractCitationsFromText(text: string): number[] {
  const citations: number[] = [];
  const regex = /\[Source (\d+)\]/g;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    const citationNum = parseInt(match[1], 10);
    if (!citations.includes(citationNum)) {
      citations.push(citationNum);
    }
  }
  
  return citations.sort((a, b) => a - b);
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate message content before sending
 */
export function validateMessageContent(content: string): { valid: boolean; error?: string } {
  if (!content || content.trim().length === 0) {
    return { valid: false, error: 'Message cannot be empty' };
  }

  if (content.length > 1000) {
    return { valid: false, error: 'Message too long (max 1000 characters)' };
  }

  // Check for minimum meaningful content
  if (content.trim().length < 3) {
    return { valid: false, error: 'Message too short' };
  }

  return { valid: true };
}

/**
 * Sanitize user input
 */
export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, ' ') // Normalize whitespace
    .slice(0, 1000); // Max length
}

// ============================================================================
// EXPORTS
// ============================================================================

export const ChatUtils = {
  detectFollowUp,
  classifyQueryIntent,
  getIntentPrefix,
  generateFollowUpQuestions,
  isDuplicateMessage,
  extractAskedTopics,
  getCurrentProtocol,
  hasProtocolContextChanged,
  buildConversationContext,
  formatMarkdownResponse,
  extractCitationsFromText,
  validateMessageContent,
  sanitizeInput,
};

export default ChatUtils;
