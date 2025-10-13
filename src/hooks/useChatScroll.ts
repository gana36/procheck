import { useRef, useEffect, useCallback, useState } from 'react';

interface UseChatScrollOptions {
  messageCount: number;
  isThreadInteraction?: boolean;
}

export function useChatScroll({ messageCount, isThreadInteraction = false }: UseChatScrollOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageCountRef = useRef(0);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const userHasScrolledRef = useRef(false);
  const isAutoScrollingRef = useRef(false);

  // Check if user is at bottom
  const isAtBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return true;
    
    const threshold = 50;
    const { scrollTop, scrollHeight, clientHeight } = container;
    return scrollHeight - scrollTop - clientHeight < threshold;
  }, []);

  // Scroll to bottom
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const container = containerRef.current;
    if (!container) return;

    isAutoScrollingRef.current = true;
    
    requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior,
      });
      
      setTimeout(() => {
        isAutoScrollingRef.current = false;
      }, behavior === 'smooth' ? 500 : 0);
    });
  }, []);

  // Handle user scroll
  const handleScroll = useCallback(() => {
    if (isAutoScrollingRef.current) return;
    
    const atBottom = isAtBottom();
    
    if (!atBottom) {
      userHasScrolledRef.current = true;
      setShowScrollButton(true);
    } else {
      userHasScrolledRef.current = false;
      setShowScrollButton(false);
    }
  }, [isAtBottom]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (isThreadInteraction) return;

    const hasNewMessages = messageCount > messageCountRef.current;
    
    if (hasNewMessages) {
      const previousCount = messageCountRef.current;
      messageCountRef.current = messageCount;
      
      if (!userHasScrolledRef.current || isAtBottom()) {
        const behavior = previousCount === 0 ? 'instant' : 'smooth';
        
        requestAnimationFrame(() => {
          scrollToBottom(behavior as ScrollBehavior);
        });
      }
    }
  }, [messageCount, isThreadInteraction, scrollToBottom, isAtBottom]);

  // Streaming support
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rafId: number;
    
    const observer = new MutationObserver(() => {
      if (rafId) cancelAnimationFrame(rafId);
      
      if (!userHasScrolledRef.current && isAtBottom()) {
        rafId = requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight;
        });
      }
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isAtBottom]);

  return {
    containerRef,
    messagesEndRef,
    showScrollButton,
    scrollToBottom,
    handleScroll,
  };
}
