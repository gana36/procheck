/**
 * Centralized Error Handler
 * Maps technical errors to user-friendly messages with actionable guidance
 */

import { RequestAbortError, RequestTimeoutError } from './request-utils';

export interface UserFriendlyError {
  title: string;
  message: string;
  action?: string;
  technical?: string; // Original error for debugging
  retryable: boolean;
}

/**
 * Convert any error to a user-friendly format
 */
export function handleError(error: any): UserFriendlyError {
  // Network errors
  if (error instanceof RequestTimeoutError) {
    return {
      title: 'Request Timed Out',
      message: 'The request took too long to complete. This might be due to a slow connection or server issues.',
      action: 'Please check your internet connection and try again.',
      technical: error.message,
      retryable: true,
    };
  }

  if (error instanceof RequestAbortError) {
    return {
      title: 'Request Cancelled',
      message: 'The request was cancelled.',
      technical: error.message,
      retryable: false,
    };
  }

  if (error.message?.includes('Failed to fetch') || error.name === 'TypeError') {
    return {
      title: 'Connection Error',
      message: 'Unable to connect to the server. Please check your internet connection.',
      action: 'Make sure you\'re connected to the internet and try again.',
      technical: error.message,
      retryable: true,
    };
  }

  // HTTP status code errors
  if (error.message?.includes('401')) {
    return {
      title: 'Authentication Required',
      message: 'Your session has expired. Please log in again.',
      action: 'Click here to log in',
      technical: error.message,
      retryable: false,
    };
  }

  if (error.message?.includes('403')) {
    return {
      title: 'Access Denied',
      message: 'You don\'t have permission to perform this action.',
      technical: error.message,
      retryable: false,
    };
  }

  if (error.message?.includes('404')) {
    return {
      title: 'Not Found',
      message: 'The requested resource could not be found.',
      action: 'Please refresh the page and try again.',
      technical: error.message,
      retryable: false,
    };
  }

  if (error.message?.includes('429')) {
    return {
      title: 'Too Many Requests',
      message: 'You\'re sending requests too quickly. Please slow down.',
      action: 'Wait a moment and try again.',
      technical: error.message,
      retryable: true,
    };
  }

  if (error.message?.includes('500') || error.message?.includes('502') || error.message?.includes('503')) {
    return {
      title: 'Server Error',
      message: 'The server encountered an error. This is not your fault.',
      action: 'Please try again in a few moments. If the problem persists, contact support.',
      technical: error.message,
      retryable: true,
    };
  }

  // API-specific errors (but check for moderation errors first)
  if (error.message?.includes('Search failed') &&
      !error.message?.includes('invalid_query') &&
      !error.message?.includes('harmful') &&
      !error.message?.includes('irrelevant')) {
    return {
      title: 'Search Error',
      message: 'Unable to search protocols at this time.',
      action: 'Please try again or refine your search query.',
      technical: error.message,
      retryable: true,
    };
  }

  if (error.message?.includes('Generate failed')) {
    return {
      title: 'Protocol Generation Error',
      message: 'Unable to generate protocol checklist.',
      action: 'Please try again with a different query.',
      technical: error.message,
      retryable: true,
    };
  }

  if (error.message?.includes('Save conversation failed') || error.message?.includes('Save protocol failed')) {
    return {
      title: 'Save Error',
      message: 'Unable to save your data at this time.',
      action: 'Your work is still available in this session. Please try saving again.',
      technical: error.message,
      retryable: true,
    };
  }

  if (error.message?.includes('Delete') && error.message?.includes('failed')) {
    return {
      title: 'Delete Error',
      message: 'Unable to delete the item.',
      action: 'Please refresh the page and try again.',
      technical: error.message,
      retryable: true,
    };
  }

  // Firestore/Database errors
  if (error.message?.includes('firestore') || error.message?.includes('database')) {
    return {
      title: 'Database Error',
      message: 'Unable to access the database at this time.',
      action: 'Please try again in a few moments.',
      technical: error.message,
      retryable: true,
    };
  }

  // Content moderation errors
  if (error.message?.includes('invalid_query') || error.message?.includes('invalid_message') ||
      error.message?.includes('invalid_input') || error.message?.includes('harmful') ||
      error.message?.includes('irrelevant') || error.message?.includes('out_of_scope_medical') ||
      error.message?.includes('greeting') || error.message?.includes('too_short')) {

    let errorMessage = 'Your query contains inappropriate or irrelevant content.';
    let errorTitle = 'Invalid Query';
    let errorAction = 'Please reformulate your question to be medical-related and appropriate.';
    let suggestion = null;
    let userQuery = null;

    try {
      // Parse backend error response
      // Error format: "Search failed: 400 {"detail": {...}}"
      const jsonPart = error.message.substring(error.message.indexOf('{'));
      const parsed = JSON.parse(jsonPart);

      // Extract from detail object if present
      const errorData = parsed.detail || parsed;

      if (errorData.message) {
        errorMessage = errorData.message;
      }

      if (errorData.suggestion) {
        suggestion = errorData.suggestion;
      }

      // Set title and action based on category
      if (errorData.category === 'harmful') {
        errorTitle = '⛔ Inappropriate Content Detected';
        errorAction = 'ProCheck is designed for medical protocol queries only. Please ask a healthcare-related question.';
      } else if (errorData.category === 'out_of_scope_medical') {
        errorTitle = '📋 Out of ProCheck\'s Scope';
        errorMessage = errorData.message || errorMessage;
        // Add sample queries for out-of-scope medical with proper markdown list
        errorAction = '\n\n**Try one of these example queries:**\n\n' +
          '- "What are the symptoms of dengue fever?"\n' +
          '- "How do I treat malaria?"\n' +
          '- "Emergency treatment for asthma attack"\n' +
          '- "Diabetes management guidelines"\n' +
          '- "CPR protocol for cardiac arrest"\n' +
          '- "Stroke warning signs and FAST test"\n' +
          '- "COVID-19 home management protocol"';
      } else if (errorData.category === 'irrelevant') {
        errorTitle = '❌ Non-Medical Query';
        errorMessage = errorData.message || errorMessage;
        // Add sample queries for irrelevant with proper markdown list
        errorAction = '\n\n**Try one of these example queries:**\n\n' +
          '- "What are the symptoms of dengue fever?"\n' +
          '- "How do I treat malaria?"\n' +
          '- "Emergency treatment for asthma attack"\n' +
          '- "What should I do if someone has a heart attack?"\n' +
          '- "How to prevent mosquito-borne diseases?"\n' +
          '- "Childhood fever - when to seek help?"';
      } else if (errorData.category === 'greeting') {
        errorTitle = '👋 Welcome to ProCheck!';
        errorMessage = errorData.message || 'Hello! Welcome to ProCheck. I\'m here to help you find medical protocols and emergency information.';
        errorAction = '\n\n**Try one of these example queries to get started:**\n\n' +
          '- "What are the symptoms of dengue fever?"\n' +
          '- "How do I treat malaria?"\n' +
          '- "Emergency treatment for asthma attack"\n' +
          '- "What should I do if someone has a heart attack?"\n' +
          '- "Diabetes management guidelines"\n' +
          '- "CPR protocol for cardiac arrest"\n' +
          '- "Stroke warning signs and FAST test"';
      } else if (errorData.category === 'too_short') {
        errorTitle = '⚠️ Query Too Short';
        errorAction = 'Please provide more details about your medical question.';
      } else if (errorData.category === 'empty') {
        errorTitle = '⚠️ Empty Query';
        errorAction = 'Please enter a medical question or search term.';
      }
    } catch {
      // If parsing fails, extract message from error string
      const match = error.message.match(/"message":"([^"]+)"/);
      if (match) {
        errorMessage = match[1];
      }
    }

    // Try to extract user's original query from context
    if (error.context?.req?.query) {
      userQuery = error.context.req.query;
    }

    return {
      title: errorTitle,
      message: userQuery ? `Your query: "${userQuery}"\n\n${errorMessage}` : errorMessage,
      action: errorAction,
      technical: error.message,
      retryable: false,
    };
  }

  // Validation errors
  if (error.message?.includes('required') || error.message?.includes('invalid')) {
    return {
      title: 'Invalid Input',
      message: 'Please check your input and try again.',
      action: 'Make sure all required fields are filled correctly.',
      technical: error.message,
      retryable: false,
    };
  }

  // Generic fallback
  return {
    title: 'Something Went Wrong',
    message: 'An unexpected error occurred.',
    action: 'Please try again. If the problem persists, contact support.',
    technical: error.message || String(error),
    retryable: true,
  };
}

/**
 * Format error for display in UI
 */
export function formatErrorMessage(error: any): string {
  const friendly = handleError(error);

  let message = friendly.message;
  if (friendly.action) {
    // For content moderation errors with multiple lines/suggestions, use proper line breaks
    if (friendly.action.includes('\n')) {
      message += `\n\n${friendly.action}`;
    } else {
      message += ` ${friendly.action}`;
    }
  }

  return message;
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: any): boolean {
  return handleError(error).retryable;
}

/**
 * Log error with context
 */
export function logError(error: any, context?: Record<string, any>): void {
  const friendly = handleError(error);
  
  console.error('[Error]', {
    title: friendly.title,
    message: friendly.message,
    technical: friendly.technical,
    retryable: friendly.retryable,
    context,
    timestamp: new Date().toISOString(),
  });
}
