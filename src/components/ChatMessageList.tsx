import { memo, useMemo } from 'react';
import ChatMessage from './ChatMessage';
import DateSeparator from './DateSeparator';
import TypingIndicator from './TypingIndicator';
import { Message } from '@/types';
import { isSameDay, formatMessageDate } from '@/lib/date-utils';

interface ChatMessageListProps {
  messages: Message[];
  isLoading: boolean;
  onSaveToggle: (message: Message) => void;
  onProtocolUpdate?: (updatedProtocol: any) => void;
  onFollowUpClick?: (question: string) => void;
  onRetryMessage?: (messageId: string) => void;
  isSavedProtocolMessage: (message: Message) => boolean;
  onUnsave?: () => void;
}

const ChatMessageList = memo(({
  messages,
  isLoading,
  onSaveToggle,
  onProtocolUpdate,
  onFollowUpClick,
  onRetryMessage,
  isSavedProtocolMessage,
  onUnsave,
}: ChatMessageListProps) => {
  // Group messages with date separators
  // PERFORMANCE: Only depend on messages array - callbacks are stable
  const messageElements = useMemo(() => {
    const elements: JSX.Element[] = [];
    
    messages.forEach((message, index) => {
      // Add date separator if this is the first message or date changed
      const shouldShowDate = index === 0 || !isSameDay(messages[index - 1].timestamp, message.timestamp);
      
      if (shouldShowDate) {
        elements.push(
          <DateSeparator 
            key={`date-${message.timestamp}`}
            label={formatMessageDate(message.timestamp)}
          />
        );
      }

      // Add message
      const isFirstUserMessage = message.type === 'user' && index === 0;
      elements.push(
        <div key={message.id}>
          <ChatMessage
            message={message}
            onSaveToggle={() => onSaveToggle(message)}
            onProtocolUpdate={onProtocolUpdate}
            onFollowUpClick={onFollowUpClick}
            onRetryMessage={onRetryMessage}
            isFirstUserMessage={isFirstUserMessage}
            isProtocolAlreadySaved={isSavedProtocolMessage(message)}
            onUnsave={onUnsave}
          />
        </div>
      );
    });

    return elements;
  }, [messages]); // Removed callbacks from deps - they're passed directly to ChatMessage

  return (
    <>
      {messageElements}
      {isLoading && <TypingIndicator />}
    </>
  );
});

ChatMessageList.displayName = 'ChatMessageList';

export default ChatMessageList;
