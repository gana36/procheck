import { memo } from 'react';
import ChatMessageList from './ChatMessageList';
import { useChatScroll } from '@/hooks/useChatScroll';
import { Message } from '@/types';

interface ChatContainerProps {
  messages: Message[];
  isLoading: boolean;
  isThreadInteraction?: boolean;
  onSaveToggle: (message: Message) => void;
  onProtocolUpdate: (updatedProtocol: any) => void;
  onFollowUpClick: (question: string) => void;
  onRetryMessage: (messageId: string) => void;
  isSavedProtocolMessage: (message: Message) => boolean;
}

const ChatContainer = memo(({
  messages,
  isLoading,
  isThreadInteraction = false,
  onSaveToggle,
  onProtocolUpdate,
  onFollowUpClick,
  onRetryMessage,
  isSavedProtocolMessage,
}: ChatContainerProps) => {
  const {
    containerRef,
    messagesEndRef,
    showScrollButton,
    scrollToBottom,
    handleScroll,
  } = useChatScroll({
    messageCount: messages.length,
    isThreadInteraction,
  });

  return (
    <>
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 relative"
        onScroll={handleScroll}
      >
        <ChatMessageList
          messages={messages}
          isLoading={isLoading}
          onSaveToggle={onSaveToggle}
          onProtocolUpdate={onProtocolUpdate}
          onFollowUpClick={onFollowUpClick}
          onRetryMessage={onRetryMessage}
          isSavedProtocolMessage={isSavedProtocolMessage}
        />
        <div ref={messagesEndRef} />
        
        {/* Scroll to Bottom Button */}
        {showScrollButton && (
          <button
            onClick={() => scrollToBottom('smooth')}
            className="fixed bottom-24 right-8 bg-slate-700 hover:bg-slate-800 text-white rounded-full p-3 shadow-lg transition-all duration-200 z-10 flex items-center gap-2"
            aria-label="Scroll to bottom"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        )}
      </div>
    </>
  );
});

ChatContainer.displayName = 'ChatContainer';

export default ChatContainer;
