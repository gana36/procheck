/**
 * Response Formatter
 * Utilities for formatting and parsing AI responses
 */

import { ProtocolData, Citation, ProtocolStep, FollowUpQuestion } from '@/types';

// ============================================================================
// MARKDOWN FORMATTING
// ============================================================================

/**
 * Format markdown text with proper styling
 */
export function formatMarkdown(text: string): string {
  if (!text) return '';

  let formatted = text;

  // Ensure proper spacing around bold markers
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '**$1**');

  // Ensure proper line breaks before lists
  formatted = formatted.replace(/([^\n])\n-/g, '$1\n\n-');
  formatted = formatted.replace(/([^\n])\n\d+\./g, '$1\n\n$&');

  // Ensure proper spacing after citations
  formatted = formatted.replace(/\[Source\s*(\d+)\]/gi, ' [Source $1]');

  // Remove excessive line breaks (max 2)
  formatted = formatted.replace(/\n{3,}/g, '\n\n');

  return formatted.trim();
}

/**
 * Strip markdown formatting for plain text
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
    .replace(/\*([^*]+)\*/g, '$1') // Remove italic
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links
    .replace(/`([^`]+)`/g, '$1') // Remove code
    .replace(/#+\s+/g, '') // Remove headings
    .trim();
}

// ============================================================================
// CITATION HANDLING
// ============================================================================

/**
 * Extract citation numbers from text
 */
export function extractCitations(text: string): number[] {
  const citations: number[] = [];
  const regex = /\[Source\s*(\d+)\]/gi;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const num = parseInt(match[1], 10);
    if (!citations.includes(num)) {
      citations.push(num);
    }
  }

  return citations.sort((a, b) => a - b);
}

/**
 * Highlight citations in text with HTML spans
 */
export function highlightCitations(text: string): string {
  return text.replace(
    /\[Source\s*(\d+)\]/gi,
    '<span class="citation-marker" data-citation="$1">[Source $1]</span>'
  );
}

/**
 * Validate that all cited sources exist
 */
export function validateCitations(
  text: string,
  availableCitations: Citation[]
): { valid: boolean; missingCitations: number[] } {
  const citedNumbers = extractCitations(text);
  const availableNumbers = availableCitations.map(c => c.id);

  const missingCitations = citedNumbers.filter(num => !availableNumbers.includes(num));

  return {
    valid: missingCitations.length === 0,
    missingCitations
  };
}

// ============================================================================
// PROTOCOL FORMATTING
// ============================================================================

/**
 * Format protocol steps for display
 */
export function formatProtocolSteps(steps: ProtocolStep[]): ProtocolStep[] {
  return steps.map((step, index) => ({
    ...step,
    id: step.id || index + 1,
    step: step.step.trim(),
    explanation: step.explanation?.trim() || '',
    citations: step.citations || [],
    citation: step.citation || 0,
  }));
}

/**
 * Generate protocol summary text
 */
export function generateProtocolSummary(protocol: ProtocolData): string {
  const parts: string[] = [
    `**${protocol.title}**`,
    `${protocol.steps.length} steps`,
    `${protocol.citations.length} sources`,
    `${protocol.organization}`,
    `${protocol.year}`,
  ];

  return parts.join(' • ');
}

/**
 * Calculate protocol completeness score
 */
export function calculateCompletenessScore(protocol: ProtocolData): number {
  let score = 0;
  const maxScore = 100;

  // Has title (10 points)
  if (protocol.title && protocol.title.length > 5) score += 10;

  // Has steps (30 points)
  if (protocol.steps.length > 0) {
    score += Math.min(30, protocol.steps.length * 5);
  }

  // Steps have explanations (20 points)
  const stepsWithExplanations = protocol.steps.filter(s => s.explanation && s.explanation.length > 10);
  score += Math.min(20, (stepsWithExplanations.length / protocol.steps.length) * 20);

  // Has citations (20 points)
  if (protocol.citations.length > 0) {
    score += Math.min(20, protocol.citations.length * 4);
  }

  // Steps have citations (20 points)
  const stepsWithCitations = protocol.steps.filter(s => s.citation && s.citation > 0);
  score += Math.min(20, (stepsWithCitations.length / protocol.steps.length) * 20);

  return Math.min(maxScore, Math.round(score));
}

// ============================================================================
// FOLLOW-UP QUESTIONS
// ============================================================================

/**
 * Format follow-up questions with icons based on category
 */
export function formatFollowUpQuestions(questions: FollowUpQuestion[]): Array<{
  text: string;
  category: string;
  icon: string;
  color: string;
}> {
  const categoryStyles: Record<string, { icon: string; color: string }> = {
    dosage: { icon: '💊', color: 'blue' },
    symptoms: { icon: '🩺', color: 'red' },
    complications: { icon: '⚠️', color: 'orange' },
    timing: { icon: '⏰', color: 'purple' },
    safety: { icon: '🛡️', color: 'green' },
    general: { icon: '📋', color: 'gray' },
  };

  return questions.map(q => ({
    text: q.text,
    category: q.category || 'general',
    icon: categoryStyles[q.category || 'general']?.icon || '📋',
    color: categoryStyles[q.category || 'general']?.color || 'gray',
  }));
}

/**
 * Deduplicate follow-up questions
 */
export function deduplicateFollowUps(questions: FollowUpQuestion[]): FollowUpQuestion[] {
  const seen = new Set<string>();
  const unique: FollowUpQuestion[] = [];

  for (const question of questions) {
    const normalized = question.text.toLowerCase().trim();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      unique.push(question);
    }
  }

  return unique;
}

// ============================================================================
// TEXT PROCESSING
// ============================================================================

/**
 * Truncate text to specified length with ellipsis
 */
export function truncateText(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) return text;

  // Try to cut at last space before maxLength
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > maxLength * 0.8) {
    return truncated.substring(0, lastSpace) + '...';
  }

  return truncated + '...';
}

/**
 * Count words in text
 */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Estimate reading time in minutes
 */
export function estimateReadingTime(text: string): number {
  const words = countWords(text);
  const wordsPerMinute = 200; // Average reading speed
  return Math.ceil(words / wordsPerMinute);
}

/**
 * Extract medical terms (bold text) from response
 */
export function extractMedicalTerms(text: string): string[] {
  const terms: string[] = [];
  const regex = /\*\*([^*]+)\*\*/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const term = match[1].trim();
    if (term && !terms.includes(term)) {
      terms.push(term);
    }
  }

  return terms;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate protocol data completeness
 */
export function validateProtocol(protocol: ProtocolData): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!protocol.title || protocol.title.length < 3) {
    errors.push('Protocol title is required and must be at least 3 characters');
  }

  if (!protocol.steps || protocol.steps.length === 0) {
    errors.push('Protocol must have at least one step');
  }

  // Warnings
  if (protocol.citations.length === 0) {
    warnings.push('No citations provided - protocol lacks source verification');
  }

  if (protocol.steps.length > 0) {
    const stepsWithoutExplanations = protocol.steps.filter(s => !s.explanation || s.explanation.length < 10);
    if (stepsWithoutExplanations.length > protocol.steps.length * 0.5) {
      warnings.push('More than 50% of steps lack detailed explanations');
    }

    const stepsWithoutCitations = protocol.steps.filter(s => !s.citation || s.citation === 0);
    if (stepsWithoutCitations.length > 0) {
      warnings.push(`${stepsWithoutCitations.length} steps lack citation references`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// ============================================================================
// EXPORT FORMATTING
// ============================================================================

/**
 * Convert protocol to plain text format
 */
export function protocolToPlainText(protocol: ProtocolData): string {
  const lines: string[] = [];

  lines.push(protocol.title);
  lines.push('='.repeat(protocol.title.length));
  lines.push('');
  lines.push(`Organization: ${protocol.organization}`);
  lines.push(`Region: ${protocol.region}`);
  lines.push(`Year: ${protocol.year}`);
  lines.push('');
  lines.push('STEPS:');
  lines.push('------');

  protocol.steps.forEach((step) => {
    lines.push('');
    lines.push(`${step.id}. ${step.step}`);
    if (step.explanation) {
      lines.push(`   ${step.explanation}`);
    }
    if (step.citation) {
      lines.push(`   [Source: ${step.citation}]`);
    }
  });

  if (protocol.citations.length > 0) {
    lines.push('');
    lines.push('SOURCES:');
    lines.push('--------');
    protocol.citations.forEach((citation) => {
      lines.push('');
      lines.push(`[${citation.id}] ${citation.source}`);
      lines.push(`    ${citation.organization} (${citation.year})`);
      if (citation.url) {
        lines.push(`    ${citation.url}`);
      }
    });
  }

  return lines.join('\n');
}

/**
 * Convert protocol to markdown format
 */
export function protocolToMarkdown(protocol: ProtocolData): string {
  const lines: string[] = [];

  lines.push(`# ${protocol.title}`);
  lines.push('');
  lines.push(`**Organization:** ${protocol.organization}`);
  lines.push(`**Region:** ${protocol.region}`);
  lines.push(`**Year:** ${protocol.year}`);
  lines.push('');
  lines.push('## Protocol Steps');
  lines.push('');

  protocol.steps.forEach((step) => {
    lines.push(`### ${step.id}. ${step.step}`);
    lines.push('');
    if (step.explanation) {
      lines.push(step.explanation);
      lines.push('');
    }
    if (step.citation) {
      lines.push(`*Source: [${step.citation}]*`);
      lines.push('');
    }
  });

  if (protocol.citations.length > 0) {
    lines.push('## References');
    lines.push('');
    protocol.citations.forEach((citation) => {
      lines.push(`**[${citation.id}]** ${citation.source}`);
      lines.push(`- ${citation.organization} (${citation.year})`);
      if (citation.url) {
        lines.push(`- ${citation.url}`);
      }
      lines.push('');
    });
  }

  return lines.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const ResponseFormatter = {
  formatMarkdown,
  stripMarkdown,
  extractCitations,
  highlightCitations,
  validateCitations,
  formatProtocolSteps,
  generateProtocolSummary,
  calculateCompletenessScore,
  formatFollowUpQuestions,
  deduplicateFollowUps,
  truncateText,
  countWords,
  estimateReadingTime,
  extractMedicalTerms,
  validateProtocol,
  protocolToPlainText,
  protocolToMarkdown,
};

export default ResponseFormatter;
