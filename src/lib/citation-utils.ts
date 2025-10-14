/**
 * Utilities for handling citations in chat responses
 */

/**
 * Parse inline citations [Source N] and convert to clickable badges
 * Returns JSX-ready array of text and citation elements
 */
export function parseInlineCitations(text: string): Array<{ type: 'text' | 'citation'; content: string; citationId?: number }> {
  const parts: Array<{ type: 'text' | 'citation'; content: string; citationId?: number }> = [];
  
  // First, handle comma-separated citations like [NEW Source 1, NEW Source 2]
  // Convert them to individual citations
  let processedText = text.replace(
    /\[([^\]]+(?:,\s*[^\]]+)+)\]/g,
    (_fullMatch, group) => {
      // Split by comma and extract numbers
      const citations = group.split(',').map((cite: string) => {
        const numMatch = cite.match(/(\d+)/);
        return numMatch ? `[${numMatch[1]}]` : '';
      }).filter(Boolean);
      return citations.join(' ');
    }
  );
  
  // Now parse individual citations: [Source N], [NEW Source N], [Original N], or just [N]
  const citationRegex = /\[(?:NEW\s+Source\s+|Original\s+|Source\s+)?(\d+)\]/gi;
  
  let lastIndex = 0;
  let match;
  
  while ((match = citationRegex.exec(processedText)) !== null) {
    // Add text before citation
    if (match.index > lastIndex) {
      const textContent = processedText.substring(lastIndex, match.index);
      if (textContent) {
        parts.push({ type: 'text', content: textContent });
      }
    }
    
    // Add citation
    const citationId = parseInt(match[1], 10);
    parts.push({ 
      type: 'citation', 
      content: match[0], 
      citationId 
    });
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < processedText.length) {
    parts.push({ type: 'text', content: processedText.substring(lastIndex) });
  }
  
  return parts;
}

/**
 * Extract citation numbers from text
 */
export function extractCitationIds(text: string): number[] {
  const citationRegex = /\[(?:NEW\s+Source\s+|Original\s+|Source\s+)?(\d+)\]/gi;
  const ids: number[] = [];
  let match;
  
  while ((match = citationRegex.exec(text)) !== null) {
    ids.push(parseInt(match[1], 10));
  }
  
  return [...new Set(ids)]; // Remove duplicates
}

/**
 * Check if text contains citations
 */
export function hasCitations(text: string): boolean {
  return /\[(?:NEW\s+Source\s+|Original\s+|Source\s+)?\d+\]/i.test(text);
}

/**
 * Format citation badge for display
 */
export function formatCitationBadge(citationId: number): string {
  return `[${citationId}]`;
}
