import { useState, useRef, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Menu, X } from 'lucide-react';
import LandingScreen from '@/components/LandingScreen';
import Sidebar from '@/components/Sidebar';
import ChatInput from '@/components/ChatInput';
import ChatMessage from '@/components/ChatMessage';
import LoginPage from '@/components/auth/LoginPage';
import SignupPage from '@/components/auth/SignupPage';
import ForgotPasswordPage from '@/components/auth/ForgotPasswordPage';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Message, ProtocolData, ProtocolStep, Citation, SearchMetadata } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { searchProtocols, generateProtocol, saveConversation, getConversation, getSavedProtocol, ConversationMessage } from '@/lib/api';

function App() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Extract stable userId to prevent callback recreation
  const userId = currentUser?.uid || null;

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string>(() =>
    `conv_${Date.now()}`
  );
  const [savedProtocolsRefreshTrigger, setSavedProtocolsRefreshTrigger] = useState(0);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageCountRef = useRef(0);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const lastAssistantMessageRef = useRef<HTMLDivElement>(null);
  const isThreadInteractionRef = useRef(false);

  // Cache for loaded conversations to prevent redundant fetches
  const conversationCache = useRef<Map<string, Message[]>>(new Map());

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToLastAssistant = () => {
    console.log('scrollToLastAssistant called, lastAssistantMessageRef:', !!lastAssistantMessageRef.current);
    // Scroll to START of last assistant message, not to bottom
    if (lastAssistantMessageRef.current) {
      console.log('Scrolling to last assistant message');
      // Check if this is a protocol message
      const hasProtocol = lastAssistantMessageRef.current.querySelector('[data-protocol-card]');
      console.log('Last assistant message has protocol:', !!hasProtocol);
      lastAssistantMessageRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const scrollCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    // Throttle scroll checks to prevent excessive re-renders
    if (scrollCheckTimeoutRef.current) return;
    
    scrollCheckTimeoutRef.current = setTimeout(() => {
      const target = e.currentTarget;
      // FIX: Check if target and its properties exist before accessing
      if (target && target.scrollHeight !== null && target.scrollTop !== null && target.clientHeight !== null) {
        const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 100;
        setShowScrollButton(!isAtBottom);
      }
      scrollCheckTimeoutRef.current = null;
    }, 150);
  };

  useEffect(() => {
    console.log('Messages useEffect triggered:', {
      messagesLength: messages.length,
      messageCountRef: messageCountRef.current,
      isThreadInteraction: isThreadInteractionRef.current
    });
    
    // CRITICAL: If this is a thread interaction, NEVER scroll
    if (isThreadInteractionRef.current) {
      console.log('Thread interaction detected - NOT scrolling');
      isThreadInteractionRef.current = false;
      return; // Exit early - don't scroll at all
    }
    
    // Only scroll when new messages are added, not when existing messages are updated
    if (messages.length > messageCountRef.current) {
      console.log('New message detected - scrolling to last assistant');
      // Scroll to START of new assistant message instead of bottom
      setTimeout(() => {
        scrollToLastAssistant();
      }, 100);
      messageCountRef.current = messages.length;
    } else {
      console.log('No scroll condition met');
    }
  }, [messages]);

  const handleStartSearch = () => {
    if (currentUser) {
      navigate('/dashboard');
      setIsSidebarOpen(true);
    } else {
      navigate('/login');
    }
  };

  const handleSampleQuery = (query: string) => {
    if (currentUser) {
      navigate('/dashboard');
      setIsSidebarOpen(true);
      setTimeout(() => {
        handleSendMessage(query);
      }, 100);
    } else {
      navigate('/login');
    }
  };

  const cleanStepText = (text: string): string => {
    if (!text) return '';
    let t = text.replace(/\s+/g, ' ').trim();
    t = t.replace(/^([0-9]+[\.)\-:]\s*|[\-•]\s*)+/g, '').trim();
    t = t.replace(/\s*([0-9]+[\.)])\s*/g, ' ').trim();
    if (t.length > 0) t = t.charAt(0).toUpperCase() + t.slice(1);
    if (!(/[\.!?]$/.test(t))) t = t + '.';
    if (t.length > 140) {
      const cut = t.slice(0, 140);
      const idx = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '), cut.lastIndexOf(', '));
      t = (idx > 80 ? cut.slice(0, idx + 1) : cut.trim()) + (t.length > 150 ? '…' : '');
    }
    return t;
  };

  const normalizeChecklist = (items: any[]): any[] => {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const item of items || []) {
      const cleaned = cleanStepText(item?.text || '');
      if (!cleaned || cleaned.length < 4) continue;
      const key = cleaned.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      // Preserve ALL fields (explanation, citation, etc.)
      out.push({ 
        ...item,  // Keep all original fields
        step: out.length + 1, 
        text: cleaned 
      });
    }
    return out.slice(0, 12);
  };

  const selectSnippets = (query: string, hits: any[]): string[] => {
    const queryLower = query.toLowerCase();
    
    // Extract MEDICAL TERMS (ignore generic words like "disease", "symptoms", "treatment")
    const genericWords = ['disease', 'diseases', 'symptom', 'symptoms', 'treatment', 'protocol', 'management', 'checklist'];
    const queryWords = queryLower.split(/\s+/)
      .filter(w => w.length > 3)
      .filter(w => !genericWords.includes(w));
    
    // If no specific terms, use first significant word
    if (queryWords.length === 0) {
      queryWords.push(queryLower.split(/\s+/).find(w => w.length > 3) || '');
    }
    
    // Score and filter snippets for relevance
    const scored = (hits || []).map((h) => {
      const s = h.source || {};
      let score = h.score || 0;
      
      const title = String(s.title || '').toLowerCase();
      const body = String(s.body || s.content || '').toLowerCase();
      const disease = String(s.disease || '').toLowerCase();
      
      // DISEASE-SPECIFIC RELEVANCE: Only count matches for medical condition terms
      let relevanceScore = 0;
      
      for (const word of queryWords) {
        // Strong match: disease field contains the specific term (e.g., "dengue" contains "dengue")
        if (disease.includes(word)) {
          relevanceScore += 5;
        }
        // Medium match: title contains specific term
        if (title.includes(word)) {
          relevanceScore += 2;
        }
        // Weak match: body contains term
        if (body.includes(word)) {
          relevanceScore += 1;
        }
      }
      
      // BALANCED FILTER: Keep if has keyword match OR high ES score
      // This filters out COVID (no "mosquito", low relevance) but keeps dengue/malaria
      if (relevanceScore === 0 && score < 3.0) {
        score = 0; // Mark for removal - no keyword match AND low search score
      }
      
      // Boost high-relevance docs
      if (relevanceScore >= 5) score += 3.0; // Disease name match
      if (relevanceScore >= 2) score += 1.5; // Title match
      if (relevanceScore >= 1) score += 0.5; // Body match
      
      return { h, score, relevanceScore };
    });

    // Filter out irrelevant content
    const filtered = scored.filter(s => s.score > 0);
    filtered.sort((a, b) => b.score - a.score);

    const snippets: string[] = [];
    let citationNum = 1;
    
    for (const { h } of filtered) {
      const s = h.source || {};
      const body = s.body || s.content || s.title;
      if (!body) continue;
      
      // Add citation number prefix for LLM to track sources
      const disease = s.disease ? `(${s.disease})` : '';
      const numberedSnippet = `[Source ${citationNum}]${disease ? ' ' + disease : ''}: ${body}`;
      snippets.push(numberedSnippet);
      citationNum++;
      
      if (snippets.length >= 6) break; // Get more context
    }
    
    return snippets;
  };

  const mapBackendToProtocolData = (
    title: string,
    hits: any[],
    checklist: { step: number; text: string }[]
  ): ProtocolData => {
    const best = hits?.[0]?.source || {};
    const region = String(best.region || 'Global');
    const year = String(best.year || new Date().getFullYear());
    const organization = String(best.organization || 'ProCheck');

    const normalized = normalizeChecklist(checklist);
    
    const steps: ProtocolStep[] = normalized.length > 0
      ? normalized.map((item: any) => ({
            id: item.step, 
            step: item.text,
            explanation: item.explanation || '',
            citation: item.citation || 0,
            citations: item.citation ? [item.citation] : []
          }))
      : (hits || []).slice(0, 6).map((h: any, idx: number) => ({
          id: idx + 1,
          step: cleanStepText(h.source?.body || h.source?.content || h.source?.title || '—'),
          explanation: '',
          citation: idx + 1,
          citations: [idx + 1],
        }));

    // Build citations from search results with full body for expandable view
    const citationObjs: Citation[] = [];
    hits.slice(0, 6).forEach((h: any, idx: number) => {
      const s = h.source || {};
      citationObjs.push({
        id: idx + 1,
        source: s.title || 'Medical Source',
        organization: s.organization || organization,
        year: String(s.year || year),
        region: s.region || region,
        url: s.source_url || s.url || '',
        excerpt: s.body || s.content || '',  // Full content for expansion
      });
    });

    return {
      title,
      region,
      year,
      organization,
      steps,
      citations: citationObjs,
      lastUpdated: getUserTimestamp(),
    };
  };

  // Helper function to get user's local timestamp in backend format
  const getUserTimestamp = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}`;
  };

  // Helper function to save conversation
  const saveCurrentConversation = async (updatedMessages: Message[], lastQuery: string) => {
    if (!currentUser) return;

    try {
      const conversationMessages: ConversationMessage[] = updatedMessages.map(msg => ({
        id: msg.id,
        type: msg.type as 'user' | 'assistant',
        content: msg.content,
        timestamp: msg.timestamp, // Preserve original message timestamp
        protocol_data: msg.protocolData || undefined,
      }));

      // Use the first message timestamp as conversation created_at
      const firstMessageTimestamp = updatedMessages.length > 0 ? updatedMessages[0].timestamp : getUserTimestamp();

      await saveConversation(currentUser.uid, {
        id: currentConversationId,
        title: lastQuery.length > 50 ? lastQuery.substring(0, 50) + '...' : lastQuery,
        messages: conversationMessages,
        last_query: lastQuery,
        tags: ['medical-protocol'],
        created_at: firstMessageTimestamp,
      });

      // Update cache with latest messages - OPTIMIZATION: keep cache in sync
      conversationCache.current.set(currentConversationId, updatedMessages);
      console.log('✅ Conversation saved and cached');
      // Note: Sidebar will only reload on user login or explicit refresh trigger
    } catch (error) {
      console.error('Failed to save conversation:', error);
    }
  };

  const handleSendMessage = async (content: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content,
      timestamp: getUserTimestamp(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const searchRes = await searchProtocols({
        query: content,
        size: 8,
      });

      const snippets = selectSnippets(content, searchRes.hits);

      const genRes = await generateProtocol({
        title: content,
        context_snippets: snippets.length > 0 ? snippets : [content],
        instructions: `Create a medical protocol checklist for: "${content}"

