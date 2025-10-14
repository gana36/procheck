import { memo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ node, ...props }) => <p className="mb-3 last:mb-0 leading-relaxed" {...props} />,
            ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-3 space-y-1.5" {...props} />,
            ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-3 space-y-1.5" {...props} />,
            li: ({ node, ...props }) => <li className="text-slate-700 leading-relaxed" {...props} />,
            strong: ({ node, ...props }) => <strong className="font-semibold text-slate-900" {...props} />,
            em: ({ node, ...props }) => <em className="italic text-slate-700" {...props} />,
            h1: ({ node, ...props }) => <h1 className="text-2xl font-bold text-slate-900 mb-3 mt-4 first:mt-0" {...props} />,
            h2: ({ node, ...props }) => <h2 className="text-xl font-bold text-slate-900 mb-3 mt-4 first:mt-0" {...props} />,
            h3: ({ node, ...props }) => <h3 className="text-lg font-semibold text-slate-900 mb-2 mt-3 first:mt-0" {...props} />,
            h4: ({ node, ...props }) => <h4 className="text-base font-semibold text-slate-900 mb-2 mt-3 first:mt-0" {...props} />,
            code: ({ node, inline, className, ...props }: any) => 
              inline ? (
                <code className="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded text-sm font-mono" {...props} />
              ) : (
                <code className="block px-4 py-3 bg-slate-100 text-slate-800 rounded-lg text-sm font-mono my-3 overflow-x-auto" {...props} />
              ),
            pre: ({ node, ...props }) => <pre className="bg-slate-100 rounded-lg p-4 my-3 overflow-x-auto" {...props} />,
            blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-slate-300 pl-4 italic text-slate-600 my-3" {...props} />,
            hr: ({ node, ...props }) => <hr className="border-slate-200 my-4" {...props} />,
            table: ({ node, ...props }) => (
              <div className="overflow-x-auto my-4">
                <table className="min-w-full border-collapse border border-slate-300 rounded-lg overflow-hidden shadow-sm" {...props} />
              </div>
            ),
            thead: ({ node, ...props }) => <thead className="bg-slate-700 text-white" {...props} />,
            tbody: ({ node, ...props }) => <tbody className="bg-white" {...props} />,
            tr: ({ node, ...props }) => <tr className="border-b border-slate-200 hover:bg-slate-50 transition-colors" {...props} />,
            th: ({ node, ...props }) => <th className="border border-slate-300 px-4 py-3 text-left font-semibold text-sm" {...props} />,
            td: ({ node, ...props }) => <td className="border border-slate-300 px-4 py-3 text-slate-700 text-sm" {...props} />,
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
              remarkPlugins={[remarkGfm]}
              components={{
                // Preserve paragraphs as block elements if there are line breaks
                p: ({ node, children, ...props }) => hasLineBreaks || isHeader 
                  ? <p className="mb-3 last:mb-0 leading-relaxed" {...props}>{children}</p>
                  : <span className="inline">{children}</span>,
                ul: ({ node, ...props }) => <ul className="list-disc pl-5 my-2 space-y-1.5 block" {...props} />,
                ol: ({ node, ...props }) => <ol className="list-decimal pl-5 my-2 space-y-1.5 block" {...props} />,
                li: ({ node, ...props }) => <li className="text-slate-700 leading-relaxed" {...props} />,
                strong: ({ node, children, ...props }) => {
                  // Check if this strong tag is a section header
                  const childText = String(children);
                  const isSectionHeader = childText.includes(':') && (
                    childText.includes('Stage') || 
                    childText.includes('Differences') ||
                    childText.includes('Warning') ||
                    childText.includes('Treatment')
                  );
                  return isSectionHeader 
                    ? <strong className="block font-bold text-slate-900 text-base mt-4 mb-2 first:mt-0" {...props}>{children}</strong>
                    : <strong className="font-semibold text-slate-900" {...props}>{children}</strong>;
                },
                em: ({ node, ...props }) => <em className="italic text-slate-700" {...props} />,
                h1: ({ node, ...props }) => <h1 className="text-2xl font-bold text-slate-900 mb-3 mt-4 first:mt-0" {...props} />,
                h2: ({ node, ...props }) => <h2 className="text-xl font-bold text-slate-900 mb-3 mt-4 first:mt-0" {...props} />,
                h3: ({ node, ...props }) => <h3 className="text-lg font-semibold text-slate-900 mb-2 mt-3 first:mt-0" {...props} />,
                h4: ({ node, ...props }) => <h4 className="text-base font-semibold text-slate-900 mb-2 mt-3 first:mt-0" {...props} />,
                code: ({ node, inline, className, ...props }: any) => 
                  inline ? (
                    <code className="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded text-sm font-mono" {...props} />
                  ) : (
                    <code className="block px-4 py-3 bg-slate-100 text-slate-800 rounded-lg text-sm font-mono my-3 overflow-x-auto" {...props} />
                  ),
                pre: ({ node, ...props }) => <pre className="bg-slate-100 rounded-lg p-4 my-3 overflow-x-auto" {...props} />,
                blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-slate-300 pl-4 italic text-slate-600 my-3" {...props} />,
                hr: ({ node, ...props }) => <hr className="border-slate-200 my-4" {...props} />,
                table: ({ node, ...props }) => (
                  <div className="overflow-x-auto my-4">
                    <table className="min-w-full border-collapse border border-slate-300 rounded-lg overflow-hidden shadow-sm" {...props} />
                  </div>
                ),
                thead: ({ node, ...props }) => <thead className="bg-slate-700 text-white" {...props} />,
                tbody: ({ node, ...props }) => <tbody className="bg-white" {...props} />,
                tr: ({ node, ...props }) => <tr className="border-b border-slate-200 hover:bg-slate-50 transition-colors" {...props} />,
                th: ({ node, ...props }) => <th className="border border-slate-300 px-4 py-3 text-left font-semibold text-sm" {...props} />,
                td: ({ node, ...props }) => <td className="border border-slate-300 px-4 py-3 text-slate-700 text-sm" {...props} />,
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
