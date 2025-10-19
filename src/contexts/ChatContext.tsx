import React, { createContext, useContext, useReducer, useRef, useCallback, useEffect, useMemo } from 'react';
import { Message, ConversationTab, AppTab } from '@/types';
import { generateTabId, generateConversationId, generateMessageId } from '@/lib/id-generator';
import { saveConversation, getConversation, ConversationMessage } from '@/lib/api';

// Extended Message type with status tracking
export interface EnhancedMessage extends Message {
  status?: 'pending' | 'sent' | 'failed' | 'retrying';
  retryCount?: number;
  error?: string;
}

// Chat state interface
interface ChatState {
  tabs: AppTab[];
  activeTabId: string;
  conversationCache: Map<string, EnhancedMessage[]>;
  pendingRequests: Map<string, AbortController>;
  typingStatus: Map<string, boolean>; // tabId -> isTyping
  failedMessages: Map<string, EnhancedMessage>; // messageId -> message
}

// Action types
type ChatAction =
  | { type: 'CREATE_TAB'; payload: { tab: AppTab } }
  | { type: 'CLOSE_TAB'; payload: { tabId: string } }
  | { type: 'SWITCH_TAB'; payload: { tabId: string } }
  | { type: 'UPDATE_TAB'; payload: { tabId: string; updates: Partial<AppTab> } }
  | { type: 'ADD_MESSAGE'; payload: { tabId: string; message: EnhancedMessage } }
  | { type: 'UPDATE_MESSAGE'; payload: { tabId: string; messageId: string; updates: Partial<EnhancedMessage> } }
  | { type: 'SET_MESSAGES'; payload: { tabId: string; messages: EnhancedMessage[] } }
  | { type: 'SET_TYPING'; payload: { tabId: string; isTyping: boolean } }
  | { type: 'SET_LOADING'; payload: { tabId: string; isLoading: boolean } }
  | { type: 'CACHE_CONVERSATION'; payload: { conversationId: string; messages: EnhancedMessage[] } }
  | { type: 'REMOVE_FROM_CACHE'; payload: { conversationId: string } }
  | { type: 'ADD_PENDING_REQUEST'; payload: { requestId: string; controller: AbortController } }
  | { type: 'REMOVE_PENDING_REQUEST'; payload: { requestId: string } }
  | { type: 'MARK_MESSAGE_FAILED'; payload: { messageId: string; message: EnhancedMessage } }
  | { type: 'REMOVE_FAILED_MESSAGE'; payload: { messageId: string } }
  | { type: 'RESTORE_TABS'; payload: { tabs: AppTab[]; activeTabId: string } }
  | { type: 'CLOSE_ALL_TABS' };