STRICT FILTERING RULES:
- ONLY use information that directly relates to the query topic
- If a snippet is about a DIFFERENT disease/condition, DO NOT use it
- Example: If query is "mosquito disease", ignore COVID-19, stroke, diabetes, etc.
- Each step must be actionable and specific to "${content}"
- Steps should be clear medical actions or information points
- Do NOT include [Source N] tags in the step text
- Better to have 3-4 highly relevant steps than 6+ with irrelevant ones

CITATION REQUIREMENT:
- Each checklist step MUST include a "citation" field
- Set citation to the source number (1, 2, 3, etc.) where you got the information
- If info is from [Source 1], use "citation": 1
- If info is from [Source 2], use "citation": 2`,
        region: null,
        year: null,
      });

      // Classify query intent for UI formatting
      const classifyIntent = (query: string) => {
        const q = query.toLowerCase();
        if (q.includes('emergency') || q.includes('urgent') || q.includes('attack') || q.includes('crisis')) return 'emergency';
        if (q.includes('treatment') || q.includes('therapy') || q.includes('medication')) return 'treatment';
        if (q.includes('symptom') || q.includes('sign')) return 'symptoms';
        if (q.includes('diagnosis') || q.includes('test')) return 'diagnosis';
        if (q.includes('prevention') || q.includes('prevent')) return 'prevention';
        return 'general';
      };

      const intent = classifyIntent(content);

      const protocolData: ProtocolData = mapBackendToProtocolData(
        content,
        searchRes.hits,
        genRes.checklist
      );

      // Attach intent to protocol for persistence (used when saving/loading)
      protocolData.intent = intent;

      // Capture search metadata for display
      const searchMetadata: SearchMetadata = {
        totalResults: searchRes.total,
        responseTimes: searchRes.took_ms,
        searchMethod: 'hybrid', // Using hybrid search by default
        resultsFound: searchRes.hits?.length || 0,
      };

      
      const intentMessages: Record<string, string> = {
        emergency: 'Emergency Protocol - Immediate actions required:',
        symptoms: 'Symptom Overview - Clinical presentation:',
        treatment: 'Treatment Protocol - Medical interventions:',
        diagnosis: 'Diagnostic Approach - Assessment criteria:',
        prevention: 'Prevention Guide - Protective measures:',
        general: 'Medical Protocol - Key information:',
      };

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: intentMessages[intent] || 'Here\'s the comprehensive protocol:',
        timestamp: getUserTimestamp(),
        protocolData,
        searchMetadata,
      };

      setMessages(prev => {
        const newMessages = [...prev, assistantMessage];
        // Save conversation asynchronously
        saveCurrentConversation(newMessages, content);
        return newMessages;
      });
    } catch (err: any) {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: `Sorry, I couldn't process that request. ${err?.message || ''}`.trim(),
        timestamp: getUserTimestamp(),
      };
      setMessages(prev => {
        const newMessages = [...prev, assistantMessage];
        // Save conversation even on error
        saveCurrentConversation(newMessages, content);
        return newMessages;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewSearch = useCallback(() => {
    setMessages([]);
    setCurrentConversationId(`conv_${Date.now()}`); // Generate new conversation ID

    // Optional: Clear cache if it gets too large (keep last 20 conversations)
    if (conversationCache.current.size > 20) {
      const entries = Array.from(conversationCache.current.entries());
      conversationCache.current = new Map(entries.slice(-20));
    }
  }, []);

  const handleRecentSearch = useCallback(async (conversationId: string) => {
    if (!userId) return;

    // Check if conversation is already cached - OPTIMIZATION: avoid redundant API calls
    const cachedMessages = conversationCache.current.get(conversationId);
    if (cachedMessages) {
      console.log('✅ Using cached conversation, no API call needed');
      // Use cached data instead of fetching from database
      setMessages(cachedMessages);
      setCurrentConversationId(conversationId);
      return;
    }

    console.log('🔄 [API CALL] Fetching conversation from server (not in cache)...');

    try {
      setIsLoading(true);
      const response = await getConversation(userId, conversationId);

      if (response.success && response.conversation) {
        const conv = response.conversation;

        // Convert conversation messages back to Message format
        const loadedMessages: Message[] = (conv.messages || []).map((msg: ConversationMessage) => ({
          id: msg.id,
          type: msg.type,
          content: msg.content,
          timestamp: msg.timestamp,
          protocolData: msg.protocol_data,
        }));

        // Prevent auto-scroll by temporarily increasing message count
        messageCountRef.current = loadedMessages.length;
        // Cache the loaded conversation
        conversationCache.current.set(conversationId, loadedMessages);
        // Set the messages and conversation ID
        setMessages(loadedMessages);
        setCurrentConversationId(conversationId);
        
        // Scroll to top after a brief delay
        setTimeout(() => {
          if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = 0;
          }
        }, 100);
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleProtocolUpdate = useCallback((updatedProtocol: ProtocolData) => {
    // Set flag to indicate this is a thread interaction
    isThreadInteractionRef.current = true;
    
    // Find the message with protocolData and update it
    setMessages(prev => {
      const updatedMessages = prev.map(msg => {
        if (msg.protocolData && msg.protocolData.title === updatedProtocol.title) {
          return {
            ...msg,
            protocolData: updatedProtocol
          };
        }
        return msg;
      });
      
      // Debounce conversation save to prevent too many updates
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      saveTimeoutRef.current = setTimeout(() => {
        const lastUserMessage = [...updatedMessages].reverse().find(m => m.type === 'user');
        if (lastUserMessage && currentUser) {
          saveCurrentConversation(updatedMessages, lastUserMessage.content);
        }
      }, 2000); // Save 2 seconds after last update
      
      return updatedMessages;
    });
  }, [currentUser, currentConversationId]);

  const handleSaveToggle = useCallback(() => {
    setSavedProtocolsRefreshTrigger(prev => prev + 1);
  }, []);

  // Helper function to determine if a message contains a saved protocol
  const isSavedProtocolMessage = (message: Message): boolean => {
    // Check if the message content starts with "Saved:" which indicates it's a saved protocol
    return message.type === 'assistant' && message.content.startsWith('Saved:');
  };

  const handleConversationDeleted = useCallback((conversationId: string) => {
    // Remove deleted conversation from cache
    conversationCache.current.delete(conversationId);

    // If currently viewing the deleted conversation, clear the chat
    // Use functional update to get current value without dependency
    setCurrentConversationId(currentId => {
      if (currentId === conversationId) {
        setMessages([]);
        return `conv_${Date.now()}`;
      }
      return currentId;
    });
  }, []);

  const handleSavedProtocol = useCallback(async (protocolId: string, protocolData: any) => {
    console.log('🎯 [APP] handleSavedProtocol called', { protocolId, hasProtocolData: !!protocolData });
    // Clear current messages and start fresh
    setMessages([]);
    setCurrentConversationId(`conv_${Date.now()}`);

    try {
      let fullProtocol = protocolData;

      // If protocolData is not provided, fetch it from the backend
      if (!fullProtocol && userId) {
        console.log('🔄 [API CALL] App: Fetching protocol data (fallback)...');
        const res = await getSavedProtocol(userId, protocolId);
        console.log('🔄 [API CALL] App: getSavedProtocol completed');
        if (res.success && res.protocol) {
          fullProtocol = res.protocol.protocol_data;
        }
      }

      const contentTitle = fullProtocol?.title ? `Saved: ${fullProtocol.title}` : `Here's your saved protocol:`;

      const assistantMessage: Message = {
        id: Date.now().toString(),
        type: 'assistant',
        content: contentTitle,
        timestamp: getUserTimestamp(),
        protocolData: fullProtocol || undefined,
      };

      setMessages([assistantMessage]);
      
      // Don't trigger sidebar refresh for saved protocols - they're already in the sidebar
      // Only trigger refresh when protocols are saved/unsaved, not when loading them
    } catch (e) {
      console.error('Error loading saved protocol:', e);
      const assistantMessage: Message = {
        id: Date.now().toString(),
        type: 'assistant',
        content: `Couldn't load saved protocol.`,
        timestamp: getUserTimestamp(),
      };
      setMessages([assistantMessage]);
    }
  }, [userId]);

  const handleAuthSuccess = () => {
    const from = location.state?.from?.pathname || '/dashboard';
    navigate(from, { replace: true });
  };

  const Dashboard = () => (
    <div className="h-screen flex bg-slate-50">
      {/* Overlay - only show when sidebar is open on mobile */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      
      {/* Sidebar - always mounted, visibility controlled by CSS */}
      <div className={`fixed lg:relative lg:translate-x-0 inset-y-0 left-0 z-50 lg:z-auto transition-transform duration-300 ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        <Sidebar
          onNewSearch={handleNewSearch}
          onRecentSearch={handleRecentSearch}
          onSavedProtocol={handleSavedProtocol}
          onConversationDeleted={handleConversationDeleted}
          savedProtocolsRefreshTrigger={savedProtocolsRefreshTrigger}
        />
      </div>
      <div className="flex-1 flex flex-col h-full">
        <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="lg:hidden"
            >
              {isSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <h1 className="text-lg font-semibold text-slate-900">ProCheck Protocol Assistant</h1>
            <Badge className="bg-slate-700 text-white border-0 hidden sm:flex">
              Hybrid Search
            </Badge>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate('/')}
            className="text-slate-600"
          >
            Back to Home
          </Button>
        </header>
        <div 
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto p-4 space-y-4 relative"
          onScroll={handleScroll}
        >
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-6xl mb-4">🏥</div>
                <h2 className="text-2xl font-semibold text-slate-900 mb-2">
                  Welcome to ProCheck
                </h2>
                <p className="text-slate-600 max-w-md">
                  Ask me about any medical protocol and I'll provide you with 
                  comprehensive, clinically cited guidelines.
                </p>
              </div>
            </div>
          )}
          {messages.map((message, index) => {
            const isLastAssistant = message.type === 'assistant' && index === messages.length - 1;
            const isFirstUserMessage = message.type === 'user' && index === 0;
            return (
              <div 
                key={message.id}
                ref={isLastAssistant ? lastAssistantMessageRef : null}
              >
                <ChatMessage
                  message={message}
                  onSaveToggle={handleSaveToggle}
                  onProtocolUpdate={handleProtocolUpdate}
                  isFirstUserMessage={isFirstUserMessage}
                  isProtocolAlreadySaved={isSavedProtocolMessage(message)}
                />
              </div>
            );
          })}
          {isLoading && (
            <div className="flex justify-start">
              <div className="max-w-[90%]">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-teal-600"></div>
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <h4 className="font-semibold text-slate-900">ProCheck Protocol Assistant</h4>
                    </div>
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <Badge className="bg-slate-700 text-white border-0">
                        Searching protocols...
                      </Badge>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                      <div className="space-y-2">
                        <p className="text-sm text-slate-600">
                          Searching medical databases with semantic understanding...
                        </p>
                        <p className="text-xs text-slate-500">
                          Using BM25 keyword + vector embeddings for better results
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
          
          {/* Scroll to Bottom Button */}
          {showScrollButton && (
            <button
              onClick={scrollToBottom}
              className="fixed bottom-24 right-8 bg-slate-700 hover:bg-slate-800 text-white rounded-full p-3 shadow-lg transition-all z-10 flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
              <span className="text-sm font-medium">Scroll to Bottom</span>
            </button>
          )}
        </div>
        <ChatInput 
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
        />
      </div>
    </div>
  );

  return (
    <Routes>
      <Route path="/" element={<LandingScreen onStartSearch={handleStartSearch} onSampleQuery={handleSampleQuery} />} />
      <Route path="/login" element={<LoginPage onLoginSuccess={handleAuthSuccess} />} />
      <Route path="/signup" element={<SignupPage onSignupSuccess={handleAuthSuccess} />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
