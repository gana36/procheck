import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from './ui/button';
import { StepThreadMessage } from '../types';

interface StepThreadProps {
  stepId: number;
  stepText: string;
  messages: StepThreadMessage[];
  onSendMessage: (message: string) => void;
  isLoading: boolean;
}

export default function StepThread({ stepId, stepText, messages, onSendMessage, isLoading }: StepThreadProps) {
  const [input, setInput] = useState('');

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
      <div className="space-y-2 mb-3 max-h-60 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-sm text-slate-500 italic">
            Ask questions about this specific step...
          </p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`text-sm p-2 rounded ${
                msg.type === 'user'
                  ? 'bg-blue-50 text-blue-900 ml-4'
                  : 'bg-white text-slate-700 mr-4 border border-slate-200'
              }`}
            >
              <div className="font-medium text-xs mb-1 opacity-70">
                {msg.type === 'user' ? 'You' : 'Assistant'}
              </div>
              {msg.content}
            </div>
          ))
        )}
        {isLoading && (
          <div className="text-sm p-2 rounded bg-white text-slate-500 mr-4 border border-slate-200">
            <div className="flex items-center gap-2">
              <div className="animate-spin h-3 w-3 border-2 border-slate-300 border-t-slate-600 rounded-full"></div>
              Thinking...
            </div>
          </div>
        )}
      </div>

      {/* Input form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this step..."
          disabled={isLoading}
          className="flex-1 text-sm px-3 py-2 rounded border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
        />
        <Button
          type="submit"
          size="sm"
          disabled={!input.trim() || isLoading}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