// Reducer function
function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'CREATE_TAB':
      return {
        ...state,
        tabs: [...state.tabs, action.payload.tab],
        activeTabId: action.payload.tab.id,
      };

    case 'CLOSE_TAB': {
      const newTabs = state.tabs.filter(tab => tab.id !== action.payload.tabId);
      
      // If closing active tab, switch to another
      let newActiveTabId = state.activeTabId;
      if (action.payload.tabId === state.activeTabId && newTabs.length > 0) {
        newActiveTabId = newTabs[0].id;
      }

      // Always keep at least one tab
      if (newTabs.length === 0) {
        const defaultTab: ConversationTab = {
          id: generateTabId(),
          title: 'New Protocol',
          type: 'chat',
          messages: [],
          conversationId: generateConversationId(),
          isLoading: false,
        };
        return {
          ...state,
          tabs: [defaultTab],
          activeTabId: defaultTab.id,
        };
      }

      return {
        ...state,
        tabs: newTabs,
        activeTabId: newActiveTabId,
      };
    }

    case 'SWITCH_TAB':
      return {
        ...state,
        activeTabId: action.payload.tabId,
      };

    case 'UPDATE_TAB':
      return {
        ...state,
        tabs: state.tabs.map(tab =>
          tab.id === action.payload.tabId
            ? { ...tab, ...action.payload.updates } as AppTab
            : tab
        ),
      };

    case 'ADD_MESSAGE': {
      return {
        ...state,
        tabs: state.tabs.map(tab => {
          if (tab.id === action.payload.tabId && tab.type === 'chat') {
            return {
              ...tab,
              messages: [...tab.messages, action.payload.message],
            };
          }
          return tab;
        }),
      };
    }

    case 'UPDATE_MESSAGE':
      return {
        ...state,
        tabs: state.tabs.map(tab => {
          if (tab.id === action.payload.tabId && tab.type === 'chat') {
            return {
              ...tab,
              messages: tab.messages.map(msg =>
                msg.id === action.payload.messageId
                  ? { ...msg, ...action.payload.updates }
                  : msg
              ),
            };
          }
          return tab;
        }),
      };

    case 'SET_MESSAGES':
      return {
        ...state,
        tabs: state.tabs.map(tab => {
          if (tab.id === action.payload.tabId && tab.type === 'chat') {
            return {
              ...tab,
              messages: action.payload.messages,
            };
          }
          return tab;
        }),
      };

    case 'SET_TYPING': {
      const newTypingStatus = new Map(state.typingStatus);
      newTypingStatus.set(action.payload.tabId, action.payload.isTyping);
      return {
        ...state,
        typingStatus: newTypingStatus,
      };
    }

    case 'SET_LOADING':
      return {
        ...state,
        tabs: state.tabs.map(tab =>
          tab.id === action.payload.tabId
            ? { ...tab, isLoading: action.payload.isLoading }
            : tab
        ),
      };

    case 'CACHE_CONVERSATION': {
      const newCache = new Map(state.conversationCache);
      newCache.set(action.payload.conversationId, action.payload.messages);
      
      // Implement LRU eviction - keep only last 20 conversations
      if (newCache.size > 20) {
        const firstKey = newCache.keys().next().value;
        if (firstKey) {
          newCache.delete(firstKey);
        }
      }
      
      return {
        ...state,
        conversationCache: newCache,
      };
    }

    case 'REMOVE_FROM_CACHE': {
      const newCache = new Map(state.conversationCache);
      newCache.delete(action.payload.conversationId);
      return {
        ...state,
        conversationCache: newCache,
      };
    }

    case 'ADD_PENDING_REQUEST': {
      const newPending = new Map(state.pendingRequests);
      newPending.set(action.payload.requestId, action.payload.controller);
      return {
        ...state,
        pendingRequests: newPending,
      };
    }

    case 'REMOVE_PENDING_REQUEST': {
      const newPending = new Map(state.pendingRequests);
      newPending.delete(action.payload.requestId);
      return {
        ...state,
        pendingRequests: newPending,
      };
    }

    case 'MARK_MESSAGE_FAILED': {
      const newFailed = new Map(state.failedMessages);
      newFailed.set(action.payload.messageId, action.payload.message);
      return {
        ...state,
        failedMessages: newFailed,
      };
    }

    case 'REMOVE_FAILED_MESSAGE': {
      const newFailed = new Map(state.failedMessages);
      newFailed.delete(action.payload.messageId);
      return {
        ...state,
        failedMessages: newFailed,
      };
    }

    case 'RESTORE_TABS':
      return {
        ...state,
        tabs: action.payload.tabs,
        activeTabId: action.payload.activeTabId,
      };

    case 'CLOSE_ALL_TABS': {
      const defaultTab: ConversationTab = {
        id: generateTabId(),
        title: 'New Protocol',
        type: 'chat',
        messages: [],
        conversationId: generateConversationId(),
        isLoading: false,
      };
      return {
        ...state,
        tabs: [defaultTab],
        activeTabId: defaultTab.id,
      };
    }

    default:
      return state;
  }
}

