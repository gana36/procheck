import { CheckCheck, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EnhancedMessage } from '@/contexts/ChatContext';

interface MessageStatusProps {
  message: EnhancedMessage;
  onRetry?: () => void;
}

export default function MessageStatus({ message, onRetry }: MessageStatusProps) {
  if (message.type !== 'user') return null;

  const status = message.status || 'sent';

  switch (status) {
    case 'pending':
      return (
        <div className="flex items-center space-x-1 text-xs text-slate-400 mt-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Sending...</span>
        </div>
      );

    case 'sent':
      return (
        <div className="flex items-center space-x-1 text-xs text-slate-400 mt-1">
          <CheckCheck className="h-3 w-3" />
          <span>Sent</span>
        </div>
      );

    case 'failed':
      return (
        <div className="flex items-center space-x-2 text-xs text-red-600 mt-1">
          <AlertCircle className="h-3 w-3" />
          <span>{message.error || 'Failed to send'}</span>
          {onRetry && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRetry}
              className="h-6 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          )}
        </div>
      );

    case 'retrying':
      return (
        <div className="flex items-center space-x-1 text-xs text-amber-600 mt-1">
          <RefreshCw className="h-3 w-3 animate-spin" />
          <span>Retrying... (Attempt {(message.retryCount || 0) + 1})</span>
        </div>
      );

    default:
      return null;
  }
}
