import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, BookOpen, AlertCircle } from 'lucide-react';
import { CitationSource } from '@/types';

interface CitationsDropdownProps {
  citations: CitationSource[];
  uncertaintyNote?: string;
  usedNewSources?: boolean;
}

export default function CitationsDropdown({ 
  citations, 
  uncertaintyNote,
  usedNewSources 
}: CitationsDropdownProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!citations || citations.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm">
          <BookOpen className="w-4 h-4 text-slate-600" />
          <span className="font-medium text-slate-700">
            {citations.length} Source{citations.length > 1 ? 's' : ''} Referenced
          </span>
          {usedNewSources && (
            <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">
              ✨ Fresh Context
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-slate-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-500" />
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-slate-200 bg-white">
          {/* Uncertainty note if present */}
          {uncertaintyNote && (
            <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-amber-800">
                <span className="font-medium">Note: </span>
                {uncertaintyNote}
              </div>
            </div>
          )}

          {/* Citations list */}
          <div className="divide-y divide-slate-100">
            {citations.map((citation) => (
              <div key={citation.id} className="px-4 py-3 hover:bg-slate-50 transition-colors">
                {/* Citation header */}
                <div className="flex items-start gap-2 mb-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-teal-100 text-teal-700 text-xs font-semibold flex-shrink-0">
                    {citation.id}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-slate-900 line-clamp-2">
                      {citation.title}
                    </h4>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                      <span>{citation.organization}</span>
                      {citation.relevance_score && (
                        <>
                          <span>•</span>
                          <span className="text-teal-600">
                            {Math.round(citation.relevance_score * 100)}% relevant
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  {citation.source_url && (
                    <a
                      href={citation.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 p-1.5 hover:bg-slate-200 rounded transition-colors"
                      title="Open source"
                    >
                      <ExternalLink className="w-4 h-4 text-slate-600" />
                    </a>
                  )}
                </div>

                {/* Citation excerpt */}
                {citation.excerpt && (
                  <p className="text-sm text-slate-600 leading-relaxed pl-8 line-clamp-3">
                    {citation.excerpt}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
