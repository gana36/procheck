import { memo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { parseInlineCitations } from '@/lib/citation-utils';
import { CitationSource } from '@/types';

interface MessageContentProps {
  content: string;
  citations?: CitationSource[];
  className?: string;
}

function MessageContent({ content, citations, className = '' }: MessageContentProps) {
  const [highlightedCitation, setHighlightedCitation] = useState<number | null>(null);
  
  // Parse content for inline citations
  const parts = parseInlineCitations(content);
  
  // If no citations detected, render as markdown
  if (parts.length === 1 && parts[0].type === 'text') {
    return (
      <div className={className}>
        <ReactMarkdown
          components={{
            p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
            ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>,
            li: ({ children }) => <li className="text-slate-700">{children}</li>,
            strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
            code: ({ children }) => (
              <code className="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded text-sm font-mono">
                {children}
              </code>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    );
  }
  
  // Render with inline citations - preserve block structure
  return (
    <div className={className}>
      {parts.map((part, index) => {
        if (part.type === 'text') {
          // Check if this text starts with a section header (has ** at start)
          const isHeader = part.content.trim().startsWith('**') && part.content.includes(':**');
          const hasLineBreaks = part.content.includes('\n\n');
          
          return (
            <ReactMarkdown
              key={index}
              components={{
                // Preserve paragraphs as block elements if there are line breaks
                p: ({ children }) => hasLineBreaks || isHeader 
                  ? <p className="mb-3 last:mb-0">{children}</p>
                  : <span className="inline">{children}</span>,
                ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1 block">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1 block">{children}</ol>,
                li: ({ children }) => <li className="text-slate-700">{children}</li>,
                strong: ({ children }) => {
                  // Check if this strong tag is a section header
                  const childText = String(children);
                  const isSectionHeader = childText.includes(':') && (
                    childText.includes('Stage') || 
                    childText.includes('Differences') ||
                    childText.includes('Warning') ||
                    childText.includes('Treatment')
                  );
                  return isSectionHeader 
                    ? <strong className="block font-bold text-slate-900 text-base mt-4 mb-2 first:mt-0">{children}</strong>
                    : <strong className="font-semibold text-slate-900">{children}</strong>;
                },
                code: ({ children }) => (
                  <code className="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded text-sm font-mono">
                    {children}
                  </code>
                ),
              }}
            >
              {part.content}
            </ReactMarkdown>
          );
        }
        
        // Render citation badge
        const citationId = part.citationId!;
        const citation = citations?.find(c => c.id === citationId);
        const isHighlighted = highlightedCitation === citationId;
        
        return (
          <button
            key={index}
            onClick={() => {
              // Scroll to citations dropdown and highlight this citation
              const citationsEl = document.querySelector(`[data-citation-id="${citationId}"]`);
              if (citationsEl) {
                citationsEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                setHighlightedCitation(citationId);
                setTimeout(() => setHighlightedCitation(null), 2000);
              }
            }}
            className={`
              inline-flex items-center justify-center
              min-w-[2.5rem] h-6 px-2 mx-0.5
              text-xs font-bold
              rounded-md
              transition-all
              ${isHighlighted 
                ? 'bg-blue-600 text-white ring-2 ring-blue-300 scale-110' 
                : 'bg-blue-100 text-blue-700 hover:bg-blue-200 hover:scale-105'
              }
              ${citation ? 'cursor-pointer' : 'cursor-default opacity-50'}
            `}
            title={citation ? `${citation.title} - ${citation.organization}` : 'Citation not found'}
            disabled={!citation}
          >
            [{citationId}]
          </button>
        );
      })}
    </div>
  );
}

export default memo(MessageContent);
