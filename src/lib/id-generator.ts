/**
 * ID Generation Utilities
 * Provides robust, collision-resistant ID generation
 */

/**
 * Generate a UUID v4
 */
export function generateUUID(): string {
  // Use crypto.randomUUID if available (modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback to manual UUID generation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generate a short unique ID (for messages, etc.)
 * Format: timestamp-random
 */
export function generateShortId(): string {
  const timestamp = Date.now().toString(36); // Base36 timestamp
  const random = Math.random().toString(36).substring(2, 9); // Random string
  return `${timestamp}-${random}`;
}

/**
 * Generate a conversation ID
 */
export function generateConversationId(): string {
  return `conv_${generateShortId()}`;
}

/**
 * Generate a message ID
 */
export function generateMessageId(): string {
  return `msg_${generateShortId()}`;
}

/**
 * Generate a protocol ID from title (deterministic but collision-resistant)
 */
export function generateProtocolId(title: string): string {
  // Normalize title
  const normalized = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .substring(0, 50); // Limit length

  // Add a short hash to prevent collisions
  const hash = simpleHash(title).toString(36).substring(0, 6);
  
  return `protocol_${normalized}_${hash}`;
}

/**
 * Simple hash function for strings
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Generate a tab ID
 */
export function generateTabId(): string {
  return `tab_${generateShortId()}`;
}
