import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Menu, X, LogOut, UserX } from 'lucide-react';
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
import { searchProtocols, generateProtocol, saveConversation, getConversation, getSavedProtocol, ConversationMessage, protocolConversationChat, deleteUserData } from '@/lib/api';
import { deleteUser } from 'firebase/auth';
import { approveAndIndexUpload, getUploadPreview, regenerateProtocol, regenerateUploadProtocols, getUserUploadedProtocols, deleteUserProtocol, deleteAllUserProtocols } from '@/lib/api';

// Memoized regeneration form to prevent re-renders
const RegenerationForm = memo(({
  regenerationPrompt,
  onPromptChange,
  onCancel,
  onRegenerate,
  isRegenerating
}: {
  regenerationPrompt: string;
  onPromptChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onCancel: () => void;
  onRegenerate: () => void;
  isRegenerating: boolean;
}) => {
  // Create a ref to maintain the textarea element
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  return (
  <div className="space-y-4">
    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
      <h3 className="text-sm font-medium text-yellow-800 mb-2">
        🔄 Regenerate Protocols
      </h3>
      <p className="text-sm text-yellow-700">
        Provide new instructions to regenerate these protocols with different focus or requirements.
      </p>
    </div>

    <div>
      <label htmlFor="regeneration-prompt" className="block text-sm font-medium text-slate-900 mb-2">
        Custom Instructions
      </label>
      <textarea
        ref={textareaRef}
        id="regeneration-prompt"
        value={regenerationPrompt}
        onChange={onPromptChange}
        placeholder="Enter your regeneration instructions here..."
        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none text-sm"
        rows={3}
        disabled={isRegenerating}
      />
      <p className="text-xs text-slate-500 mt-1">
        Specify how you want the protocols to be regenerated. The AI will use these instructions to create new versions.
      </p>
    </div>

    <div className="flex space-x-3">
      <Button
        onClick={onCancel}
        variant="outline"
        disabled={isRegenerating}
      >
        Cancel
      </Button>
      <Button
        onClick={onRegenerate}
        className="bg-teal-600 hover:bg-teal-700 text-white"
        disabled={!regenerationPrompt.trim() || isRegenerating}
      >
        {isRegenerating ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
            Regenerating...
          </>
        ) : (
          <>
            🔄 Regenerate Protocols
          </>
        )}
      </Button>
    </div>
  </div>
  );
});

