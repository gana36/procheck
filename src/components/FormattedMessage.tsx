import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CitationSource } from '@/types';

interface FormattedMessageProps {
  content: string;
  citations?: CitationSource[];
  className?: string;
}

/**
 * Simple markdown renderer - same as StepThread
 */
function FormattedMessage({ content, className = '' }: FormattedMessageProps) {
  return (
    <div className={`prose prose-sm max-w-none prose-slate ${className}`}>
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({node, ...props}) => <p className="mb-2 last:mb-0 leading-relaxed" {...props} />,
          ul: ({node, ...props}) => <ul className="mb-2 ml-4 space-y-1" {...props} />,
          ol: ({node, ...props}) => <ol className="mb-2 ml-4 space-y-1" {...props} />,
          li: ({node, ...props}) => <li className="text-sm" {...props} />,
          strong: ({node, ...props}) => <strong className="font-semibold text-slate-900" {...props} />,
          em: ({node, ...props}) => <em className="italic" {...props} />,
          code: ({node, ...props}) => <code className="bg-slate-100 px-1 py-0.5 rounded text-xs font-mono" {...props} />,
          h3: ({node, ...props}) => <h3 className="text-base font-bold text-slate-900 mt-3 mb-2 first:mt-0" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default memo(FormattedMessage);
