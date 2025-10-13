import { memo } from 'react';
import ChatMessage from './ChatMessage';
import TypingIndicator from './TypingIndicator';
import { Message } from '@/types';

interface ChatMessageListProps {
  messages: Message[];
  isLoading: boolean;
  onSaveToggle: (message: Message) => void;
  onProtocolUpdate: (updatedProtocol: any) => void;
  onFollowUpClick: (question: string) => void;
  onRetryMessage: (messageId: string) => void;
  isSavedProtocolMessage: (message: Message) => boolean;
}

const ChatMessageList = memo(({
  messages,
  isLoading,
  onSaveToggle,
  onProtocolUpdate,
  onFollowUpClick,
  onRetryMessage,
  isSavedProtocolMessage,
}: ChatMessageListProps) => {
  return (
    <>
      {messages.map((message, index) => {
        const isFirstUserMessage = message.type === 'user' && index === 0;
        return (
          <div key={message.id}>
            <ChatMessage
              message={message}
              onSaveToggle={() => onSaveToggle(message)}
              onProtocolUpdate={onProtocolUpdate}
              onFollowUpClick={onFollowUpClick}
              onRetryMessage={onRetryMessage}
              isFirstUserMessage={isFirstUserMessage}
              isProtocolAlreadySaved={isSavedProtocolMessage(message)}
            />
          </div>
        );
      })}
      {isLoading && <TypingIndicator />}
    </>
  );
});

ChatMessageList.displayName = 'ChatMessageList';

export default ChatMessageList;