// Context type
interface ChatContextType {
  // State
  tabs: AppTab[];
  activeTabId: string;
  activeTab: AppTab | null;
  messages: EnhancedMessage[];
  isLoading: boolean;
  isTyping: boolean;
  
  // Tab management
  createTab: (title?: string, type?: AppTab['type']) => string;
  closeTab: (tabId: string) => Promise<void>;
  switchTab: (tabId: string) => Promise<void>;
  updateTab: (tabId: string, updates: Partial<AppTab>) => void;
  closeAllTabs: () => Promise<void>;
  
  // Message management
  addMessage: (tabId: string, message: EnhancedMessage) => void;
  updateMessage: (tabId: string, messageId: string, updates: Partial<EnhancedMessage>) => void;
  setMessages: (tabId: string, messages: EnhancedMessage[]) => void;
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<void>;
  retryMessage: (messageId: string) => Promise<void>;
  
  // Typing indicators
  setTyping: (tabId: string, isTyping: boolean) => void;
  
  // Conversation management
  loadConversation: (conversationId: string) => Promise<void>;
  saveCurrentConversation: (messages: EnhancedMessage[], lastQuery: string) => Promise<void>;
  getCachedConversation: (conversationId: string) => EnhancedMessage[] | null;
  
  // Request management
  abortPendingRequests: (requestId?: string) => void;
  
  // Failed messages
  getFailedMessages: () => EnhancedMessage[];
}

