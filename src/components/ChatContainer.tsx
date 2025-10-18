import { memo, useState, useEffect, useCallback } from 'react';
import ChatMessageList from './ChatMessageList';
import OptimizedChatMessageList from './VirtualizedChatMessageList';
import MessageCountIndicator from './MessageCountIndicator';
import MessageSearch from './MessageSearch';
import { useChatScroll } from '@/hooks/useChatScroll';
import { Message } from '@/types';

interface ChatContainerProps {
  messages: Message[];
  isLoading: boolean;
  savedScrollPosition?: number;
  onSaveToggle: (message: Message) => void;
  onProtocolUpdate: (updatedProtocol: any) => void;
  onFollowUpClick: (question: string) => void;
  onRetryMessage: (messageId: string) => void;
  isSavedProtocolMessage: (message: Message) => boolean;
  onUnsave?: () => void;
}

const ChatContainer = memo(({
  messages,
  isLoading,
  savedScrollPosition = 0,
  onSaveToggle,
  onProtocolUpdate,
  onFollowUpClick,
  onRetryMessage,
  isSavedProtocolMessage,
  onUnsave,
}: ChatContainerProps) => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  
  const {
    containerRef,
    messagesEndRef,
    showScrollButton,
    scrollToBottom,
    scrollToTop,
    handleScroll,
  } = useChatScroll({
    messageCount: messages.length,
    savedScrollPosition,
    messages, // Pass messages for smart scroll detection
  });

  // Use optimized list for long conversations
  const useOptimizedList = messages.length > 30;

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Cmd/Ctrl + F to open search (only for long chats)
      if ((e.metaKey || e.ctrlKey) && e.key === 'f' && messages.length > 10) {
        e.preventDefault();
        setIsSearchOpen(true);
      }
      // Escape to close search
      if (e.key === 'Escape' && isSearchOpen) {
        setIsSearchOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [messages.length, isSearchOpen]);

  // Scroll to specific message
  const scrollToMessage = useCallback((messageId: string, _index: number) => {
    const container = containerRef.current;
    if (!container) return;

    // Find the message element
    const messageElement = container.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Highlight the message temporarily
      messageElement.classList.add('ring-2', 'ring-blue-400', 'ring-opacity-50');
      setTimeout(() => {
        messageElement.classList.remove('ring-2', 'ring-blue-400', 'ring-opacity-50');
      }, 2000);
    }
  }, [containerRef]);

  return (
    <>
      {/* Message Search - only show for chats with >10 messages */}
      {messages.length > 10 && (
        <MessageSearch
          messages={messages}
          onResultClick={scrollToMessage}
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
        />
      )}
      
      <div
        ref={containerRef}
        data-chat-container
        className="flex-1 overflow-y-auto p-4 space-y-4 relative"
        onScroll={handleScroll}
      >
        {/* Message count indicator for long chats */}
        <MessageCountIndicator 
          count={messages.length}
          scrollToTop={() => scrollToTop('smooth')}
        />

        {useOptimizedList ? (
          <OptimizedChatMessageList
            messages={messages}
            isLoading={isLoading}
            onSaveToggle={onSaveToggle}
            onProtocolUpdate={onProtocolUpdate}
            onFollowUpClick={onFollowUpClick}
            onRetryMessage={onRetryMessage}
            isSavedProtocolMessage={isSavedProtocolMessage}
            onUnsave={onUnsave}
          />
        ) : (
          <ChatMessageList
            messages={messages}
            isLoading={isLoading}
            onSaveToggle={onSaveToggle}
            onProtocolUpdate={onProtocolUpdate}
            onFollowUpClick={onFollowUpClick}
            onRetryMessage={onRetryMessage}
            isSavedProtocolMessage={isSavedProtocolMessage}
            onUnsave={onUnsave}
          />
        )}
        
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

        {/* Search hint for long chats */}
        {!isSearchOpen && messages.length > 10 && (
          <button
            onClick={() => setIsSearchOpen(true)}
            className="fixed bottom-24 right-24 bg-white hover:bg-slate-50 text-slate-600 rounded-full px-4 py-2 shadow-lg transition-all duration-200 z-10 flex items-center gap-2 text-sm border border-slate-200"
            aria-label="Search messages"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="hidden sm:inline">Search</span>
            <kbd className="hidden sm:inline text-xs bg-slate-100 px-1.5 py-0.5 rounded border border-slate-300">⌘F</kbd>
          </button>
        )}
      </div>
    </>
  );
});

ChatContainer.displayName = 'ChatContainer';

export default ChatContainer;
