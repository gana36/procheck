import { memo, useState, useCallback, useEffect } from 'react';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';
import { Message } from '@/types';

interface MessageSearchProps {
  messages: Message[];
  onResultClick: (messageId: string, index: number) => void;
  isOpen: boolean;
  onClose: () => void;
}

const MessageSearch = memo(({
  messages,
  onResultClick,
  isOpen,
  onClose,
}: MessageSearchProps) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ message: Message; index: number }>>([]);
  const [currentResultIndex, setCurrentResultIndex] = useState(0);

  // Search messages
  const searchMessages = useCallback((searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setCurrentResultIndex(0);
      return;
    }

    const lowercaseQuery = searchQuery.toLowerCase();
    const found = messages
      .map((message, index) => ({ message, index }))
      .filter(({ message }) =>
        message.content.toLowerCase().includes(lowercaseQuery)
      );

    setResults(found);
    setCurrentResultIndex(0);
  }, [messages]);

  useEffect(() => {
    searchMessages(query);
  }, [query, searchMessages]);

  const handleNext = useCallback(() => {
    if (results.length === 0) return;
    const nextIndex = (currentResultIndex + 1) % results.length;
    setCurrentResultIndex(nextIndex);
    onResultClick(results[nextIndex].message.id, results[nextIndex].index);
  }, [results, currentResultIndex, onResultClick]);

  const handlePrevious = useCallback(() => {
    if (results.length === 0) return;
    const prevIndex = currentResultIndex === 0 ? results.length - 1 : currentResultIndex - 1;
    setCurrentResultIndex(prevIndex);
    onResultClick(results[prevIndex].message.id, results[prevIndex].index);
  }, [results, currentResultIndex, onResultClick]);

  const handleClose = useCallback(() => {
    setQuery('');
    setResults([]);
    setCurrentResultIndex(0);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm">
      <div className="flex items-center gap-2 p-3">
        <div className="flex-1 flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages..."
            className="flex-1 bg-transparent outline-none text-sm text-slate-700 placeholder:text-slate-400"
            autoFocus
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {results.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">
              {currentResultIndex + 1} of {results.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={handlePrevious}
                className="p-1.5 hover:bg-slate-100 rounded transition-colors"
                aria-label="Previous result"
              >
                <ChevronUp className="w-4 h-4 text-slate-600" />
              </button>
              <button
                onClick={handleNext}
                className="p-1.5 hover:bg-slate-100 rounded transition-colors"
                aria-label="Next result"
              >
                <ChevronDown className="w-4 h-4 text-slate-600" />
              </button>
            </div>
          </div>
        )}

        <button
          onClick={handleClose}
          className="p-1.5 hover:bg-slate-100 rounded transition-colors"
          aria-label="Close search"
        >
          <X className="w-4 h-4 text-slate-600" />
        </button>
      </div>
    </div>
  );
});

MessageSearch.displayName = 'MessageSearch';

export default MessageSearch;