interface SendMessageOptions {
  skipDialogCheck?: boolean;
  onSuccess?: (message: EnhancedMessage) => void;
  onError?: (error: Error) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

// LocalStorage keys
const STORAGE_KEYS = {
  TABS: 'procheck_chat_tabs',
  ACTIVE_TAB: 'procheck_active_tab',
};

interface ChatProviderProps {
  children: React.ReactNode;
  userId: string | null;
  onSendMessageHandler?: (content: string, skipDialogCheck: boolean) => Promise<void>;
}

export function ChatProvider({ children, userId, onSendMessageHandler }: ChatProviderProps) {
  // Initialize state with default tab
  const initialState: ChatState = {
    tabs: [{
      id: generateTabId(),
      title: 'New Protocol',
      type: 'chat',
      messages: [],
      conversationId: generateConversationId(),
      isLoading: false,
    }],
    activeTabId: '',
    conversationCache: new Map(),
    pendingRequests: new Map(),
    typingStatus: new Map(),
    failedMessages: new Map(),
  };

  initialState.activeTabId = initialState.tabs[0].id;

  const [state, dispatch] = useReducer(chatReducer, initialState);
  const isRestoringRef = useRef(false);

  // Restore tabs from localStorage on mount
  useEffect(() => {
    if (isRestoringRef.current) return;
    isRestoringRef.current = true;

    try {
      const savedTabs = localStorage.getItem(STORAGE_KEYS.TABS);
      const savedActiveTab = localStorage.getItem(STORAGE_KEYS.ACTIVE_TAB);

      if (savedTabs && savedActiveTab) {
        const tabs = JSON.parse(savedTabs) as AppTab[];
        if (tabs.length > 0) {
          dispatch({
            type: 'RESTORE_TABS',
            payload: { tabs, activeTabId: savedActiveTab },
          });
        }
      }
    } catch (error) {
      console.error('Failed to restore tabs from localStorage:', error);
    }
  }, []);

  // Persist tabs to localStorage whenever they change (ASYNC to prevent UI jank)
  useEffect(() => {
    if (isRestoringRef.current) {
      isRestoringRef.current = false;
      return;
    }

    // Use queueMicrotask to defer localStorage writes without blocking render
    queueMicrotask(() => {
      try {
        localStorage.setItem(STORAGE_KEYS.TABS, JSON.stringify(state.tabs));
        localStorage.setItem(STORAGE_KEYS.ACTIVE_TAB, state.activeTabId);
      } catch (error) {
        console.error('Failed to persist tabs to localStorage:', error);
      }
    });
  }, [state.tabs, state.activeTabId]);

  // Get active tab
  const activeTab = useMemo(() => {
    return state.tabs.find(tab => tab.id === state.activeTabId) || null;
  }, [state.tabs, state.activeTabId]);

  // Get messages from active tab
  const messages = useMemo(() => {
    if (activeTab && activeTab.type === 'chat') {
      return activeTab.messages as EnhancedMessage[];
    }
    return [];
  }, [activeTab]);

  // Get loading state
  const isLoading = activeTab?.isLoading || false;

  // Get typing state
  const isTyping = state.typingStatus.get(state.activeTabId) || false;

  // Helper to get current conversation ID
  const getCurrentConversationId = useCallback(() => {
    if (activeTab && activeTab.type === 'chat') {
      return activeTab.conversationId;
    }
    return null;
  }, [activeTab]);

  // Helper to get user timestamp
  const getUserTimestamp = useCallback(() => {
    const now = new Date();
    return now.toISOString();
  }, []);

  // Tab management functions
  const createTab = useCallback((title: string = 'New Protocol', type: AppTab['type'] = 'chat'): string => {
    const newTabId = generateTabId();
    
    let newTab: AppTab;
    if (type === 'chat') {
      newTab = {
        id: newTabId,
        title,
        type: 'chat' as const,
        messages: [],
        conversationId: generateConversationId(),
        isLoading: false,
      };
    } else if (type === 'generated-protocols') {
      newTab = {
        id: newTabId,
        title,
        type: 'generated-protocols' as const,
        protocols: [],
        isLoading: false,
      };
    } else {
      newTab = {
        id: newTabId,
        title,
        type: 'protocol-index' as const,
        protocols: [],
        isLoading: false,
      };
    }

    dispatch({ type: 'CREATE_TAB', payload: { tab: newTab } });
    return newTabId;
  }, []);

  const closeTab = useCallback(async (tabId: string) => {
    // Save tab before closing if it has messages
    const tabToClose = state.tabs.find(tab => tab.id === tabId);
    if (tabToClose && tabToClose.type === 'chat' && tabToClose.messages.length > 0 && userId) {
      const lastUserMessage = [...tabToClose.messages].reverse().find(m => m.type === 'user');
      if (lastUserMessage) {
        await saveCurrentConversation(tabToClose.messages as EnhancedMessage[], lastUserMessage.content);
      }
    }

    dispatch({ type: 'CLOSE_TAB', payload: { tabId } });
  }, [state.tabs, userId]);

  const switchTab = useCallback(async (tabId: string) => {
    // Abort any pending requests
    state.pendingRequests.forEach(controller => controller.abort());
    dispatch({ type: 'REMOVE_PENDING_REQUEST', payload: { requestId: 'all' } });

    // Save current tab before switching
    if (activeTab && activeTab.type === 'chat' && activeTab.messages.length > 0 && userId) {
      const lastUserMessage = [...activeTab.messages].reverse().find(m => m.type === 'user');
      if (lastUserMessage) {
        await saveCurrentConversation(activeTab.messages as EnhancedMessage[], lastUserMessage.content);
      }
    }

    dispatch({ type: 'SWITCH_TAB', payload: { tabId } });
  }, [state.pendingRequests, activeTab, userId]);

  const updateTab = useCallback((tabId: string, updates: Partial<AppTab>) => {
    dispatch({ type: 'UPDATE_TAB', payload: { tabId, updates } });
  }, []);

  const closeAllTabs = useCallback(async () => {
    // No need to save - tabs are auto-saved on switch/close/message updates
    dispatch({ type: 'CLOSE_ALL_TABS' });
  }, []);

  // Message management functions
  const addMessage = useCallback((tabId: string, message: EnhancedMessage) => {
    dispatch({ type: 'ADD_MESSAGE', payload: { tabId, message } });
  }, []);

  const updateMessage = useCallback((tabId: string, messageId: string, updates: Partial<EnhancedMessage>) => {
    dispatch({ type: 'UPDATE_MESSAGE', payload: { tabId, messageId, updates } });
  }, []);

  const setMessages = useCallback((tabId: string, messages: EnhancedMessage[]) => {
    dispatch({ type: 'SET_MESSAGES', payload: { tabId, messages } });
  }, []);

  const setTyping = useCallback((tabId: string, isTyping: boolean) => {
    dispatch({ type: 'SET_TYPING', payload: { tabId, isTyping } });
  }, []);

  // Save conversation with debouncing
  const saveCurrentConversation = useCallback(async (messages: EnhancedMessage[], lastQuery: string) => {
    if (!userId) return;

    const conversationId = getCurrentConversationId();
    if (!conversationId) return;

    try {
      const conversationMessages: ConversationMessage[] = messages.map(msg => ({
        id: msg.id,
        type: msg.type as 'user' | 'assistant',
        content: msg.content,
        timestamp: msg.timestamp,
        protocol_data: msg.protocolData || undefined,
        follow_up_questions: msg.followUpQuestions || undefined,
      }));

      const firstMessageTimestamp = messages.length > 0 ? messages[0].timestamp : getUserTimestamp();

      await saveConversation(userId, {
        id: conversationId,
        title: lastQuery.length > 50 ? lastQuery.substring(0, 50) + '...' : lastQuery,
        messages: conversationMessages,
        last_query: lastQuery,
        tags: ['medical-protocol'],
        created_at: firstMessageTimestamp,
      });

      // Update cache
      dispatch({
        type: 'CACHE_CONVERSATION',
        payload: { conversationId, messages },
      });

      console.log('✅ Conversation saved and cached');
    } catch (error) {
      console.error('Failed to save conversation:', error);
    }
  }, [userId, getCurrentConversationId, getUserTimestamp]);

  // Load conversation
  const loadConversation = useCallback(async (conversationId: string) => {
    if (!userId) return;

    // Check cache first
    const cached = state.conversationCache.get(conversationId);
    if (cached) {
      console.log('✅ Using cached conversation');
      const newTabId = createTab('Loading...', 'chat');
      setMessages(newTabId, cached);
      const firstContent = cached[0]?.content || 'Recent Search';
      updateTab(newTabId, {
        conversationId,
        title: firstContent.substring(0, 30),
      });
      return;
    }

    console.log('🔄 Fetching conversation from server');
    const newTabId = createTab('Loading...', 'chat');
    dispatch({ type: 'SET_LOADING', payload: { tabId: newTabId, isLoading: true } });

    try {
      const response = await getConversation(userId, conversationId);

      if (response.success && response.conversation) {
        const conv = response.conversation;
        const loadedMessages: EnhancedMessage[] = (conv.messages || []).map((msg: ConversationMessage) => ({
          id: msg.id,
          type: msg.type,
          content: msg.content,
          timestamp: msg.timestamp,
          protocolData: msg.protocol_data,
          followUpQuestions: msg.follow_up_questions,
          status: 'sent',
        }));

        setMessages(newTabId, loadedMessages);
        updateTab(newTabId, {
          conversationId,
          title: conv.title || 'Recent Search',
          isLoading: false,
        });

        // Cache the conversation
        dispatch({
          type: 'CACHE_CONVERSATION',
          payload: { conversationId, messages: loadedMessages },
        });
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
      dispatch({ type: 'SET_LOADING', payload: { tabId: newTabId, isLoading: false } });
    }
  }, [userId, state.conversationCache, createTab, setMessages, updateTab]);

  // Get cached conversation
  const getCachedConversation = useCallback((conversationId: string): EnhancedMessage[] | null => {
    return state.conversationCache.get(conversationId) || null;
  }, [state.conversationCache]);

  // Send message with optimistic updates
  const sendMessage = useCallback(async (content: string, options: SendMessageOptions = {}) => {
    if (!activeTab || activeTab.type !== 'chat') return;

    const messageId = generateMessageId();
    const userMessage: EnhancedMessage = {
      id: messageId,
      type: 'user',
      content,
      timestamp: getUserTimestamp(),
      status: 'pending',
    };

    // Optimistic update - add message immediately
    addMessage(activeTab.id, userMessage);
    dispatch({ type: 'SET_LOADING', payload: { tabId: activeTab.id, isLoading: true } });
    setTyping(activeTab.id, true);

    try {
      // Use the provided handler or throw error
      if (onSendMessageHandler) {
        await onSendMessageHandler(content, options.skipDialogCheck || false);
      }

      // Mark message as sent
      updateMessage(activeTab.id, messageId, { status: 'sent' });
      
      if (options.onSuccess) {
        options.onSuccess(userMessage);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      
      // Mark message as failed
      updateMessage(activeTab.id, messageId, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Failed to send message',
      });

      dispatch({
        type: 'MARK_MESSAGE_FAILED',
        payload: { messageId, message: userMessage },
      });

      if (options.onError) {
        options.onError(error instanceof Error ? error : new Error('Failed to send message'));
      }
    } finally {
      dispatch({ type: 'SET_LOADING', payload: { tabId: activeTab.id, isLoading: false } });
      setTyping(activeTab.id, false);
    }
  }, [activeTab, addMessage, updateMessage, setTyping, getUserTimestamp, onSendMessageHandler]);

  // Retry failed message
  const retryMessage = useCallback(async (messageId: string) => {
    const failedMessage = state.failedMessages.get(messageId);
    if (!failedMessage || !activeTab || activeTab.type !== 'chat') return;

    // Update retry count
    const retryCount = (failedMessage.retryCount || 0) + 1;
    updateMessage(activeTab.id, messageId, {
      status: 'retrying',
      retryCount,
    });

    try {
      if (onSendMessageHandler) {
        await onSendMessageHandler(failedMessage.content, false);
      }

      // Mark as sent and remove from failed messages
      updateMessage(activeTab.id, messageId, { status: 'sent', error: undefined });
      dispatch({ type: 'REMOVE_FAILED_MESSAGE', payload: { messageId } });
    } catch (error) {
      console.error('Retry failed:', error);
      updateMessage(activeTab.id, messageId, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Retry failed',
      });
    }
  }, [state.failedMessages, activeTab, updateMessage, onSendMessageHandler]);

  // Abort pending requests
  const abortPendingRequests = useCallback((requestId?: string) => {
    if (requestId) {
      const controller = state.pendingRequests.get(requestId);
      if (controller) {
        controller.abort();
        dispatch({ type: 'REMOVE_PENDING_REQUEST', payload: { requestId } });
      }
    } else {
      // Abort all
      state.pendingRequests.forEach(controller => controller.abort());
      state.pendingRequests.clear();
    }
  }, [state.pendingRequests]);

  // Get failed messages
  const getFailedMessages = useCallback(() => {
    return Array.from(state.failedMessages.values());
  }, [state.failedMessages]);

  const value: ChatContextType = {
    // State
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    activeTab,
    messages,
    isLoading,
    isTyping,
    
    // Tab management
    createTab,
    closeTab,
    switchTab,
    updateTab,
    closeAllTabs,
    
    // Message management
    addMessage,
    updateMessage,
    setMessages,
    sendMessage,
    retryMessage,
    
    // Typing indicators
    setTyping,
    
    // Conversation management
    loadConversation,
    saveCurrentConversation,
    getCachedConversation,
    
    // Request management
    abortPendingRequests,
    
    // Failed messages
    getFailedMessages,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within ChatProvider');
  }
  return context;
}