// Simple Regeneration Modal - no re-rendering issues
function RegenerationModal({ isOpen, isRegenerating, onCancel, onRegenerate }: {
  isOpen: boolean;
  isRegenerating: boolean;
  onCancel: () => void;
  onRegenerate: (prompt: string) => void;
}) {
  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const prompt = formData.get('prompt') as string;
    onRegenerate(prompt || '');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl">
        <div className="flex items-center space-x-3 mb-4">
          <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center">
            <span className="text-slate-600 text-lg">🔄</span>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Regenerate Protocols</h3>
            <p className="text-sm text-slate-600">
              Provide custom instructions to regenerate these protocols.
            </p>
          </div>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label htmlFor="regenerationPrompt" className="block text-sm font-medium text-slate-700 mb-2">
              Custom Instructions
            </label>
            <textarea
              name="prompt"
              id="regenerationPrompt"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-slate-500"
              rows={4}
              placeholder="Specify how you want the protocol to be regenerated..."
              autoFocus
              disabled={isRegenerating}
            />
          </div>
          <div className="flex space-x-3 justify-end">
            <button
              type="button"
              onClick={onCancel}
              disabled={isRegenerating}
              className="px-4 py-2 text-slate-600 hover:text-slate-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isRegenerating}
              className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg disabled:opacity-50"
            >
              {isRegenerating ? 'Regenerating...' : 'Regenerate Protocols'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function App() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Extract stable userId to prevent callback recreation
  const userId = currentUser?.uid || null;

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Confirmation modal states
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmModalData, setConfirmModalData] = useState<{
    title: string;
    message: string;
    confirmText: string;
    confirmAction: () => void;
    dangerous?: boolean;
  } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string>(() =>
    `conv_${Date.now()}`
  );
  const [savedProtocolsRefreshTrigger, setSavedProtocolsRefreshTrigger] = useState(0);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [searchFilter, setSearchFilter] = useState<'all' | 'global' | 'user'>('all');
  const [showProtocolPreview, setShowProtocolPreview] = useState(false);
  const [previewProtocols, setPreviewProtocols] = useState<any[]>([]);
  const [previewUploadId, setPreviewUploadId] = useState<string | null>(null);
  const [showRegenerateForm, setShowRegenerateForm] = useState(false);
  const [regenerationPrompt, setRegenerationPrompt] = useState('Focus on specific aspects like pediatric considerations, emergency protocols, or detailed contraindications');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isRegenerated, setIsRegenerated] = useState(false);
  const [showUserProtocolsIndex, setShowUserProtocolsIndex] = useState(false);
  const [userIndexProtocols, setUserIndexProtocols] = useState<any[]>([]);
  const [showGeneratedProtocols, setShowGeneratedProtocols] = useState(false);
  const [generatedProtocols, setGeneratedProtocols] = useState<any[]>([]);
  const [generatedUploadId, setGeneratedUploadId] = useState<string | null>(null);

  // Regeneration modal state
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const regenerationTextareaRef = useRef<HTMLTextAreaElement>(null);
  const clearProtocolCacheRef = useRef<(() => void) | null>(null);
  const [toastNotifications, setToastNotifications] = useState<Array<{
    id: string;
    type: 'success' | 'error' | 'info';
    title: string;
    message: string;
    timestamp: number;
  }>>([]);
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    type: 'upload_ready' | 'query_ready';
    title: string;
    message: string;
    uploadId?: string;
    protocols?: any[];
    timestamp: number;
  }>>([]);
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

  // Helper function to show confirmation modal
  const showConfirmation = (data: {
    title: string;
    message: string;
    confirmText: string;
    confirmAction: () => void;
    dangerous?: boolean;
  }) => {
    setConfirmModalData(data);
    setShowConfirmModal(true);
  };

  const handleConfirmAction = () => {
    if (confirmModalData) {
      confirmModalData.confirmAction();
    }
    setShowConfirmModal(false);
    setConfirmModalData(null);
  };

  const handleCancelAction = () => {
    setShowConfirmModal(false);
    setConfirmModalData(null);
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
      // Check if this is a follow-up question
      const followUpCheck = isFollowUpQuestion(content, messages);
      
      if (followUpCheck.isFollowUp && followUpCheck.lastProtocol) {
        // Handle as protocol conversation
        const conversationHistory = messages
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

        setMessages(prev => {
          const newMessages = [...prev, assistantMessage];
          saveCurrentConversation(newMessages, content);
          return newMessages;
        });
        return;
      }
      // Map search filter to API search mode
      const getSearchMode = (filter: 'all' | 'global' | 'user'): 'mixed' | 'global_only' | 'user_only' => {
        switch (filter) {
          case 'all': return 'mixed';
          case 'global': return 'global_only';
          case 'user': return 'user_only';
          default: return 'mixed';
        }
      };

      const searchMode = getSearchMode(searchFilter);
      console.log('🔍 Search Debug:', {
        searchFilter,
        searchMode,
        userId,
        query: content
      });

      const searchRes = await searchProtocols({
        query: content,
        size: 8,
      }, {
        userId: userId || undefined,
        searchMode: searchMode,
        useHybrid: true,
        enhanceQuery: false
      });

      console.log('📤 Search Results:', {
        total: searchRes.total,
        hitsCount: searchRes.hits.length,
        firstHitSource: searchRes.hits[0]?.source
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

    // Clear any preview modes to return to normal chat
    setShowProtocolPreview(false);
    setShowUserProtocolsIndex(false);
    setPreviewProtocols([]);
    setPreviewUploadId(null);

    // Optional: Clear cache if it gets too large (keep last 20 conversations)
    if (conversationCache.current.size > 20) {
      const entries = Array.from(conversationCache.current.entries());
      conversationCache.current = new Map(entries.slice(-20));
    }
  }, []);

  const handleRecentSearch = useCallback(async (conversationId: string) => {
    if (!userId) return;

    // Clear any preview modes to return to normal chat
    setShowProtocolPreview(false);
    setShowUserProtocolsIndex(false);
    setPreviewProtocols([]);
    setPreviewUploadId(null);

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

    // Clear any preview modes to return to normal chat
    setShowProtocolPreview(false);
    setShowUserProtocolsIndex(false);
    setPreviewProtocols([]);
    setPreviewUploadId(null);

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

  // Toast notification functions
  const addToastNotification = useCallback((notification: {
    type: 'success' | 'error' | 'info';
    title: string;
    message: string;
  }) => {
    const id = Date.now().toString();
    const newNotification = {
      ...notification,
      id,
      timestamp: Date.now()
    };

    setToastNotifications(prev => [...prev, newNotification]);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      setToastNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  }, []);

  const removeToastNotification = useCallback((id: string) => {
    setToastNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // User protocols index handler
  const handleShowUserProtocolsIndex = useCallback(async () => {
    try {
      if (!currentUser) {
        console.log('❌ No current user for protocol index');
        return;
      }

      console.log('🚀 IMMEDIATE: Showing user protocols index');

      // IMMEDIATE: Show view first, load data in background
      setShowUserProtocolsIndex(true);
      setShowProtocolPreview(false);
      // DON'T clear messages - let upload/generation continue independently

      console.log('✅ IMMEDIATE: View switched, checking if data refresh needed...');

      // Only refresh data if we don't have any protocols cached OR if explicitly needed
      if (userIndexProtocols.length === 0) {
        console.log('🔄 No cached data, fetching from API...');
        // BACKGROUND: Get user's uploaded protocols from Elasticsearch
        const response = await getUserUploadedProtocols(currentUser.uid);

      console.log('📥 getUserUploadedProtocols response:', {
        success: response.success,
        protocolsCount: response.protocols?.length,
        total: response.total,
        error: response.error,
        sampleProtocol: response.protocols?.[0]
      });

      console.log('🔍 Response analysis:', {
        hasSuccess: 'success' in response,
        successValue: response.success,
        hasProtocols: 'protocols' in response,
        protocolsValue: response.protocols,
        protocolsLength: response.protocols?.length
      });

      if (response.success && response.protocols) {
        console.log('✅ BACKGROUND: Loading protocols data:', response.protocols.length, 'protocols');
        setUserIndexProtocols(response.protocols);
        console.log('✅ BACKGROUND: Protocols data loaded and view updated');

        // Debug view states after setting
        setTimeout(() => {
          console.log('🔍 View states after 100ms:', {
            showUserProtocolsIndex: true, // We just set this
            showProtocolPreview: false, // We just cleared this
            messagesLength: 0 // We just cleared this
          });
        }, 100);
      } else {
        console.error('❌ Failed to load user protocols:', response.error || 'Unknown error');
        addToastNotification({
          type: 'error',
          title: 'Failed to Load Protocols',
          message: response.error || 'Unable to load your protocol index'
        });
      }
      } else {
        console.log('✅ Using cached protocols data:', userIndexProtocols.length, 'protocols');
      }
    } catch (error) {
      console.error('❌ Error loading user protocols index:', error);
      addToastNotification({
        type: 'error',
        title: 'Error Loading Protocols',
        message: 'An error occurred while loading your protocols'
      });
    }
  }, [currentUser, addToastNotification]);

  // Generated protocols handler
  const handleShowGeneratedProtocols = useCallback(async (uploadId: string, protocols: any[]) => {
    console.log('🔧 Showing generated protocols:', {
      uploadId,
      protocolCount: protocols.length
    });

    // Set generated protocols data
    setGeneratedProtocols(protocols);
    setGeneratedUploadId(uploadId);
    setShowGeneratedProtocols(true);

    // Clear other views
    setShowProtocolPreview(false);
    setShowUserProtocolsIndex(false);
    setMessages([]);

    console.log('✅ Generated protocols view activated');
  }, []);

  // Protocol preview handlers
  const handleShowProtocolPreview = useCallback(async (uploadId: string, protocols: any[]) => {
    console.log('🔍 Protocol Preview Debug:', {
      uploadId,
      protocolCount: protocols.length,
      protocols: protocols.map(p => ({
        title: p.title,
        stepsCount: p.steps?.length,
        firstStep: p.steps?.[0],
        intent: p.intent,
        citationsCount: p.citations?.length
      }))
    });

    // Always completely clear ALL view states before setting new protocols
    setShowProtocolPreview(false);
    setShowUserProtocolsIndex(false); // Clear protocol index view
    setShowGeneratedProtocols(false); // Clear generated protocols view
    setPreviewProtocols([]);
    setPreviewUploadId(null);
    setUserIndexProtocols([]); // Clear index protocols

    // Instead of auto-showing preview, now show generated protocols view
    console.log('🔄 Redirecting to generated protocols view...');
    handleShowGeneratedProtocols(uploadId, protocols);
  }, []);

  const handleApproveProtocols = useCallback(async () => {
    try {
      if (!currentUser || !generatedUploadId) return;

      const result = await approveAndIndexUpload(currentUser.uid, generatedUploadId);
      console.log('✅ Protocols approved and indexing started:', result);

      setShowGeneratedProtocols(false);
      setGeneratedProtocols([]);
      setGeneratedUploadId(null);

      // Show success toast notification
      addToastNotification({
        type: 'success',
        title: 'Protocols Approved',
        message: 'Protocols approved successfully! Indexing in progress...'
      });

      // Trigger sidebar refresh
      setSavedProtocolsRefreshTrigger(prev => prev + 1);

    } catch (error) {
      console.error('❌ Failed to approve protocols:', error);
      const errorMessage: Message = {
        id: Date.now().toString(),
        type: 'assistant',
        content: 'Failed to approve protocols. Please try again.',
        timestamp: getUserTimestamp(),
      };
      setMessages([errorMessage]);
    }
  }, [currentUser, generatedUploadId, addToastNotification]);

  const handleRegenerateProtocols = useCallback(async (customPrompt: string = '') => {
    try {
      if (!currentUser || !generatedUploadId) return;

      setIsRegenerating(true);
      console.log('🔄 Starting protocol regeneration...');

      // Use the regenerateUploadProtocols API for upload protocols to keep them in preview
      const { regenerateUploadProtocols, getUploadPreview } = await import('@/lib/api');
      const result = await regenerateUploadProtocols(currentUser.uid, generatedUploadId, customPrompt || '');

      console.log('✅ Protocol regeneration initiated:', result);

      addToastNotification({
        type: 'success',
        title: 'Regeneration Started',
        message: `Protocol regeneration started! New protocols will appear shortly.`
      });

      // Close the modal
      setShowRegenerateModal(false);

      // Poll for the regenerated protocols and update the view
      const pollForRegeneratedProtocols = async () => {
        let attempts = 0;
        const maxAttempts = 30; // 30 seconds max

        const poll = async () => {
          try {
            attempts++;
            console.log(`🔍 Polling for regenerated protocols (attempt ${attempts}/${maxAttempts})`);

            const preview = await getUploadPreview(currentUser.uid, generatedUploadId);

            if (preview && preview.protocols && preview.protocols.length > 0) {
              console.log('✅ Found regenerated protocols:', preview.protocols);

              // Update the Generated Protocols view with new protocols
              setGeneratedProtocols(preview.protocols);

              // Ensure the Generated Protocols view is visible
              setShowGeneratedProtocols(true);

              addToastNotification({
                type: 'success',
                title: 'Protocols Regenerated',
                message: `${preview.protocols.length} new protocols generated successfully!`
              });

              return; // Stop polling
            }

            if (attempts < maxAttempts) {
              setTimeout(poll, 1000); // Poll every 1 second
            } else {
              console.log('⏰ Polling timeout - regenerated protocols not found');
              addToastNotification({
                type: 'info',
                title: 'Regeneration in Progress',
                message: 'Regeneration is taking longer than expected. Please check back in a moment.'
              });
            }
          } catch (pollError) {
            console.error('❌ Error polling for regenerated protocols:', pollError);
            if (attempts < maxAttempts) {
              setTimeout(poll, 1000); // Retry on error
            }
          }
        };

        poll();
      };

      // Start polling after a short delay
      setTimeout(pollForRegeneratedProtocols, 2000);

    } catch (error) {
      console.error('❌ Protocol regeneration failed:', error);
      addToastNotification({
        type: 'error',
        title: 'Regeneration Failed',
        message: error instanceof Error ? error.message : 'Failed to regenerate protocols'
      });
    } finally {
      setIsRegenerating(false);
    }
  }, [currentUser, generatedUploadId, addToastNotification]);

  // Focus management for regeneration modal
  useEffect(() => {
    if (showRegenerateModal && regenerationTextareaRef.current) {
      // Small delay to ensure modal is fully rendered
      const timer = setTimeout(() => {
        if (regenerationTextareaRef.current) {
          regenerationTextareaRef.current.focus();
          // Place cursor at the end of the text
          const length = regenerationTextareaRef.current.value.length;
          regenerationTextareaRef.current.setSelectionRange(length, length);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [showRegenerateModal]);

  const handleRegenerateFromPreview = useCallback(() => {
    setShowRegenerateForm(true);
    setRegenerationPrompt('Focus on specific aspects like pediatric considerations, emergency protocols, or detailed contraindications');
  }, []);

  const handleConfirmRegenerate = useCallback(async () => {
    if (!currentUser || !previewUploadId || !regenerationPrompt.trim()) {
      return;
    }

    setIsRegenerating(true);
    try {
      console.log('🔄 Starting upload protocol regeneration for upload:', previewUploadId);

      // Call the correct regeneration API for upload protocols
      const result = await regenerateUploadProtocols(currentUser.uid, previewUploadId, regenerationPrompt);
      console.log('✅ Upload protocol regeneration result:', result);

      // Reset regeneration form
      setShowRegenerateForm(false);
      setRegenerationPrompt('');
      setIsRegenerated(true);

      // Show success message in chat
      const successMessage: Message = {
        id: Date.now().toString(),
        type: 'assistant',
        content: '🔄 Protocol regeneration started successfully! Your protocols are being regenerated with the new instructions using Gemini AI. Please wait a moment for the updated protocols to be ready.',
        timestamp: getUserTimestamp(),
      };
      setMessages([successMessage]);

      // Wait a moment then refresh the preview to show regenerated protocols
      setTimeout(async () => {
        try {
          const updatedPreview = await getUploadPreview(currentUser.uid, previewUploadId);
          if (updatedPreview.success && updatedPreview.protocols) {
            // Use the same clear-and-set pattern as handleShowProtocolPreview
            console.log('🔄 Refreshing preview with regenerated protocols');
            handleShowProtocolPreview(previewUploadId, updatedPreview.protocols);
          }
        } catch (previewError) {
          console.error('⚠️ Failed to refresh preview:', previewError);
        }
      }, 3000); // Wait 3 seconds for regeneration to complete

      console.log('✅ Regeneration initiated - protocols will be refreshed shortly');

    } catch (error) {
      console.error('❌ Upload protocol regeneration failed:', error);
      alert(`Failed to regenerate protocols: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRegenerating(false);
    }
  }, [currentUser, previewUploadId, regenerationPrompt, handleShowProtocolPreview]);

  const handleCancelRegenerate = useCallback(() => {
    setShowRegenerateForm(false);
    setRegenerationPrompt('');
  }, []);

  const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setRegenerationPrompt(e.target.value);
  }, []);


  // Notification handlers
  const addNotification = useCallback((notification: Omit<typeof notifications[0], 'id' | 'timestamp'>) => {
    const newNotification = {
      ...notification,
      id: `notif_${Date.now()}`,
      timestamp: Date.now()
    };
    setNotifications(prev => [...prev, newNotification]);

    // If this notification contains generated protocols, update the state
    if (notification.type === 'upload_ready' && notification.uploadId && notification.protocols) {
      console.log('🔔 Notification received with protocols, updating generated protocols state');
      setGeneratedProtocols(notification.protocols);
      setGeneratedUploadId(notification.uploadId);
    }

    // Auto-remove notification after 10 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== newNotification.id));
    }, 10000);
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const handleNotificationClick = useCallback((notification: typeof notifications[0]) => {
    if (notification.type === 'upload_ready' && notification.uploadId && notification.protocols) {
      // Show upload preview
      handleShowProtocolPreview(notification.uploadId, notification.protocols);
      removeNotification(notification.id);
    }
  }, [handleShowProtocolPreview, removeNotification]);

  // Modal handlers
  const handleShowLogoutModal = () => {
    setShowLogoutModal(true);
  };

  const handleShowDeleteModal = () => {
    setShowDeleteModal(true);
  };

  const handleClearProtocolCache = useCallback((clearCacheFunction: () => void) => {
    clearProtocolCacheRef.current = clearCacheFunction;
  }, []);

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
          onShowProtocolPreview={handleShowProtocolPreview}
          onShowUserProtocolsIndex={handleShowUserProtocolsIndex}
          onShowGeneratedProtocols={handleShowGeneratedProtocols}
          generatedProtocols={generatedProtocols}
          generatedUploadId={generatedUploadId}
          onNotifyUploadReady={addNotification}
          onShowConfirmation={showConfirmation}
          onClearProtocolCache={handleClearProtocolCache}
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
          key={`content-${showUserProtocolsIndex}-${showProtocolPreview}-${Date.now()}`}
        >
          {/* User Protocol Index View */}
          {console.log('🎬 Render check:', { showUserProtocolsIndex, userIndexProtocolsLength: userIndexProtocols.length }) || showUserProtocolsIndex && (
            <div className="max-w-4xl mx-auto">
              <div className="bg-white rounded-lg shadow-lg border border-slate-200 mb-6">
                <div className="p-6 border-b border-slate-200">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h1 className="text-2xl font-bold text-slate-900">Your Protocol Index</h1>
                      <p className="text-slate-600">
                        {userIndexProtocols.length} protocols uploaded from your documents
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          showConfirmation({
                            title: 'Delete All Protocols',
                            message: `Are you sure you want to delete all ${userIndexProtocols.length} protocols from your index? This action cannot be undone and will permanently remove all your uploaded protocols.`,
                            confirmText: `Delete All ${userIndexProtocols.length} Protocols`,
                            dangerous: true,
                            confirmAction: async () => {
                              try {
                                if (!currentUser) return;

                                // Call the deleteAllUserProtocols API function
                                const result = await deleteAllUserProtocols(currentUser.uid);

                                // Clear local state
                                setUserIndexProtocols([]);

                                // Clear the cache so sidebar shows updated count
                                if (clearProtocolCacheRef.current) {
                                  clearProtocolCacheRef.current();
                                }

                                addToastNotification({
                                  type: 'success',
                                  title: 'All Protocols Deleted',
                                  message: `Successfully deleted ${result.deleted_count} protocols from your index`
                                });

                                // Also close the index view since there are no protocols left
                                setTimeout(() => {
                                  setShowUserProtocolsIndex(false);
                                }, 1500);

                              } catch (error) {
                                console.error('Failed to delete all protocols:', error);
                                addToastNotification({
                                  type: 'error',
                                  title: 'Delete Failed',
                                  message: error instanceof Error ? error.message : 'Failed to delete all protocols'
                                });
                              }
                            }
                          });
                        }}
                        className="text-red-600 border-red-200 hover:bg-red-50"
                      >
                        Delete All
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowUserProtocolsIndex(false);
                          setUserIndexProtocols([]);
                        }}
                        className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600"
                      >
                        ×
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  <div className="space-y-6">
                    {userIndexProtocols.map((protocol, index) => (
                      <div key={index} className="border border-slate-200 rounded-lg p-4">
                        <div className="mb-4">
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="text-xl font-semibold text-slate-900 flex-1 pr-4">
                              {protocol.title}
                            </h3>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                showConfirmation({
                                  title: 'Delete Protocol',
                                  message: `Are you sure you want to delete "${protocol.title}"? This action cannot be undone.`,
                                  confirmText: 'Delete Protocol',
                                  dangerous: true,
                                  confirmAction: async () => {
                                    try {
                                      if (!currentUser) return;

                                      // Use the existing deleteUserProtocol API function
                                      await deleteUserProtocol(currentUser.uid, protocol.id);

                                      // Remove from local state
                                      setUserIndexProtocols(prev => prev.filter(p => p.id !== protocol.id));

                                      // Clear the cache so sidebar shows updated count
                                      if (clearProtocolCacheRef.current) {
                                        clearProtocolCacheRef.current();
                                      }

                                      addToastNotification({
                                        type: 'success',
                                        title: 'Protocol Deleted',
                                        message: `"${protocol.title}" has been deleted successfully`
                                      });
                                    } catch (error) {
                                      console.error('Failed to delete protocol:', error);
                                      addToastNotification({
                                        type: 'error',
                                        title: 'Delete Failed',
                                        message: error instanceof Error ? error.message : 'Failed to delete protocol'
                                      });
                                    }
                                  }
                                });
                              }}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0"
                            >
                              🗑️
                            </Button>
                          </div>
                          <div className="flex items-center space-x-4 text-sm text-slate-500">
                            <span>Steps: {protocol.steps_count || 0}</span>
                            <span>Citations: {protocol.citations_count || 0}</span>
                            <span>Source: {protocol.source_file || protocol.organization}</span>
                          </div>
                        </div>

                        {/* Protocol Steps Preview */}
                        <div className="space-y-3">
                          <h4 className="font-medium text-slate-700">Steps:</h4>
                          <div className="space-y-2">
                            {(() => {
                              // Try multiple possible step locations - add step_details
                              const steps = protocol.protocol_data?.step_details ||
                                          protocol.protocol_data?.steps ||
                                          protocol.protocol_data?.checklist ||
                                          protocol.steps ||
                                          [];
                              return steps?.length > 0 ? steps.slice(0, 5).map((step: any, stepIndex: number) => (
                              <div key={stepIndex} className="flex items-start space-x-3 p-3 bg-slate-50 rounded-lg">
                                <div className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                                  {stepIndex + 1}
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm text-slate-700">
                                    {step.step || step.text || step.description || step.content || JSON.stringify(step)}
                                  </p>
                                  {step.explanation && (
                                    <p className="text-xs text-slate-500 mt-1">
                                      {step.explanation}
                                    </p>
                                  )}
                                </div>
                              </div>
                            )) : (
                              <div className="text-sm text-slate-500 italic p-3 bg-slate-50 rounded-lg">
                                No steps available in this protocol
                              </div>
                            );
                            })()}
                            {(() => {
                              const steps = protocol.protocol_data?.step_details ||
                                          protocol.protocol_data?.steps ||
                                          protocol.protocol_data?.checklist ||
                                          protocol.steps ||
                                          [];
                              return steps?.length > 5 && (
                                <div className="text-xs text-slate-500 italic text-center py-2">
                                  ... and {steps.length - 5} more steps
                                </div>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Citations Preview */}
                        {protocol.protocol_data?.citations && protocol.protocol_data.citations.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-slate-100">
                            <h4 className="font-medium text-slate-700 text-sm mb-2">Sources:</h4>
                            <div className="text-xs text-slate-500 space-y-1">
                              {protocol.protocol_data.citations.slice(0, 3).map((citation: any, citIndex: number) => (
                                <div key={citIndex} className="flex items-center space-x-2">
                                  <span className="inline-flex items-center px-2 py-1 rounded bg-slate-200 text-slate-700 font-medium">
                                    [{citation.id}]
                                  </span>
                                  <span>{citation.source}</span>
                                </div>
                              ))}
                              {protocol.protocol_data.citations.length > 3 && (
                                <div className="text-xs text-slate-400 italic">
                                  ... and {protocol.protocol_data.citations.length - 3} more sources
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {userIndexProtocols.length === 0 && (
                      <div className="text-center py-8 text-slate-500">
                        <div className="text-4xl mb-3">📄</div>
                        <h3 className="text-lg font-medium text-slate-900 mb-2">No protocols found</h3>
                        <p className="text-sm">Upload medical documents to see your protocols here.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Generated Protocols View - Only show if User Index is not active */}
          {showGeneratedProtocols && !showUserProtocolsIndex && (
            <div className="max-w-4xl mx-auto">
              {/* Header */}
              <div className="bg-white rounded-lg shadow-lg border border-slate-200 mb-6">
                <div className="p-6 border-b border-slate-200">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h1 className="text-2xl font-bold text-slate-900">Generated Protocols</h1>
                      <p className="text-slate-600">
                        {generatedProtocols.length} protocols generated from your upload. Review and approve to add to your index.
                      </p>
                    </div>
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={() => {
                          setShowGeneratedProtocols(false);
                          setGeneratedProtocols([]);
                          setGeneratedUploadId(null);
                        }}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        ✕
                      </button>
                    </div>
                  </div>


                  {/* Action Buttons */}
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={handleApproveProtocols}
                      disabled={!currentUser || !generatedUploadId}
                      className={`px-6 py-2 rounded-lg font-medium ${
                        currentUser && generatedUploadId
                          ? 'bg-teal-600 hover:bg-teal-700 text-white'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      Approve & Add to Index ({generatedProtocols.length} protocols)
                    </button>
                    <button
                      onClick={() => {
                        console.log('🔄 Regenerate button clicked for upload:', generatedUploadId);

                        if (!currentUser || !generatedUploadId) {
                          console.error('❌ User not logged in or no upload ID');
                          return;
                        }

                        setShowRegenerateModal(true);
                      }}
                      disabled={!currentUser || !generatedUploadId || isRegenerating}
                      className={`px-6 py-2 rounded-lg font-medium ${
                        currentUser && generatedUploadId && !isRegenerating
                          ? 'bg-slate-600 hover:bg-slate-700 text-white'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      {isRegenerating ? 'Regenerating...' : 'Regenerate Protocols'}
                    </button>
                  </div>
                </div>

                {/* Protocols List */}
                <div className="p-6">
                  {generatedProtocols.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      No protocols data available
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {generatedProtocols.map((protocol: any, index: number) => {
                        console.log(`🔍 Rendering protocol ${index}:`, protocol);

                        // Extract protocol steps from various possible structures
                        let protocolSteps = protocol.steps ||
                                          protocol.protocol_steps ||
                                          protocol.instructions ||
                                          protocol.procedures ||
                                          [];

                        // If steps are simple numbers or empty, try to extract from other fields
                        if (!protocolSteps || protocolSteps.length === 0 ||
                            (protocolSteps.length > 0 && typeof protocolSteps[0] === 'number')) {

                          // Check if there's text and explanation in the protocol object itself
                          if (protocol.text && protocol.explanation) {
                            protocolSteps = [
                              { step: 1, text: protocol.text, explanation: protocol.explanation }
                            ];
                          }

                          // Check if there are numbered step properties
                          const stepKeys = Object.keys(protocol).filter(key => key.startsWith('step_') || key.match(/step\d+/));
                          if (stepKeys.length > 0) {
                            protocolSteps = stepKeys.map(key => protocol[key]);
                          }
                        }

                        // Extract citations from various possible structures
                        const protocolCitations = protocol.citations ||
                                                protocol.sources ||
                                                protocol.references ||
                                                [];

                        return (
                          <div key={`generated-${index}`} className="border border-slate-200 rounded-lg p-6">
                            <div className="flex items-start justify-between mb-4">
                              <div className="flex-1">
                                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                                  {protocol.title || protocol.name || protocol.protocol_name || `Protocol ${index + 1}`}
                                </h3>
                                {(protocol.intent || protocol.clinical_intent || protocol.description || protocol.purpose) && (
                                  <p className="text-slate-600 text-sm mb-3">
                                    <strong>Clinical Intent:</strong> {
                                      protocol.intent ||
                                      protocol.clinical_intent ||
                                      protocol.description ||
                                      protocol.purpose
                                    }
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Protocol Steps */}
                            {protocolSteps && protocolSteps.length > 0 && (
                              <div className="mb-4">
                                <h4 className="font-medium text-slate-900 mb-3">Protocol Steps:</h4>
                                <div className="space-y-4">
                                  {protocolSteps.slice(0, 5).map((step: any, stepIndex: number) => {
                                    // Extract step components separately like indexed protocols
                                    let stepText = '';
                                    let stepExplanation = '';

                                    if (typeof step === 'string') {
                                      stepText = step;
                                    } else if (typeof step === 'object' && step !== null) {
                                      stepText = step.text || step.step || step.description || step.content || step.instruction || step.procedure || step.action;
                                      stepExplanation = step.explanation || step.details || step.description_long;
                                    } else {
                                      stepText = String(step);
                                    }

                                    return (
                                      <div key={stepIndex} className="border-l-4 border-blue-200 pl-4">
                                        <div className="flex items-start space-x-3 mb-2">
                                          <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium">
                                            {stepIndex + 1}
                                          </span>
                                          <div className="flex-1">
                                            <p className="text-slate-900 font-medium text-sm">
                                              {stepText || `Step ${stepIndex + 1}`}
                                            </p>
                                            {stepExplanation && stepExplanation !== stepText && (
                                              <p className="text-slate-600 text-sm mt-1">
                                                {stepExplanation}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {protocolSteps.length > 5 && (
                                    <p className="text-slate-500 text-sm ml-9">
                                      ... and {protocolSteps.length - 5} more steps
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Citations */}
                            {protocolCitations && protocolCitations.length > 0 && (
                              <div className="mt-4">
                                <h4 className="font-medium text-slate-900 mb-2">Sources:</h4>
                                <div className="text-sm text-slate-600">
                                  {protocolCitations.slice(0, 3).map((citation: any, citIndex: number) => (
                                    <div key={citIndex} className="mb-1">
                                      📄 {citation.source || citation.title || citation.name || citation}
                                    </div>
                                  ))}
                                  {protocolCitations.length > 3 && (
                                    <div className="text-xs text-slate-400 italic">
                                      ... and {protocolCitations.length - 3} more sources
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Protocol Preview in Main Content Area */}
          {showProtocolPreview && (
            <div className="max-w-4xl mx-auto">
              {/* Preview Header */}
              <div className="bg-white rounded-lg shadow-lg border border-slate-200 mb-6">
                <div className="p-6 border-b border-slate-200">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="flex items-center space-x-2 mb-2">
                        <h1 className="text-2xl font-bold text-slate-900">Protocol Preview</h1>
                        {isRegenerated && (
                          <div className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                            ✨ Regenerated
                          </div>
                        )}
                      </div>
                      <p className="text-slate-600">
                        {isRegenerated
                          ? "Your protocols have been regenerated with the new instructions. Review them below and approve to add to your library."
                          : "Review the generated protocols below. You can approve them to add to your library or regenerate with different instructions."
                        }
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowProtocolPreview(false);
                        setShowRegenerateForm(false);
                        setRegenerationPrompt('');
                        setPreviewProtocols([]);
                        setPreviewUploadId(null);
                        setIsRegenerated(false);
                      }}
                      className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600"
                    >
                      ×
                    </Button>
                  </div>

                  {/* Action Buttons or Regeneration Form */}
                  {!showRegenerateForm ? (
                    <div className="flex space-x-3">
                      <Button
                        onClick={handleApproveProtocols}
                        className="bg-teal-600 hover:bg-teal-700 text-white"
                        disabled={previewProtocols.length === 0}
                      >
                        ✓ Approve & Add to Library ({previewProtocols.length} protocols)
                      </Button>
                      <Button
                        onClick={handleRegenerateFromPreview}
                        variant="outline"
                      >
                        🔄 Regenerate with New Instructions
                      </Button>
                    </div>
                  ) : (
                    // Regeneration Form
                    <div className="space-y-4">
                      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <h3 className="text-sm font-medium text-yellow-800 mb-2">
                          🔄 Regenerate Protocols
                        </h3>
                        <p className="text-sm text-yellow-700">
                          Provide new instructions to regenerate these protocols with different focus or requirements.
                        </p>
                      </div>

                      <div>
                        <label htmlFor="regen-prompt" className="block text-sm font-medium text-slate-900 mb-2">
                          Custom Instructions
                        </label>
                        <textarea
                          id="regen-prompt"
                          defaultValue="Focus on specific aspects like pediatric considerations, emergency protocols, or detailed contraindications"
                          placeholder="Enter your regeneration instructions here..."
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none text-sm"
                          rows={3}
                          disabled={isRegenerating}
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          Specify how you want the protocols to be regenerated. The AI will use these instructions to create new versions.
                        </p>
                      </div>

                      <div className="flex space-x-3">
                        <Button
                          onClick={handleCancelRegenerate}
                          variant="outline"
                          disabled={isRegenerating}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={() => {
                            const textarea = document.getElementById('regen-prompt') as HTMLTextAreaElement;
                            const prompt = textarea?.value || '';
                            if (prompt.trim()) {
                              setRegenerationPrompt(prompt);
                              handleConfirmRegenerate();
                            }
                          }}
                          className="bg-teal-600 hover:bg-teal-700 text-white"
                          disabled={isRegenerating}
                        >
                          {isRegenerating ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                              Regenerating...
                            </>
                          ) : (
                            <>
                              🔄 Regenerate Protocols
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Preview Content */}
                <div className="p-6">
                  <div className="space-y-6">
                    {previewProtocols.map((protocol, index) => (
                      <div key={index} className="border border-slate-200 rounded-lg p-4">
                        <div className="mb-4">
                          <h3 className="text-xl font-semibold text-slate-900 mb-2">
                            {protocol.title}
                          </h3>
                          <div className="flex items-center space-x-4 text-sm text-slate-500">
                            <span>Steps: {protocol.steps?.length || 0}</span>
                            <span>Citations: {protocol.citations?.length || 0}</span>
                            <span>Intent: {protocol.intent || 'General'}</span>
                          </div>
                        </div>

                        {/* Protocol Steps Preview */}
                        <div className="space-y-3">
                          <h4 className="font-medium text-slate-700">Steps:</h4>
                          <div className="space-y-2">
                            {protocol.steps?.length > 0 ? protocol.steps.slice(0, 5).map((step: any, stepIndex: number) => (
                              <div key={stepIndex} className="flex items-start space-x-3 p-3 bg-slate-50 rounded-lg">
                                <div className="flex-shrink-0 w-6 h-6 bg-teal-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                                  {stepIndex + 1}
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm text-slate-700">
                                    {step.step || step.text || step.description || step.content || JSON.stringify(step)}
                                  </p>
                                  {step.explanation && (
                                    <p className="text-xs text-slate-500 mt-1">
                                      {step.explanation}
                                    </p>
                                  )}
                                </div>
                              </div>
                            )) : (
                              <div className="text-sm text-slate-500 italic p-3 bg-slate-50 rounded-lg">
                                No steps available in this protocol
                              </div>
                            )}
                            {protocol.steps?.length > 5 && (
                              <div className="text-xs text-slate-500 italic text-center py-2">
                                ... and {protocol.steps.length - 5} more steps
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Citations Preview */}
                        {protocol.citations && protocol.citations.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-slate-100">
                            <h4 className="font-medium text-slate-700 text-sm mb-2">Sources:</h4>
                            <div className="text-xs text-slate-500 space-y-1">
                              {protocol.citations.slice(0, 3).map((citation: any, citIndex: number) => (
                                <div key={citIndex} className="flex items-center space-x-2">
                                  <span className="inline-flex items-center px-2 py-1 rounded bg-slate-200 text-slate-700 font-medium">
                                    [{citation.id}]
                                  </span>
                                  <span>{citation.source}</span>
                                </div>
                              ))}
                              {protocol.citations.length > 3 && (
                                <div className="text-xs text-slate-400 italic">
                                  ... and {protocol.citations.length - 3} more sources
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {previewProtocols.length === 0 && (
                      <div className="text-center py-8 text-slate-500">
                        <div className="text-4xl mb-3">📄</div>
                        <h3 className="text-lg font-medium text-slate-900 mb-2">No protocols generated</h3>
                        <p className="text-sm">Please try uploading again with different instructions.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {!showProtocolPreview && !showUserProtocolsIndex && !showGeneratedProtocols && messages.length === 0 && (
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

          {/* Notification Panel */}
          {notifications.length > 0 && (
            <div className="fixed top-20 right-8 space-y-3 z-50 max-w-sm">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className="bg-white border border-slate-200 rounded-lg shadow-lg p-4 cursor-pointer hover:shadow-xl transition-all"
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        {notification.type === 'upload_ready' ? (
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        ) : (
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                        )}
                        <h3 className="text-sm font-semibold text-slate-900">
                          {notification.title}
                        </h3>
                      </div>
                      <p className="text-sm text-slate-600 mb-3">
                        {notification.message}
                      </p>
                      <div className="flex items-center space-x-2">
                        <Button
                          size="sm"
                          className="bg-teal-600 hover:bg-teal-700 text-white text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleNotificationClick(notification);
                          }}
                        >
                          {notification.type === 'upload_ready' ? 'View Protocols' : 'View Result'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-slate-500 hover:text-slate-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeNotification(notification.id);
                          }}
                        >
                          Dismiss
                        </Button>
                      </div>
                    </div>
                    <button
                      className="text-slate-400 hover:text-slate-600 ml-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeNotification(notification.id);
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {!showProtocolPreview && !showUserProtocolsIndex && !showGeneratedProtocols && (
          <ChatInput
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
            hasMessages={messages.length > 0}
            onSearchFilterChange={setSearchFilter}
            searchFilter={searchFilter}
          />
        )}
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

      {/* Custom Confirmation Modal */}
      {showConfirmModal && confirmModalData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
          <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl">
            <div className="flex items-center space-x-3 mb-4">
              <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                confirmModalData.dangerous ? 'bg-red-100' : 'bg-orange-100'
              }`}>
                {confirmModalData.dangerous ? (
                  <span className="text-red-600 text-lg">⚠️</span>
                ) : (
                  <span className="text-orange-600 text-lg">❓</span>
                )}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{confirmModalData.title}</h3>
              </div>
            </div>
            <div className="mb-6">
              <p className="text-sm text-slate-600">{confirmModalData.message}</p>
            </div>
            <div className="flex space-x-3 justify-end">
              <Button
                variant="outline"
                onClick={handleCancelAction}
                className="px-4 py-2"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmAction}
                className={`px-4 py-2 text-white ${
                  confirmModalData.dangerous
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-orange-600 hover:bg-orange-700'
                }`}
              >
                {confirmModalData.confirmText}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Regeneration Modal */}
      {showRegenerateModal && (
        <RegenerationModal
          isOpen={showRegenerateModal}
          isRegenerating={isRegenerating}
          onCancel={() => setShowRegenerateModal(false)}
          onRegenerate={handleRegenerateProtocols}
        />
      )}

      {/* Toast Notifications */}
      {toastNotifications.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {toastNotifications.map((notification) => (
            <div
              key={notification.id}
              className={`
                flex items-start p-4 rounded-lg shadow-lg border min-w-80 max-w-96
                animate-in slide-in-from-right-full duration-300
                ${notification.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
                  notification.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
                  'bg-blue-50 border-blue-200 text-blue-800'}
              `}
            >
              <div className="flex-1">
                <h4 className="font-semibold text-sm mb-1">
                  {notification.title}
                </h4>
                <p className="text-sm opacity-90">
                  {notification.message}
                </p>
              </div>
              <button
                onClick={() => removeToastNotification(notification.id)}
                className="ml-2 text-current opacity-60 hover:opacity-100 transition-opacity"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
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
