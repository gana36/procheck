import { useState, useEffect, useRef } from 'react';
import { Send } from 'lucide-react';
import { Button } from './ui/button';
import { StepThreadMessage } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface StepThreadProps {
  messages: StepThreadMessage[];
  onSendMessage: (message: string) => void;
  isLoading: boolean;
}

const MAX_INPUT_LENGTH = 1000; // Maximum characters for step thread input

export default function StepThread({ messages, onSendMessage, isLoading }: StepThreadProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const threadContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollMessageCountRef = useRef(0);
  const remainingChars = MAX_INPUT_LENGTH - input.length;

  // Auto-scroll to START of thread when messages change (not to last message)
  useEffect(() => {
    // Only scroll when we have new messages AND we haven't already scrolled for this message count
    if (messages.length > 0 && 
        threadContainerRef.current && 
        messages.length > lastScrollMessageCountRef.current) {
      // Scroll to START of thread container, not to last message
      threadContainerRef.current.scrollTop = 0;
      lastScrollMessageCountRef.current = messages.length;
    }
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <div className="mt-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
      <div className="text-xs font-semibold text-slate-600 mb-3 uppercase tracking-wide">
        Step Discussion
      </div>
      
      {/* Thread messages */}
      <div ref={threadContainerRef} className="space-y-2 mb-3 max-h-60 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-sm text-slate-500 italic">
            Ask questions about this specific step...
          </p>
        ) : (
          messages.map((msg, index) => {
            const isLastMessage = index === messages.length - 1;
            return (
              <div
                key={msg.id}
                ref={isLastMessage ? lastMessageRef : null}
                className={`text-sm p-3 rounded-lg ${
                  msg.type === 'user'
                    ? 'bg-blue-50 text-blue-900 ml-4 border border-blue-100'
                    : 'bg-white text-slate-700 mr-4 border border-slate-200 shadow-sm'
                }`}
              >
              <div className="font-semibold text-xs mb-1.5 opacity-70 flex items-center gap-1">
                {msg.type === 'user' ? (
                  <>
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                    You
                  </>
                ) : (
                  <>
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-teal-500"></span>
                    Assistant
                  </>
                )}
              </div>
              <div className={`prose prose-sm max-w-none ${msg.type === 'user' ? 'prose-blue' : 'prose-slate'}`}>
                {msg.type === 'assistant' ? (
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
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                ) : (
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                )}
              </div>
            </div>
            );
          })
        )}
        {isLoading && (
          <div className="text-sm p-3 rounded-lg bg-white text-slate-500 mr-4 border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2">
              <div className="animate-spin h-3 w-3 border-2 border-slate-300 border-t-teal-600 rounded-full"></div>
              <span className="text-xs">Analyzing step and formulating response...</span>
            </div>
          </div>
        )}
        {/* Invisible div for auto-scrolling */}
        <div ref={messagesEndRef} />
      </div>

      {/* Input form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => {
              const newValue = e.target.value;
              if (newValue.length <= MAX_INPUT_LENGTH) {
                setInput(newValue);
              }
            }}
            placeholder="Ask about this step..."
            disabled={isLoading}
            maxLength={MAX_INPUT_LENGTH}
            className="flex-1 text-sm px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 transition-all"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!input.trim() || isLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {input.length > MAX_INPUT_LENGTH * 0.8 && (
          <p className={`text-xs ${remainingChars < 50 ? 'text-red-600' : 'text-slate-500'}`}>
            {remainingChars} characters remaining
          </p>
        )}
      </form>
    </div>
  );
}
