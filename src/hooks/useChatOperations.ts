/**
 * Custom hook for chat operations
 * Provides high-level chat functions with built-in intelligence
 */

import { useCallback, useRef } from 'react';
import { Message } from '@/types';
import {
  detectFollowUp,
  classifyQueryIntent,
  getIntentPrefix,
  generateFollowUpQuestions,
  isDuplicateMessage,
  validateMessageContent,
  sanitizeInput,
  hasProtocolContextChanged,
  buildConversationContext,
} from '@/lib/chat-utils';

export interface UseChatOperationsOptions {
  messages: Message[];
  onShowNewTabDialog?: (query: string) => void;
  onError?: (error: string) => void;
}

export function useChatOperations(options: UseChatOperationsOptions) {
  const { messages, onError } = options;
  
  // Track last analysis to avoid re-computation
  const lastAnalysisRef = useRef<{
    query: string;
    isFollowUp: boolean;
    confidence: number;
  } | null>(null);

  /**
   * Analyze query and determine chat mode
   */
  const analyzeQuery = useCallback((query: string): {
    shouldGenerateProtocol: boolean;
    shouldContinueConversation: boolean;
    shouldShowDialog: boolean;
    intent: string;
    confidence: number;
    reason: string;
  } => {
    // Validate input
    const validation = validateMessageContent(query);
    if (!validation.valid) {
      onError?.(validation.error || 'Invalid message');
      return {
        shouldGenerateProtocol: false,
        shouldContinueConversation: false,
        shouldShowDialog: false,
        intent: 'general',
        confidence: 0,
        reason: validation.error || 'Invalid'
      };
    }

    // Check for duplicates
    if (isDuplicateMessage(query, messages)) {
      return {
        shouldGenerateProtocol: false,
        shouldContinueConversation: false,
        shouldShowDialog: false,
        intent: 'general',
        confidence: 1.0,
        reason: 'Duplicate message blocked'
      };
    }

    // Detect follow-up
    const followUpAnalysis = detectFollowUp(query, messages);
    
    // Cache analysis
    lastAnalysisRef.current = {
      query,
      isFollowUp: followUpAnalysis.isFollowUp,
      confidence: followUpAnalysis.confidence
    };

    if (followUpAnalysis.isFollowUp && followUpAnalysis.lastProtocol) {
      // Continue conversation mode
      return {
        shouldGenerateProtocol: false,
        shouldContinueConversation: true,
        shouldShowDialog: false,
        intent: 'followup',
        confidence: followUpAnalysis.confidence,
        reason: followUpAnalysis.reason
      };
    }

    // Check if context changed (has protocol but new topic)
    const hasProtocol = messages.some(m => m.type === 'assistant' && m.protocolData);
    if (hasProtocol) {
      const currentProtocol = followUpAnalysis.lastProtocol;
      if (currentProtocol && hasProtocolContextChanged(query, currentProtocol)) {
        // Show dialog to user
        return {
          shouldGenerateProtocol: false,
          shouldContinueConversation: false,
          shouldShowDialog: true,
          intent: classifyQueryIntent(query),
          confidence: 0.8,
          reason: 'Different medical topic detected'
        };
      }
    }

    // New protocol generation
    const intent = classifyQueryIntent(query);
    return {
      shouldGenerateProtocol: true,
      shouldContinueConversation: false,
      shouldShowDialog: false,
      intent,
      confidence: 0.9,
      reason: 'New protocol request'
    };
  }, [messages, onError]);

  /**
   * Prepare follow-up questions based on context
   */
  const prepareFollowUpQuestions = useCallback((intent: string, protocolTitle: string) => {
    const askedQuestions = messages
      .filter(m => m.type === 'user')
      .map(m => m.content);

    return generateFollowUpQuestions({
      intent: intent as any,
      protocolTitle,
      askedQuestions
    });
  }, [messages]);

  /**
   * Get conversation statistics
   */
  const getConversationStats = useCallback(() => {
    const context = buildConversationContext(messages);
    return {
      messageCount: context.messageCount,
      hasProtocol: context.hasProtocol,
      protocolTitle: context.protocol?.title,
      askedTopics: context.askedTopics,
      conversationAge: context.conversationAge,
      userMessages: messages.filter(m => m.type === 'user').length,
      assistantMessages: messages.filter(m => m.type === 'assistant').length,
    };
  }, [messages]);

  /**
   * Validate and sanitize query
   */
  const prepareQuery = useCallback((rawQuery: string): {
    valid: boolean;
    sanitized: string;
    error?: string;
  } => {
    const sanitized = sanitizeInput(rawQuery);
    const validation = validateMessageContent(sanitized);
    
    return {
      valid: validation.valid,
      sanitized,
      error: validation.error
    };
  }, []);

  /**
   * Get intent-based message prefix
   */
  const getMessagePrefix = useCallback((intent: string): string => {
    return getIntentPrefix(intent as any);
  }, []);

  /**
   * Check if should show new tab dialog
   */
  const shouldPromptNewTab = useCallback((query: string): boolean => {
    const hasProtocol = messages.some(m => m.type === 'assistant' && m.protocolData);
    if (!hasProtocol) return false;

    const followUpAnalysis = detectFollowUp(query, messages);
    if (followUpAnalysis.isFollowUp) return false;

    // Different topic
    if (followUpAnalysis.lastProtocol) {
      return hasProtocolContextChanged(query, followUpAnalysis.lastProtocol);
    }

    return false;
  }, [messages]);

  return {
    analyzeQuery,
    prepareFollowUpQuestions,
    getConversationStats,
    prepareQuery,
    getMessagePrefix,
    shouldPromptNewTab,
    lastAnalysis: lastAnalysisRef.current,
  };
}

export default useChatOperations;
