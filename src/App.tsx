import { useState, useRef, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Menu, X, LogOut, UserX, FileText, Plus } from 'lucide-react';
import LandingScreen from '@/components/LandingScreen';
import Sidebar from '@/components/Sidebar';
import ChatInput from '@/components/ChatInput';
import ChatMessage from '@/components/ChatMessage';
import ProtocolTabs from '@/components/ProtocolTabs';
import LoginPage from '@/components/auth/LoginPage';
import SignupPage from '@/components/auth/SignupPage';
import ForgotPasswordPage from '@/components/auth/ForgotPasswordPage';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Message, ProtocolData, ProtocolStep, Citation, SearchMetadata } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { searchProtocols, generateProtocol, saveConversation, getConversation, getSavedProtocol, ConversationMessage, protocolConversationChat, deleteUserData } from '@/lib/api';
import { deleteUser } from 'firebase/auth';

function App() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Extract stable userId to prevent callback recreation
  const userId = currentUser?.uid || null;

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showNewTabDialog, setShowNewTabDialog] = useState(false);
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);

  // Tab management state
  interface ConversationTab {
    id: string;
    title: string;
    messages: Message[];
    conversationId: string;
    isLoading: boolean;
  }

  const [tabs, setTabs] = useState<ConversationTab[]>([{
    id: 'tab-1',
    title: 'New Protocol',
    messages: [],
    conversationId: `conv_${Date.now()}`,
    isLoading: false
  }]);
  const [activeTabId, setActiveTabId] = useState('tab-1');
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

  const handleFollowUpClick = (question: string) => {
    handleSendMessage(question);
  };

  // Helper functions for tab management
  const getActiveTab = (): ConversationTab | null => {
    return tabs.find(tab => tab.id === activeTabId) || null;
  };

  const updateActiveTab = (updates: Partial<ConversationTab>) => {
    setTabs(prevTabs =>
      prevTabs.map(tab =>
        tab.id === activeTabId ? { ...tab, ...updates } : tab
      )
    );
  };

  // Derived state from active tab
  const activeTab = getActiveTab();
  const messages = activeTab?.messages || [];
  const isLoading = activeTab?.isLoading || false;
  const currentConversationId = activeTab?.conversationId || `conv_${Date.now()}`;

  // Tab management functions
  const createNewTab = (title: string = 'New Protocol'): string => {
    const newTabId = `tab-${Date.now()}`;
    const newTab: ConversationTab = {
      id: newTabId,
      title,
      messages: [],
      conversationId: `conv_${Date.now()}`,
      isLoading: false
    };

    setTabs(prevTabs => [...prevTabs, newTab]);
    setActiveTabId(newTabId);
    return newTabId;
  };

  const switchToTab = (tabId: string) => {
    setActiveTabId(tabId);
  };

  const closeTab = (tabId: string) => {
    setTabs(prevTabs => {
      const newTabs = prevTabs.filter(tab => tab.id !== tabId);

      // If closing active tab, switch to another tab
      if (tabId === activeTabId && newTabs.length > 0) {
        setActiveTabId(newTabs[0].id);
      }

      // Always keep at least one tab
      if (newTabs.length === 0) {
        const defaultTab: ConversationTab = {
          id: 'tab-default',
          title: 'New Protocol',
          messages: [],
          conversationId: `conv_${Date.now()}`,
          isLoading: false
        };
        setActiveTabId('tab-default');
        return [defaultTab];
      }

      return newTabs;
    });
  };

  // Helper function to get current protocol being discussed
  const getCurrentProtocol = (): { title: string; isInConversation: boolean } | null => {
    // Find the most recent assistant message with protocol data (within last 10 messages)
    const recentMessages = messages.slice(-10);
    
    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const msg = recentMessages[i];
      if (msg.type === 'assistant' && msg.protocolData) {
        return {
          title: msg.protocolData.title,
          isInConversation: true
        };
      }
    }
    return null;
  };

  // Helper function to detect if this is a follow-up question
  const isFollowUpQuestion = (content: string, messages: Message[]): { isFollowUp: boolean; lastProtocol?: ProtocolData } => {
    // Find the most recent assistant message with protocol data
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.type === 'assistant' && msg.protocolData) {
        // Check if this looks like a follow-up question
        const followUpKeywords = [
          'dosage', 'dose', 'how much', 'how often', 'when to',
          'symptoms', 'signs', 'what to watch', 'monitor',
          'side effects', 'complications', 'risks', 'contraindications',
          'timing', 'duration', 'how long', 'frequency',
          'safety', 'warnings', 'avoid', 'caution'
        ];
        
        const contentLower = content.toLowerCase();
        const hasFollowUpKeyword = followUpKeywords.some(keyword => contentLower.includes(keyword));
        const isShortQuestion = content.length < 100; // Follow-ups are usually shorter
        
        if (hasFollowUpKeyword && isShortQuestion) {
          return { isFollowUp: true, lastProtocol: msg.protocolData };
        }
        break; // Only check the most recent protocol
      }
    }
    return { isFollowUp: false };
  };

  // Scroll effect - placed after tab helpers to avoid dependency issues
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

  const handleSendMessage = async (content: string, skipDialogCheck: boolean = false) => {
    // Get current messages before any state changes
    const currentMessages = messages;
    
    // Check if this is a follow-up question
    const followUpCheck = isFollowUpQuestion(content, currentMessages);
    
    // Check if current tab has a protocol already
    const hasExistingProtocol = currentMessages.some(msg => msg.type === 'assistant' && msg.protocolData);
    
    // If it's a NEW protocol (not a follow-up) and current tab already has a protocol, ask user
    const isNewProtocol = !followUpCheck.isFollowUp && hasExistingProtocol;
    
    if (isNewProtocol && !skipDialogCheck) {
      // Show dialog and wait for user decision
      setPendingQuery(content);
      setShowNewTabDialog(true);
      return; // Exit early, will continue in handleNewTabConfirm
    }
    
    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content,
      timestamp: getUserTimestamp(),
    };
    
    // Update current tab with new message and loading state
    updateActiveTab({
      messages: [...currentMessages, userMessage],
      isLoading: true
    });

    try {
      if (followUpCheck.isFollowUp && followUpCheck.lastProtocol) {
        // Handle as protocol conversation (follow-up in same tab)
        const conversationHistory = currentMessages
          .filter(msg => msg.type === 'user' || (msg.type === 'assistant' && !msg.protocolData))
          .slice(-6) // Last 6 messages for context
          .map(msg => ({
            role: msg.type as 'user' | 'assistant',
            content: msg.content
          }));

        const conversationRes = await protocolConversationChat({
          message: content,
          concept_title: followUpCheck.lastProtocol.title,
          protocol_json: followUpCheck.lastProtocol,
          citations_list: followUpCheck.lastProtocol.citations.map(c => c.excerpt || c.source),
          conversation_history: conversationHistory
        });

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content: conversationRes.answer,
          timestamp: getUserTimestamp(),
          followUpQuestions: conversationRes.follow_up_questions,
          isFollowUp: true,
        };

        // Get latest messages again before updating
        const messagesBeforeUpdate = getActiveTab()?.messages || [];
        const newMessages = [...messagesBeforeUpdate, assistantMessage];
        updateActiveTab({
          messages: newMessages,
          isLoading: false
        });
        saveCurrentConversation(newMessages, content);
        return;
      }
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

      // Generate follow-up questions based on intent
      const generateFollowUpQuestions = (intent: string) => {
        const baseQuestions = [
          { text: "What are the recommended dosages?", category: "dosage" as const },
          { text: "What symptoms should I monitor?", category: "symptoms" as const },
          { text: "When should I seek immediate help?", category: "safety" as const },
          { text: "What are potential complications?", category: "complications" as const },
          { text: "How often should I check progress?", category: "timing" as const }
        ];
        
        const intentSpecific = {
          emergency: [
            { text: "What are the critical warning signs?", category: "safety" as const },
            { text: "How quickly should I act?", category: "timing" as const },
            { text: "What should I avoid doing?", category: "safety" as const }
          ],
          treatment: [
            { text: "What are the side effects to watch for?", category: "complications" as const },
            { text: "How long does treatment take?", category: "timing" as const },
            { text: "What if the treatment isn't working?", category: "complications" as const }
          ],
          symptoms: [
            { text: "How do I differentiate mild vs severe symptoms?", category: "symptoms" as const },
            { text: "What symptoms indicate worsening?", category: "complications" as const },
            { text: "When do symptoms typically appear?", category: "timing" as const }
          ],
          diagnosis: [
            { text: "What tests are most reliable?", category: "general" as const },
            { text: "How accurate are these diagnostic methods?", category: "general" as const },
            { text: "What if initial tests are negative?", category: "complications" as const }
          ]
        };
        
        const specific = intentSpecific[intent as keyof typeof intentSpecific] || [];
        return [...specific, ...baseQuestions].slice(0, 5);
      };

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: intentMessages[intent] || 'Here\'s the comprehensive protocol:',
        timestamp: getUserTimestamp(),
        protocolData,
        searchMetadata,
        followUpQuestions: generateFollowUpQuestions(intent),
      };

      // Update the current tab
      const newMessages = [...currentMessages, userMessage, assistantMessage];
      updateActiveTab({
        messages: newMessages,
        isLoading: false,
        title: protocolData.title
      });
      
      // Save conversation
      saveCurrentConversation(newMessages, content);
    } catch (err: any) {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: `Sorry, I couldn't process that request. ${err?.message || ''}`.trim(),
        timestamp: getUserTimestamp(),
      };
      
      // Update current tab with error message
      const newMessages = [...currentMessages, userMessage, assistantMessage];
      updateActiveTab({
        messages: newMessages,
        isLoading: false
      });
      
      saveCurrentConversation(newMessages, content);
    }
  };

  // Helper function to process protocol search for a specific tab
  const processProtocolSearch = async (content: string, targetTabId: string, existingMessages: Message[]) => {
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

      protocolData.intent = intent;

      const searchMetadata: SearchMetadata = {
        totalResults: searchRes.total,
        responseTimes: searchRes.took_ms,
        searchMethod: 'hybrid',
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

      const generateFollowUpQuestions = (intent: string) => {
        const baseQuestions = [
          { text: "What are the recommended dosages?", category: "dosage" as const },
          { text: "What symptoms should I monitor?", category: "symptoms" as const },
          { text: "When should I seek immediate help?", category: "safety" as const },
          { text: "What are potential complications?", category: "complications" as const },
          { text: "How often should I check progress?", category: "timing" as const }
        ];
        
        const intentSpecific = {
          emergency: [
            { text: "What are the critical warning signs?", category: "safety" as const },
            { text: "How quickly should I act?", category: "timing" as const },
            { text: "What should I avoid doing?", category: "safety" as const }
          ],
          treatment: [
            { text: "What are the side effects to watch for?", category: "complications" as const },
            { text: "How long does treatment take?", category: "timing" as const },
            { text: "What if the treatment isn't working?", category: "complications" as const }
          ],
          symptoms: [
            { text: "How do I differentiate mild vs severe symptoms?", category: "symptoms" as const },
            { text: "What symptoms indicate worsening?", category: "complications" as const },
            { text: "When do symptoms typically appear?", category: "timing" as const }
          ],
          diagnosis: [
            { text: "What tests are most reliable?", category: "general" as const },
            { text: "How accurate are these diagnostic methods?", category: "general" as const },
            { text: "What if initial tests are negative?", category: "complications" as const }
          ]
        };
        
        const specific = intentSpecific[intent as keyof typeof intentSpecific] || [];
        return [...specific, ...baseQuestions].slice(0, 5);
      };

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: intentMessages[intent] || 'Here\'s the comprehensive protocol:',
        timestamp: getUserTimestamp(),
        protocolData,
        searchMetadata,
        followUpQuestions: generateFollowUpQuestions(intent),
      };

      // Update the specific tab
      const newMessages = [...existingMessages, assistantMessage];
      setTabs(prevTabs =>
        prevTabs.map(tab =>
          tab.id === targetTabId
            ? { ...tab, messages: newMessages, isLoading: false, title: protocolData.title }
            : tab
        )
      );

      // Save conversation - need to get the conversation ID for this tab
      const targetTab = tabs.find(t => t.id === targetTabId);
      if (targetTab && userId) {
        const conversationMessages: ConversationMessage[] = newMessages.map(msg => ({
          id: msg.id,
          type: msg.type as 'user' | 'assistant',
          content: msg.content,
          timestamp: msg.timestamp,
          protocol_data: msg.protocolData || undefined,
        }));

        const firstMessageTimestamp = newMessages.length > 0 ? newMessages[0].timestamp : getUserTimestamp();

        await saveConversation(userId, {
          id: targetTab.conversationId,
          title: content.length > 50 ? content.substring(0, 50) + '...' : content,
          messages: conversationMessages,
          last_query: content,
          tags: ['medical-protocol'],
          created_at: firstMessageTimestamp,
        });

        conversationCache.current.set(targetTab.conversationId, newMessages);
      }
    } catch (err: any) {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: `Sorry, I couldn't process that request. ${err?.message || ''}`.trim(),
        timestamp: getUserTimestamp(),
      };

      const newMessages = [...existingMessages, assistantMessage];
      setTabs(prevTabs =>
        prevTabs.map(tab =>
          tab.id === targetTabId
            ? { ...tab, messages: newMessages, isLoading: false }
            : tab
        )
      );
    }
  };

  const handleNewSearch = useCallback(() => {
    createNewTab('New Protocol');

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
      // Load in current tab instead of creating new tab
      updateActiveTab({
        messages: cachedMessages,
        conversationId: conversationId,
        title: cachedMessages[0]?.content.substring(0, 30) || 'Recent Search'
      });
      return;
    }

    console.log('🔄 [API CALL] Fetching conversation from server (not in cache)...');

    // Load in current tab with loading state
    updateActiveTab({ isLoading: true });

    try {
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
        // Update current tab with loaded messages
        updateActiveTab({
          messages: loadedMessages,
          conversationId: conversationId,
          title: conv.title || 'Recent Search',
          isLoading: false
        });
        
        // Scroll to top after a brief delay
        setTimeout(() => {
          if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = 0;
          }
        }, 100);
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
      updateActiveTab({ isLoading: false });
    }
  }, [userId]);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleProtocolUpdate = useCallback((updatedProtocol: ProtocolData) => {
    // Set flag to indicate this is a thread interaction
    isThreadInteractionRef.current = true;
    
    // Find the message with protocolData and update it
    const updatedMessages = messages.map(msg => {
      if (msg.protocolData && msg.protocolData.title === updatedProtocol.title) {
        return {
          ...msg,
          protocolData: updatedProtocol
        };
      }
      return msg;
    });
    
    updateActiveTab({ messages: updatedMessages });
    
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
  }, [currentUser, currentConversationId, messages]);

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

    // If currently viewing the deleted conversation, close the tab
    if (currentConversationId === conversationId) {
      closeTab(activeTabId);
    }
  }, [currentConversationId, activeTabId]);

  const handleSavedProtocol = useCallback(async (protocolId: string, protocolData: any) => {
    console.log('🎯 [APP] handleSavedProtocol called', { protocolId, hasProtocolData: !!protocolData });
    
    // Load in current tab instead of creating new tab
    updateActiveTab({ isLoading: true });

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

      updateActiveTab({
        messages: [assistantMessage],
        title: fullProtocol?.title || 'Saved Protocol',
        isLoading: false
      });
      
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
      updateActiveTab({
        messages: [assistantMessage],
        title: 'Error',
        isLoading: false
      });
    }
  }, [userId]);

  const handleAuthSuccess = () => {
    const from = location.state?.from?.pathname || '/dashboard';
    navigate(from, { replace: true });
  };

  // Modal handlers
  const handleShowLogoutModal = () => {
    setShowLogoutModal(true);
  };

  const handleShowDeleteModal = () => {
    setShowDeleteModal(true);
  };

  const handleConfirmLogout = async () => {
    try {
      await logout();
      setShowLogoutModal(false);
    } catch (error) {
      console.error('Failed to log out:', error);
      alert('Failed to log out. Please try again.');
    }
  };

  const handleConfirmDeleteAccount = async () => {
    if (!currentUser) return;

    try {
      // First delete user data from backend
      console.log('Deleting user data from backend...');
      const backendResult = await deleteUserData(currentUser.uid);
      console.log('Backend deletion result:', backendResult);

      // Then delete Firebase Auth user account
      console.log('Deleting Firebase Auth account...');
      await deleteUser(currentUser);

      setShowDeleteModal(false);
      console.log('Account deleted successfully');
    } catch (error: any) {
      console.error('Failed to delete account:', error);
      if (error.code === 'auth/requires-recent-login') {
        alert('For security reasons, please log out and log back in before deleting your account.');
      } else {
        alert(`Failed to delete account: ${error.message || 'Unknown error'}. Please try again.`);
      }
    }
  };

  // Handle new tab dialog confirmation
  const handleNewTabConfirm = async (openInNewTab: boolean) => {
    setShowNewTabDialog(false);
    const content = pendingQuery;
    setPendingQuery(null);
    
    if (!content) return;

    if (openInNewTab) {
      // Save the current tab's conversation before switching to new tab
      const currentMessages = messages;
      if (currentMessages.length > 0) {
        const lastUserMessage = [...currentMessages].reverse().find(m => m.type === 'user');
        if (lastUserMessage) {
          await saveCurrentConversation(currentMessages, lastUserMessage.content);
        }
      }
      
      // Create new tab - this will switch activeTabId
      const newTabId = createNewTab(content.substring(0, 30) + '...');
      
      // Send message in the NEW tab by directly updating it
      // We need to use setTabs to ensure we're working with the new tab
      const userMessage: Message = {
        id: Date.now().toString(),
        type: 'user',
        content,
        timestamp: getUserTimestamp(),
      };
      
      // Update the new tab with the user message and loading state
      setTabs(prevTabs =>
        prevTabs.map(tab =>
          tab.id === newTabId
            ? { ...tab, messages: [userMessage], isLoading: true }
            : tab
        )
      );
      
      // Now process the message (this will use the new tab's empty messages)
      // We use setTimeout to ensure state has updated
      setTimeout(async () => {
        await processProtocolSearch(content, newTabId, [userMessage]);
      }, 100);
    } else {
      // Continue in current tab (skip dialog check since user already decided)
      handleSendMessage(content, true);
    }
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
          onShowLogoutModal={handleShowLogoutModal}
          onShowDeleteModal={handleShowDeleteModal}
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
            {(() => {
              const currentProtocol = getCurrentProtocol();
              return currentProtocol ? (
                <>
                  <h1 className="text-lg font-semibold text-slate-900">{currentProtocol.title}</h1>
                  <Badge className="bg-teal-600 text-white border-0 hidden sm:flex">
                    Discussion Mode
                  </Badge>
                </>
              ) : (
                <>
                  <h1 className="text-lg font-semibold text-slate-900">ProCheck Protocol Assistant</h1>
                  <Badge className="bg-slate-700 text-white border-0 hidden sm:flex">
                    Hybrid Search
                  </Badge>
                </>
              );
            })()}
          </div>
          <div className="flex items-center space-x-2">
            {getCurrentProtocol() && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleNewSearch}
                className="text-teal-700 border-teal-300 hover:bg-teal-100"
              >
                New Search
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => navigate('/')}
              className="text-slate-600"
            >
              Back to Home
            </Button>
          </div>
        </header>

        {/* Protocol Tabs */}
        <ProtocolTabs
          tabs={tabs.map(tab => ({
            id: tab.id,
            title: tab.title,
            isActive: tab.id === activeTabId
          }))}
          onTabClick={switchToTab}
          onTabClose={closeTab}
          onNewTab={() => createNewTab()}
        />

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
                  onFollowUpClick={handleFollowUpClick}
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
          hasMessages={messages.length > 0}
          isInConversation={!!getCurrentProtocol()}
          currentProtocolTitle={getCurrentProtocol()?.title}
        />
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
          <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl">
            <div className="flex items-center space-x-3 mb-4">
              <div className="h-10 w-10 bg-orange-100 rounded-full flex items-center justify-center">
                <LogOut className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Log Out</h3>
                <p className="text-sm text-slate-600">Are you sure you want to log out?</p>
              </div>
            </div>
            <div className="flex space-x-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowLogoutModal(false)}
                className="px-4 py-2"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmLogout}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white"
              >
                Log Out
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
          <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl">
            <div className="flex items-center space-x-3 mb-4">
              <div className="h-10 w-10 bg-red-100 rounded-full flex items-center justify-center">
                <UserX className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Delete Account</h3>
                <p className="text-sm text-slate-600">This action cannot be undone. All your data will be permanently deleted.</p>
              </div>
            </div>
            <div className="mb-4">
              <p className="text-sm text-slate-700 mb-2">Type <span className="font-semibold">DELETE</span> to confirm:</p>
              <input
                type="text"
                placeholder="Type DELETE here"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                id="deleteConfirmInput"
              />
            </div>
            <div className="flex space-x-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  const input = document.getElementById('deleteConfirmInput') as HTMLInputElement;
                  if (input?.value === 'DELETE') {
                    handleConfirmDeleteAccount();
                  } else {
                    alert('Please type DELETE to confirm account deletion.');
                  }
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white"
              >
                Delete Account
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* New Tab Confirmation Dialog */}
      <Dialog open={showNewTabDialog} onOpenChange={setShowNewTabDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-10 w-10 bg-teal-100 rounded-full flex items-center justify-center">
                <Plus className="h-5 w-5 text-teal-600" />
              </div>
              <span>New Protocol Topic Detected</span>
            </DialogTitle>
            <DialogDescription className="pt-4">
              This looks like a new protocol topic. Would you like to open it in a new tab or continue in the current tab?
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50">
              <Plus className="h-5 w-5 text-teal-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-sm text-slate-900">Open in New Tab</p>
                <p className="text-xs text-slate-600 mt-1">Keep your current protocol and start fresh in a new tab</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50">
              <FileText className="h-5 w-5 text-slate-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-sm text-slate-900">Continue in Current Tab</p>
                <p className="text-xs text-slate-600 mt-1">Replace the current protocol with the new one</p>
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => handleNewTabConfirm(false)}
              className="w-full sm:w-auto"
            >
              <FileText className="h-4 w-4 mr-2" />
              Continue Here
            </Button>
            <Button
              onClick={() => handleNewTabConfirm(true)}
              className="w-full sm:w-auto bg-teal-600 hover:bg-teal-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Open New Tab
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
