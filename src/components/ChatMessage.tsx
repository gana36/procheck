import { Card, CardContent } from '@/components/ui/card';
import { Stethoscope, User } from 'lucide-react';
import { Message } from '@/types';
import ProtocolCard from './ProtocolCard';

interface ChatMessageProps {
  message: Message;
  onSaveToggle?: () => void;
}

export default function ChatMessage({ message, onSaveToggle }: ChatMessageProps) {
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (message.type === 'user') {
    return (
      <div className="flex justify-end mb-6">
        <div className="max-w-[80%]">
          <div className="flex items-end space-x-2">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-teal-600 rounded-full flex items-center justify-center">
                <User className="h-4 w-4 text-white" />
              </div>
            </div>
            <Card className="bg-teal-600 text-white border-teal-600">
              <CardContent className="p-4">
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              </CardContent>
            </Card>
          </div>
          <p className="text-xs text-slate-500 mt-1 text-right">
            {formatTime(message.timestamp)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-6">
      <div className="max-w-[90%]">
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0">
            <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
              <Stethoscope className="h-5 w-5 text-teal-600" />
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-2">
              <h4 className="font-semibold text-slate-900">ProCheck Protocol Assistant</h4>
              <span className="text-xs text-slate-500">{formatTime(message.timestamp)}</span>
            </div>
            
            {message.content && (
              <Card className="bg-slate-50 border-slate-200 mb-4">
                <CardContent className="p-4">
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">
                    {message.content}
                  </p>
                </CardContent>
              </Card>
            )}
            
            {message.protocolData && (
              <ProtocolCard protocolData={message.protocolData} onSaveToggle={onSaveToggle} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
