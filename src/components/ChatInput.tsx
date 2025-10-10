import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Send, 
  Paperclip, 
  X,
  Loader2
} from 'lucide-react';
import { sampleQueries } from '@/data/mockData';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  hasMessages?: boolean; // Whether there are existing messages in the conversation
  isInConversation?: boolean; // Whether user is in conversation mode with a protocol
  currentProtocolTitle?: string; // Title of current protocol being discussed
}

const MAX_MESSAGE_LENGTH = 2000; // Maximum characters for a message

export default function ChatInput({ onSendMessage, isLoading, hasMessages = false, isInConversation = false, currentProtocolTitle }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [showSampleQueries, setShowSampleQueries] = useState(true);
  const remainingChars = MAX_MESSAGE_LENGTH - message.length;
  // Reset sample queries when conversation is cleared
  useEffect(() => {
    if (!hasMessages) {
    }
  }, [hasMessages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !isLoading) {
      onSendMessage(message.trim());
      setMessage('');
      setShowSampleQueries(false);
    }
  };

  const handleSampleQuery = (query: string) => {
    setMessage(query);
    setShowSampleQueries(false);
  };

  return (
    <div className="bg-white border-t border-slate-200 p-4">
      {/* Sample Queries Bar - Only show for new conversations */}
      {!hasMessages && showSampleQueries && message === '' && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-slate-600">Try these sample queries:</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSampleQueries(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {sampleQueries.slice(0, 3).map((query, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={() => handleSampleQuery(query)}
                className="text-xs text-slate-600 hover:bg-teal-50 hover:border-teal-200"
              >
                {query}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Input Field */}
      <form onSubmit={handleSubmit} className="flex items-end space-x-2">
        <div className="flex-1">
          <Input
            value={message}
            onChange={(e) => {
              const newValue = e.target.value;
              if (newValue.length <= MAX_MESSAGE_LENGTH) {
                setMessage(newValue);
              }
            }}
            placeholder={
              isInConversation 
                ? `Continue discussing ${currentProtocolTitle || 'this protocol'}...`
                : "Ask in natural language... Hybrid AI understands meaning, not just keywords"
            }
            className={`min-h-[60px] resize-none rounded-xl border-slate-200 focus:border-teal-300 focus:ring-teal-200 ${
              isInConversation ? 'bg-teal-50/50' : ''
            }`}
            disabled={isLoading}
            maxLength={MAX_MESSAGE_LENGTH}
          />
          {message.length > MAX_MESSAGE_LENGTH * 0.9 && (
            <p className={`text-xs mt-1 ${remainingChars < 100 ? 'text-red-600' : 'text-slate-500'}`}>
              {remainingChars} characters remaining
            </p>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-[60px] w-[60px] rounded-xl border-slate-200 hover:bg-slate-50"
            disabled={isLoading}
          >
            <Paperclip className="h-5 w-5 text-slate-500" />
          </Button>
          <Button
            type="submit"
            size="icon"
            className="h-[60px] w-[60px] rounded-xl bg-teal-600 hover:bg-teal-700"
            disabled={!message.trim() || isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-white" />
            ) : (
              <Send className="h-5 w-5 text-white" />
            )}
          </Button>
        </div>
      </form>

      {/* Show sample queries if input is empty and no messages exist */}
      {!hasMessages && message === '' && !showSampleQueries && (
        <div className="mt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSampleQueries(true)}
            className="text-slate-500 hover:text-slate-700"
          >
            Show sample queries
          </Button>
        </div>
      )}
    </div>
  );
}
