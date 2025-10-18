import { memo, useMemo, useRef, useEffect, useState } from 'react';
import ChatMessage from './ChatMessage';
import DateSeparator from './DateSeparator';
import TypingIndicator from './TypingIndicator';
import { Message } from '@/types';
import { isSameDay, formatMessageDate } from '@/lib/date-utils';

interface LazyMessageProps {
  message: Message;
  isFirstUserMessage: boolean;
  onSaveToggle: (message: Message) => void;
  onProtocolUpdate: (updatedProtocol: any) => void;
  onFollowUpClick: (question: string) => void;
  onRetryMessage: (messageId: string) => void;
  isProtocolAlreadySaved: boolean;
}

// Lazy-loaded message component using Intersection Observer
const LazyMessage = memo(({
  message,
  isFirstUserMessage,
  onSaveToggle,
  onProtocolUpdate,
  onFollowUpClick,
  onRetryMessage,
  isProtocolAlreadySaved,
}: LazyMessageProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.unobserve(entry.target);
          }
        });
      },
      {
        root: null,
        rootMargin: '200px', // Load messages 200px before they enter viewport
        threshold: 0,
      }
    );

    observer.observe(element);

    return () => {
      if (element) {
        observer.unobserve(element);
      }
    };
  }, []);

  return (
    <div ref={elementRef} style={{ minHeight: isVisible ? 'auto' : '100px' }}>
      {isVisible ? (
        <ChatMessage
          message={message}
          onSaveToggle={() => onSaveToggle(message)}
          onProtocolUpdate={onProtocolUpdate}
          onFollowUpClick={onFollowUpClick}
          onRetryMessage={onRetryMessage}
          isFirstUserMessage={isFirstUserMessage}
          isProtocolAlreadySaved={isProtocolAlreadySaved}
        />
      ) : (
        <div className="animate-pulse bg-slate-100 rounded-lg h-24 mx-4" />
      )}
    </div>
  );
});

LazyMessage.displayName = 'LazyMessage';

interface OptimizedChatMessageListProps {
  messages: Message[];
  isLoading: boolean;
  onSaveToggle: (message: Message) => void;
  onProtocolUpdate?: (updatedProtocol: any) => void;
  onFollowUpClick?: (question: string) => void;
  onRetryMessage?: (messageId: string) => void;
  isSavedProtocolMessage: (message: Message) => boolean;
  enableLazyLoading?: boolean; // Enable for chats with >50 messages
  searchFilter?: 'all' | 'global' | 'user';
  onSearchFilterChange?: (filter: 'all' | 'global' | 'user') => void;
}

const OptimizedChatMessageList = memo(({
  messages,
  isLoading,
  onSaveToggle,
  onProtocolUpdate,
  onFollowUpClick,
  onRetryMessage,
  isSavedProtocolMessage,
  enableLazyLoading = false,
}: OptimizedChatMessageListProps) => {
  // Automatically enable lazy loading for long chats
  const shouldUseLazyLoading = enableLazyLoading || messages.length > 50;

  // Group messages with date separators
  const messageElements = useMemo(() => {
    const elements: JSX.Element[] = [];
    
    // Always render the last 20 messages eagerly for better UX
    const eagerLoadThreshold = messages.length - 20;
    
    messages.forEach((message, index) => {
      // Add date separator if this is the first message or date changed
      const shouldShowDate = index === 0 || !isSameDay(messages[index - 1].timestamp, message.timestamp);
      
      if (shouldShowDate) {
        elements.push(
          <DateSeparator 
            key={`date-${message.timestamp}-${index}`}
            label={formatMessageDate(message.timestamp)}
          />
        );
      }

      // Add message
      const isFirstUserMessage = message.type === 'user' && index === 0;
      const shouldLazyLoad = shouldUseLazyLoading && index < eagerLoadThreshold;

      if (shouldLazyLoad) {
        elements.push(
          <LazyMessage
            key={message.id}
            message={message}
            isFirstUserMessage={isFirstUserMessage}
            onSaveToggle={onSaveToggle}
            onProtocolUpdate={onProtocolUpdate}
            onFollowUpClick={onFollowUpClick}
            onRetryMessage={onRetryMessage}
            isProtocolAlreadySaved={isSavedProtocolMessage(message)}
          />
        );
      } else {
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
            />
          </div>
        );
      }
    });

    return elements;
  }, [messages, shouldUseLazyLoading, onSaveToggle, onProtocolUpdate, onFollowUpClick, onRetryMessage, isSavedProtocolMessage]);

  return (
    <>
      {messageElements}
      {isLoading && <TypingIndicator />}
    </>
  );
});

OptimizedChatMessageList.displayName = 'OptimizedChatMessageList';

export default OptimizedChatMessageList;
