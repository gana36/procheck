import { useState, useRef, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Menu, X, LogOut, UserX, FileText, Plus } from 'lucide-react';
import LandingScreen from '@/components/LandingPage';
import Sidebar from '@/components/Sidebar';
import ChatInput from '@/components/ChatInput';
import ChatContainer from '@/components/ChatContainer';
import ProtocolTabs from '@/components/ProtocolTabs';
import LoginPage from '@/components/auth/LoginPage';
import SignupPage from '@/components/auth/SignupPage';
import ForgotPasswordPage from '@/components/auth/ForgotPasswordPage';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import NetworkStatusBanner from '@/components/NetworkStatusBanner';
import { Message, ProtocolData, ProtocolStep, Citation, SearchMetadata, AppTab, ConversationTab, ProtocolTab, ProtocolIndexTab } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { searchProtocols, generateProtocol, saveConversation, getConversation, getSavedProtocol, ConversationMessage, protocolConversationChat, deleteUserData } from '@/lib/api';
import { deleteUser, EmailAuthProvider, reauthenticateWithCredential, GoogleAuthProvider, reauthenticateWithPopup } from 'firebase/auth';
import { generateMessageId, generateConversationId, generateTabId } from '@/lib/id-generator';
import { formatErrorMessage } from '@/lib/error-handler';
import { approveAndIndexUpload, getUploadPreview, regenerateUploadProtocols, getUserUploadedProtocols, deleteUserProtocol, deleteAllUserProtocols, deleteUploadPreview } from '@/lib/api';
import { detectFollowUp, validateMessageContent, sanitizeInput } from '@/lib/chat-utils';

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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const handleToggleSidebarCollapse = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmError, setDeleteConfirmError] = useState('');
  const [showNewTabDialog, setShowNewTabDialog] = useState(false);

  // Profile modal state - moved from Sidebar to prevent reset on re-renders
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [activeProfileTab, setActiveProfileTab] = useState<'profile' | 'protocols'>('profile');

  // Profile modal handlers
  const handleOpenProfile = useCallback(() => setIsProfileOpen(true), []);
  const handleCloseProfile = useCallback(() => {
    setIsProfileOpen(false);
    setActiveProfileTab('profile');
  }, []);
  const handleSetActiveProfileTab = useCallback((tab: 'profile' | 'protocols') => {
    setActiveProfileTab(tab);
  }, []);
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const [showCloseAllDialog, setShowCloseAllDialog] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Tab management state with localStorage persistence
  const [tabs, setTabs] = useState<AppTab[]>(() => {
    try {
      const savedTabs = localStorage.getItem('procheck_tabs');
      if (savedTabs) {
        const parsed = JSON.parse(savedTabs) as AppTab[];
        if (parsed.length > 0) {
          return parsed;
        }
      }
    } catch (error) {
      console.error('Failed to restore tabs from localStorage:', error);
    }
    // Default tab if nothing in storage
    const defaultTabId = generateTabId();
    return [{
      id: defaultTabId,
      title: 'New Protocol',
      type: 'chat' as const,
      messages: [],
      conversationId: generateConversationId(),
      isLoading: false
    }];
  });

  const [activeTabId, setActiveTabId] = useState(() => {
    try {
      // First check if there's a saved active tab
      const savedActiveTab = localStorage.getItem('procheck_active_tab');
      if (savedActiveTab) {
        return savedActiveTab;
      }

      // Then check if there are saved tabs and use the first one's ID
      const savedTabs = localStorage.getItem('procheck_tabs');
      if (savedTabs) {
        const parsed = JSON.parse(savedTabs) as AppTab[];
        if (parsed.length > 0 && parsed[0].id) {
          return parsed[0].id;
        }
      }
    } catch (error) {
      console.error('Failed to restore active tab from localStorage:', error);
    }
    // Fallback: generate a new ID (will be synced with default tab in useEffect)
    return generateTabId();
  });

  // Confirmation modal states
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmModalData, setConfirmModalData] = useState<{
    title: string;
    message: string;
    confirmText: string;
    confirmAction: () => void;
    dangerous?: boolean;
  } | null>(null);
  const [savedProtocolsRefreshTrigger, setSavedProtocolsRefreshTrigger] = useState(0);
  const [searchFilter, setSearchFilter] = useState<'all' | 'global' | 'user'>('all');
  const [showProtocolPreview, setShowProtocolPreview] = useState(false);
  const [previewProtocols, setPreviewProtocols] = useState<any[]>([]);
  const [previewUploadId, setPreviewUploadId] = useState<string | null>(null);
  const [showRegenerateForm, setShowRegenerateForm] = useState(false);
  const [regenerationPrompt, setRegenerationPrompt] = useState('Focus on specific aspects like pediatric considerations, emergency protocols, or detailed contraindications');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isRegenerated, setIsRegenerated] = useState(false);

  // User-specific protocols state (keyed by userId)
  const [userIndexProtocolsByUser, setUserIndexProtocolsByUser] = useState<Record<string, any[]>>({});
  const [generatedProtocolsByUser, setGeneratedProtocolsByUser] = useState<Record<string, any[]>>({});
  const [generatedUploadIdByUser, setGeneratedUploadIdByUser] = useState<Record<string, string | null>>({});

  // Get current user's protocols
  const userIndexProtocols = userId ? (userIndexProtocolsByUser[userId] || []) : [];
  const generatedProtocols = userId ? (generatedProtocolsByUser[userId] || []) : [];
  const generatedUploadId = userId ? (generatedUploadIdByUser[userId] || null) : null;

  // Helper functions to update user-specific protocols
  const setUserIndexProtocols = (protocolsOrUpdater: any[] | ((prev: any[]) => any[])) => {
    if (!userId) return;
    if (typeof protocolsOrUpdater === 'function') {
      setUserIndexProtocolsByUser(prev => {
        const currentProtocols = prev[userId] || [];
        const updatedProtocols = protocolsOrUpdater(currentProtocols);
        return { ...prev, [userId]: updatedProtocols };
      });
    } else {
      setUserIndexProtocolsByUser(prev => ({ ...prev, [userId]: protocolsOrUpdater }));
    }
  };

  const setGeneratedProtocols = (protocolsOrUpdater: any[] | ((prev: any[]) => any[])) => {
    if (!userId) return;
    if (typeof protocolsOrUpdater === 'function') {
      setGeneratedProtocolsByUser(prev => {
        const currentProtocols = prev[userId] || [];
        const updatedProtocols = protocolsOrUpdater(currentProtocols);
        return { ...prev, [userId]: updatedProtocols };
      });
    } else {
      setGeneratedProtocolsByUser(prev => ({ ...prev, [userId]: protocolsOrUpdater }));
    }
  };

  const setGeneratedUploadId = (uploadId: string | null) => {
    if (!userId) return;
    setGeneratedUploadIdByUser(prev => ({ ...prev, [userId]: uploadId }));
  };

  // Upload state - moved from Sidebar for persistence across navigation
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    status: string;
    filename?: string;
    upload_id?: string;
    progress?: number;
    protocols_extracted?: number;
    protocols_indexed?: number;
    error?: string;
  } | null>(null);
  const [uploadCancelled, setUploadCancelled] = useState(false);
  const [currentUploadId, setCurrentUploadId] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

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
  const savedScrollPositionRef = useRef(0);

  // Cache for loaded conversations to prevent redundant fetches with LRU eviction
  const conversationCache = useRef<Map<string, Message[]>>(new Map());
  const MAX_CACHE_SIZE = 20; // Maximum number of conversations to cache

  // Track deleted conversations to prevent auto-save from resurrecting them
  const deletedConversations = useRef<Set<string>>(new Set());
  
  // Track recently saved conversations to prevent duplicate saves
  const recentlySavedConversations = useRef<Map<string, number>>(new Map());
  
  // LRU Cache helper: Add to cache with automatic eviction
  const addToCache = useCallback((conversationId: string, messages: Message[]) => {
    const cache = conversationCache.current;
    
    // If conversation already exists, delete it first (to re-add at end for LRU)
    if (cache.has(conversationId)) {
      cache.delete(conversationId);
    }
    
    // Add new entry
    cache.set(conversationId, messages);
    
    // LRU EVICTION: If cache exceeds max size, remove oldest entry
    if (cache.size > MAX_CACHE_SIZE) {
      const firstKey = cache.keys().next().value;
      if (firstKey) {
        cache.delete(firstKey);
        console.log(`🗑️ LRU eviction: Removed conversation ${firstKey} from cache`);
      }
    }
    
    console.log(`💾 Cache updated: ${cache.size}/${MAX_CACHE_SIZE} conversations cached`);
  }, []);
  
  // Abort controller for managing in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);

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

  // Debounced save helper
  const debouncedSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Helper function to save conversation with debouncing and deduplication
  const saveCurrentConversation = useCallback(async (updatedMessages: Message[], lastQuery: string, conversationId: string) => {
    if (!currentUser) return;

    // CRITICAL: Don't save deleted conversations - prevents resurrection
    if (deletedConversations.current.has(conversationId)) {
      console.log(`🚫 Skipping save for deleted conversation: ${conversationId}`);
      return;
    }

    // DEDUPLICATION: Check if this conversation was recently saved
    const lastSaveTime = recentlySavedConversations.current.get(conversationId);
    const now = Date.now();
    if (lastSaveTime && (now - lastSaveTime) < 2000) {
      console.log(`🚫 Skipping duplicate save for conversation ${conversationId} (saved ${now - lastSaveTime}ms ago)`);
      return;
    }

    try {
      const conversationMessages: ConversationMessage[] = updatedMessages.map(msg => ({
        id: msg.id,
        type: msg.type as 'user' | 'assistant',
        content: msg.content,
        timestamp: msg.timestamp, // Preserve original message timestamp
        protocol_data: msg.protocolData || undefined,
        // Include conversation-specific fields for follow-up responses
        citations: msg.citations || undefined,
        follow_up_questions: msg.followUpQuestions || undefined,
        uncertainty_note: msg.uncertaintyNote || undefined,
        used_new_sources: msg.usedNewSources || undefined,
        is_follow_up: msg.isFollowUp || undefined,
      }));

      // Use the first message timestamp as conversation created_at
      const firstMessageTimestamp = updatedMessages.length > 0 ? updatedMessages[0].timestamp : getUserTimestamp();

      // Double-check conversation isn't deleted (in case it was deleted between debounce and save)
      if (deletedConversations.current.has(conversationId)) {
        console.log(`🚫 Conversation ${conversationId} was deleted before save completed, aborting`);
        return;
      }

      // Mark as recently saved BEFORE the API call to prevent race conditions
      recentlySavedConversations.current.set(conversationId, now);

      const result = await saveConversation(currentUser.uid, {
        id: conversationId,
        title: lastQuery.length > 50 ? lastQuery.substring(0, 50) + '...' : lastQuery,
        messages: conversationMessages,
        last_query: lastQuery,
        tags: ['medical-protocol'],
        created_at: firstMessageTimestamp,
      });

      // Update cache with latest messages - OPTIMIZATION: keep cache in sync with LRU eviction
      addToCache(conversationId, updatedMessages);
      
      if (result.was_duplicate) {
        console.log('✅ Conversation updated (duplicate prevented by backend)');
        
        // OPTIONAL: If backend returned a different conversation_id (merged duplicate),
        // update the current tab to use that ID for future saves
        if (result.conversation_id && result.conversation_id !== conversationId) {
          console.log(`🔄 Syncing tab conversation ID: ${conversationId} → ${result.conversation_id}`);
          const activeTab = getActiveTab();
          if (activeTab && activeTab.type === 'chat') {
            updateActiveTab({ conversationId: result.conversation_id });
          }
        }
      } else {
        console.log('✅ Conversation saved and cached');
      }
      
      // Clean up old entries from recently saved map (keep last 50)
      if (recentlySavedConversations.current.size > 50) {
        const entries = Array.from(recentlySavedConversations.current.entries());
        entries.sort((a, b) => a[1] - b[1]); // Sort by timestamp
        const toRemove = entries.slice(0, entries.length - 50);
        toRemove.forEach(([id]) => recentlySavedConversations.current.delete(id));
      }
      
      // Note: Sidebar will only reload on user login or explicit refresh trigger
    } catch (error) {
      console.error('Failed to save conversation:', error);
      // Remove from recently saved on error so it can be retried
      recentlySavedConversations.current.delete(conversationId);
    }
  }, [currentUser, addToCache]);

  // Debounced save wrapper - prevents excessive API calls
  const debouncedSaveConversation = useCallback((messages: Message[], lastQuery: string, conversationId: string) => {
    // Clear existing timeout
    if (debouncedSaveRef.current) {
      clearTimeout(debouncedSaveRef.current);
    }

    // Set new timeout for 1 second
    debouncedSaveRef.current = setTimeout(() => {
      saveCurrentConversation(messages, lastQuery, conversationId);
    }, 1000); // Wait 1 second after last change before saving
  }, [saveCurrentConversation]);

  const handleFollowUpClick = (question: string) => {
    // Mark this as a follow-up to ensure it uses context search
    // by appending a hidden marker that will be removed before sending
    handleSendMessage(`__FOLLOWUP__${question}`);
  };

  // Helper functions for tab management
  const getActiveTab = (): AppTab | null => {
    return tabs.find(tab => tab.id === activeTabId) || null;
  };

  const updateActiveTab = (updates: Partial<ConversationTab>) => {
    setTabs(prevTabs =>
      prevTabs.map(tab =>
        tab.id === activeTabId && tab.type === 'chat'
          ? { ...tab, ...updates } : tab
      )
    );
  };

  // Derived state from active tab
  const activeTab = getActiveTab();
  const messages = activeTab?.type === 'chat' ? activeTab.messages : [];
  const isLoading = activeTab?.isLoading || false;
  const currentConversationId = activeTab?.type === 'chat' ? activeTab.conversationId : generateConversationId();

  // Tab management functions
  const createNewTab = (title: string = 'New Protocol'): string => {
    const newTabId = generateTabId();
    const newTab: ConversationTab = {
      id: newTabId,
      title,
      type: 'chat',
      messages: [],
      conversationId: generateConversationId(),
      isLoading: false
    };

    setTabs(prevTabs => [...prevTabs, newTab]);
    setActiveTabId(newTabId);
    return newTabId;
  };

  const switchToTab = async (tabId: string) => {
    // Cancel any in-flight requests before switching
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Save current tab's conversation before switching
    const currentTab = getActiveTab();
    if (currentTab && currentTab.type === 'chat' && currentTab.messages.length > 0 && userId) {
      const lastUserMessage = [...currentTab.messages].reverse().find(m => m.type === 'user');
      if (lastUserMessage) {
        await saveCurrentConversation(currentTab.messages, lastUserMessage.content, currentTab.conversationId);
      }
    }
    
    setActiveTabId(tabId);
  };

  const closeTab = async (tabId: string) => {
    // Save the tab's conversation before closing
    const tabToClose = tabs.find(tab => tab.id === tabId);
    if (tabToClose && tabToClose.type === 'chat' && tabToClose.messages.length > 0 && userId) {
      const lastUserMessage = [...tabToClose.messages].reverse().find(m => m.type === 'user');
      if (lastUserMessage) {
        await saveCurrentConversation(tabToClose.messages, lastUserMessage.content, tabToClose.conversationId);
      }
    }

    // Clean up preview file when closing generated-protocols tab
    if (tabToClose && tabToClose.type === 'generated-protocols' && currentUser && generatedUploadId) {
      try {
        await deleteUploadPreview(currentUser.uid, generatedUploadId);
        console.log('🧹 Cleaned up preview file on tab close:', generatedUploadId);
        setGeneratedUploadId(null);
        setGeneratedProtocols([]);
      } catch (error) {
        console.error('⚠️ Failed to cleanup preview file:', error);
      }
    }

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
          type: 'chat',
          messages: [],
          conversationId: generateConversationId(),
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

  // Smart follow-up detection using integrated utilities
  const isFollowUpQuestion = (content: string, messages: Message[]): { isFollowUp: boolean; lastProtocol?: ProtocolData } => {
    const analysis = detectFollowUp(content, messages);
    return {
      isFollowUp: analysis.isFollowUp,
      lastProtocol: analysis.lastProtocol
    };
  };

  // Ensure activeTabId always points to a valid tab
  useEffect(() => {
    const activeTabExists = tabs.some(tab => tab.id === activeTabId);
    if (!activeTabExists && tabs.length > 0) {
      console.log('⚠️ Active tab not found, switching to first tab:', tabs[0].id);
      setActiveTabId(tabs[0].id);
    }
  }, [tabs, activeTabId]);

  // Persist tabs to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('procheck_tabs', JSON.stringify(tabs));
    } catch (error) {
      console.error('Failed to persist tabs to localStorage:', error);
    }
  }, [tabs]);

  // Persist active tab to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('procheck_active_tab', activeTabId);
    } catch (error) {
      console.error('Failed to persist active tab to localStorage:', error);
    }
  }, [activeTabId]);

  // Clear localStorage when user changes (handles account deletion + re-signup)
  useEffect(() => {
    const lastUserId = localStorage.getItem('procheck_last_user_id');

    if (userId && lastUserId && userId !== lastUserId) {
      // Different user logged in - clear all cached data
      // Clear ALL localStorage and sessionStorage
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) keysToRemove.push(key);
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      sessionStorage.clear();

      // Clear ALL user-specific protocol state
      setUserIndexProtocolsByUser({});
      setGeneratedProtocolsByUser({});
      setGeneratedUploadIdByUser({});

      // Set the new user ID
      localStorage.setItem('procheck_last_user_id', userId);

      // Reload the page to reset all state
      window.location.reload();
    } else if (userId && !lastUserId) {
      // First time login or after cache clear
      localStorage.setItem('procheck_last_user_id', userId);
    } else if (!userId && lastUserId) {
      // User logged out - clear the tracking
      localStorage.removeItem('procheck_last_user_id');
    }
  }, [userId]);

  // Load user's uploaded protocols when userId changes (only if not already loaded)
  useEffect(() => {
    const loadUserProtocols = async () => {
      if (!userId || !currentUser) return;

      // Check if protocols are already loaded for this user
      if (userIndexProtocolsByUser[userId]?.length > 0) {
        return;
      }

      try {
        const response = await getUserUploadedProtocols(userId, 50);
        if (response.success && response.protocols) {
          setUserIndexProtocols(response.protocols);
        }
      } catch (error) {
        console.error('Failed to load user protocols:', error);
      }
    };

    loadUserProtocols();
  }, [userId, currentUser]); // Only depend on userId and currentUser to avoid infinite loops


  const handleSendMessage = async (content: string, skipDialogCheck: boolean = false) => {
    // Check if this is a follow-up button click
    const isFollowUpButtonClick = content.startsWith('__FOLLOWUP__');
    if (isFollowUpButtonClick) {
      content = content.replace('__FOLLOWUP__', '');
      skipDialogCheck = true; // Always continue in same tab for follow-up buttons
    }
    
    // Validate and sanitize input
    const sanitized = sanitizeInput(content);
    const validation = validateMessageContent(sanitized);
    
    if (!validation.valid) {
      console.error('❌ Invalid message:', validation.error);
      return; // Silently ignore invalid messages
    }
    
    // Get current messages before any state changes
    const currentMessages = messages;
    
    // MESSAGE DEDUPLICATION: Check if identical message is already pending or recently sent
    const recentlySent = currentMessages.find(msg => 
      msg.type === 'user' && 
      msg.content === sanitized && 
      (msg.status === 'pending' || 
       (msg.status === 'sent' && Date.now() - new Date(msg.timestamp).getTime() < 2000)) // Within 2 seconds
    );
    
    if (recentlySent) {
      console.log('🚫 Duplicate message blocked:', sanitized);
      return; // Prevent duplicate send
    }
    
    // Use sanitized content from here on
    content = sanitized;
    
    // Check if this is a follow-up question
    // Force follow-up detection for button clicks
    const followUpCheck = isFollowUpButtonClick 
      ? { isFollowUp: true, lastProtocol: currentMessages.filter(m => m.type === 'assistant' && m.protocolData).pop()?.protocolData }
      : isFollowUpQuestion(content, currentMessages);
    
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
      id: generateMessageId(),
      type: 'user',
      content,
      timestamp: getUserTimestamp(),
      status: 'pending', // Optimistic update - show as pending immediately
    };
    
    // Update current tab with new message and loading state
    updateActiveTab({
      messages: [...currentMessages, userMessage],
      isLoading: true
    });

    try {
      if (followUpCheck.isFollowUp && followUpCheck.lastProtocol) {
        // Handle as protocol conversation (follow-up in same tab)
        console.log('🔄 Follow-up detected, using HYBRID SEARCH + citations');
        console.log('📋 Protocol:', followUpCheck.lastProtocol.title);
        console.log('❓ Follow-up question:', content);
        
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
          conversation_history: conversationHistory,
          enable_context_search: true, // Enable fresh context search
          user_id: userId || undefined
        });
        
        console.log('✅ Follow-up response received');
        console.log('📚 Citations:', conversationRes.citations?.length || 0);
        console.log('🆕 Used new sources:', conversationRes.used_new_sources);

        const assistantMessage: Message = {
          id: generateMessageId(),
          type: 'assistant',
          content: conversationRes.answer,
          timestamp: getUserTimestamp(),
          followUpQuestions: conversationRes.follow_up_questions,
          citations: conversationRes.citations, // Add structured citations
          uncertaintyNote: conversationRes.uncertainty_note,
          usedNewSources: conversationRes.used_new_sources,
          isFollowUp: true,
        };

        // Use current messages array (includes userMessage) instead of refetching
        const updatedUserMessage = { ...userMessage, status: 'sent' as const };
        const newMessages = [...currentMessages, updatedUserMessage, assistantMessage];
        
        updateActiveTab({
          messages: newMessages,
          isLoading: false
        });
        debouncedSaveConversation(newMessages, content, currentConversationId);
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
        id: generateMessageId(),
        type: 'assistant',
        content: intentMessages[intent] || 'Here\'s the comprehensive protocol:',
        timestamp: getUserTimestamp(),
        protocolData,
        searchMetadata,
        followUpQuestions: generateFollowUpQuestions(intent),
      };

      // Mark user message as sent and update the current tab
      const messagesWithStatus = [...currentMessages, { ...userMessage, status: 'sent' as const }];
      const newMessages = [...messagesWithStatus, assistantMessage];
      updateActiveTab({
        messages: newMessages,
        isLoading: false,
        title: protocolData.title
      });
      
      // Save conversation (debounced to prevent excessive API calls)
      debouncedSaveConversation(newMessages, content, currentConversationId);
    } catch (err: any) {
      // Mark user message as failed
      const activeTab = getActiveTab();
      const currentTabMessages = (activeTab?.type === 'chat' ? activeTab.messages : []) || [];
      const failedMessages = currentTabMessages.map(msg =>
        msg.id === userMessage.id ? { 
          ...msg, 
          status: 'failed' as const,
          error: err instanceof Error ? err.message : 'Failed to send message'
        } : msg
      );
      
      const assistantMessage: Message = {
        id: generateMessageId(),
        type: 'assistant',
        content: formatErrorMessage(err),
        timestamp: getUserTimestamp(),
      };
      
      // Update current tab with error message
      const newMessages = [...failedMessages, assistantMessage];
      updateActiveTab({
        messages: newMessages,
        isLoading: false
      });
      
      debouncedSaveConversation(newMessages, content, currentConversationId);
    }
  };

  // Retry failed message
  const handleRetryMessage = async (messageId: string) => {
    const activeTab = getActiveTab();
    if (!activeTab || activeTab.type !== 'chat') return;

    const failedMessage = activeTab.messages.find(msg => msg.id === messageId);
    if (!failedMessage || failedMessage.type !== 'user') return;

    // Update message status to retrying
    const updatedMessages = activeTab.messages.map(msg =>
      msg.id === messageId ? { ...msg, status: 'retrying' as const, retryCount: (msg.retryCount || 0) + 1 } : msg
    );
    updateActiveTab({ messages: updatedMessages });

    try {
      // Resend the message
      await handleSendMessage(failedMessage.content, true);
      
      // Mark as sent
      const finalMessages = (getActiveTab() as ConversationTab)?.messages.map(msg =>
        msg.id === messageId ? { ...msg, status: 'sent' as const, error: undefined } : msg
      );
      updateActiveTab({ messages: finalMessages });
    } catch (error) {
      // Mark as failed again
      const errorMessages = (getActiveTab() as ConversationTab)?.messages.map(msg =>
        msg.id === messageId ? { 
          ...msg, 
          status: 'failed' as const, 
          error: error instanceof Error ? error.message : 'Retry failed' 
        } : msg
      );
      updateActiveTab({ messages: errorMessages });
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
        id: generateMessageId(),
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
      if (targetTab && targetTab.type === 'chat' && userId) {
        const conversationMessages: ConversationMessage[] = newMessages.map(msg => ({
          id: msg.id,
          type: msg.type as 'user' | 'assistant',
          content: msg.content,
          timestamp: msg.timestamp,
          protocol_data: msg.protocolData || undefined,
          // Include conversation-specific fields for follow-up responses
          citations: msg.citations || undefined,
          follow_up_questions: msg.followUpQuestions || undefined,
          uncertainty_note: msg.uncertaintyNote || undefined,
          used_new_sources: msg.usedNewSources || undefined,
          is_follow_up: msg.isFollowUp || undefined,
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

        addToCache(targetTab.conversationId, newMessages);
      }
    } catch (err: any) {
      const assistantMessage: Message = {
        id: generateMessageId(),
        type: 'assistant',
        content: formatErrorMessage(err),
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

    // Clear any preview modes to return to normal chat
    setShowProtocolPreview(false);
    setPreviewProtocols([]);
    setPreviewUploadId(null);

    // Optional: Clear cache if it gets too large (keep last 20 conversations)
    if (conversationCache.current.size > 20) {
      const entries = Array.from(conversationCache.current.entries());
      conversationCache.current = new Map(entries.slice(-20));
    }
  }, []);

  const handleCloseAllTabs = useCallback(() => {
    setShowCloseAllDialog(true);
  }, []);

  const confirmCloseAllTabs = useCallback(() => {
    setShowCloseAllDialog(false);
    
    // No need to save - tabs are auto-saved on switch/close/message updates
    // Reset to a single empty tab
    const defaultTab: ConversationTab = {
      id: generateTabId(),
      title: 'New Protocol',
      type: 'chat',
      messages: [],
      conversationId: generateConversationId(),
      isLoading: false
    };
    
    setTabs([defaultTab]);
    setActiveTabId(defaultTab.id);
  }, []);

  const handleRecentSearch = useCallback(async (conversationId: string) => {
    if (!userId) return;

    // Check if conversation is already open in a tab
    const existingTab = tabs.find(tab => 
      tab.type === 'chat' && tab.conversationId === conversationId
    );
    
    if (existingTab) {
      console.log('✅ Conversation already open in tab, switching to it:', existingTab.id);
      setActiveTabId(existingTab.id);
      return;
    }

    // Save current tab before opening new one
    const currentTab = getActiveTab();
    if (currentTab && currentTab.type === 'chat' && currentTab.messages.length > 0) {
      const lastUserMessage = [...currentTab.messages].reverse().find(m => m.type === 'user');
      if (lastUserMessage) {
        await saveCurrentConversation(currentTab.messages, lastUserMessage.content, currentTab.conversationId);
      }
    }

    // Create new tab for the recent search
    const newTabId = createNewTab('Loading...');

    // Clear any preview modes to return to normal chat
    setShowProtocolPreview(false);
    setPreviewProtocols([]);
    setPreviewUploadId(null);

    // Check if conversation is already cached - OPTIMIZATION: avoid redundant API calls
    const cachedMessages = conversationCache.current.get(conversationId);
    if (cachedMessages) {
      console.log('✅ Using cached conversation, no API call needed');
      // Load in new tab
      setTabs(prevTabs =>
        prevTabs.map(tab =>
          tab.id === newTabId
            ? {
                ...tab,
                messages: cachedMessages,
                conversationId: conversationId,
                title: cachedMessages[0]?.content.substring(0, 30) || 'Recent Search'
              }
            : tab
        )
      );
      return;
    }

    console.log('🔄 [API CALL] Fetching conversation from server (not in cache)...');

    // Set loading state for new tab
    setTabs(prevTabs =>
      prevTabs.map(tab =>
        tab.id === newTabId ? { ...tab, isLoading: true } : tab
      )
    );

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
          // Restore conversation-specific fields for follow-up responses
          citations: msg.citations,
          followUpQuestions: msg.follow_up_questions,
          uncertaintyNote: msg.uncertainty_note,
          usedNewSources: msg.used_new_sources,
          isFollowUp: msg.is_follow_up,
        }));

        // Cache the loaded conversation with LRU eviction
        addToCache(conversationId, loadedMessages);
        // Update new tab with loaded messages
        setTabs(prevTabs =>
          prevTabs.map(tab =>
            tab.id === newTabId
              ? {
                  ...tab,
                  messages: loadedMessages,
                  conversationId: conversationId,
                  title: conv.title || 'Recent Search',
                  isLoading: false
                }
              : tab
          )
        );
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
      setTabs(prevTabs =>
        prevTabs.map(tab =>
          tab.id === newTabId ? { ...tab, isLoading: false } : tab
        )
      );
    }
  }, [userId, tabs]);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleProtocolUpdate = useCallback((updatedProtocol: ProtocolData) => {
    // CRITICAL: Save scroll position BEFORE any changes
    const chatContainer = document.querySelector('[data-chat-container]') as HTMLElement;
    const savedScrollPosition = chatContainer ? chatContainer.scrollTop : 0;
    
    // Store in ref so useChatScroll can access it
    savedScrollPositionRef.current = savedScrollPosition;
    
    // Disable auto-scroll during protocol update
    if (chatContainer) {
      (chatContainer as any).__disableAutoScroll = true;
    }
    
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
    
    // Update the tab - this will cause re-render
    updateActiveTab({ messages: updatedMessages });
    
    // CRITICAL: Clear saved position after a short delay to free scroll
    setTimeout(() => {
      savedScrollPositionRef.current = 0;
      if (chatContainer) {
        (chatContainer as any).__disableAutoScroll = false;
      }
    }, 1500); // 1.5 seconds to ensure step thread response is complete
    
    // Debounce conversation save to prevent too many updates
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      const lastUserMessage = [...updatedMessages].reverse().find(m => m.type === 'user');
      if (lastUserMessage && currentUser) {
        saveCurrentConversation(updatedMessages, lastUserMessage.content, currentConversationId);
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
    console.log(`🗑️ [APP] Conversation deleted: ${conversationId}`);

    // CRITICAL: Mark conversation as deleted to prevent auto-save resurrection
    deletedConversations.current.add(conversationId);
    console.log(`✅ Added to deleted set. Deleted conversations:`, Array.from(deletedConversations.current));

    // Clear any pending auto-save for this conversation
    if (debouncedSaveRef.current) {
      console.log(`🚫 Clearing pending auto-save timer`);
      clearTimeout(debouncedSaveRef.current);
      debouncedSaveRef.current = null;
    }

    // Remove deleted conversation from cache
    conversationCache.current.delete(conversationId);
    console.log(`✅ Removed from conversation cache`);

    // If currently viewing the deleted conversation, close the tab
    if (currentConversationId === conversationId) {
      console.log(`🚪 Closing active tab for deleted conversation`);
      closeTab(activeTabId);
    }
  }, [currentConversationId, activeTabId]);

  const handleSavedProtocol = useCallback(async (protocolId: string, protocolData: any) => {
    console.log('🎯 [APP] handleSavedProtocol called', { protocolId, hasProtocolData: !!protocolData });
    
    // Save current tab before opening new one
    const currentTab = getActiveTab();
    if (currentTab && currentTab.type === 'chat' && currentTab.messages.length > 0 && userId) {
      const lastUserMessage = [...currentTab.messages].reverse().find(m => m.type === 'user');
      if (lastUserMessage) {
        await saveCurrentConversation(currentTab.messages, lastUserMessage.content, currentTab.conversationId);
      }
    }

    // Create new tab for the saved protocol
    const newTabId = createNewTab('Loading...');
    
    // Set loading state for new tab
    setTabs(prevTabs =>
      prevTabs.map(tab =>
        tab.id === newTabId ? { ...tab, isLoading: true } : tab
      )
    );

    // Clear any preview modes to return to normal chat
    setShowProtocolPreview(false);
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
        id: generateMessageId(),
        type: 'assistant',
        content: contentTitle,
        timestamp: getUserTimestamp(),
        protocolData: fullProtocol || undefined,
      };

      setTabs(prevTabs =>
        prevTabs.map(tab =>
          tab.id === newTabId
            ? {
                ...tab,
                messages: [assistantMessage],
                title: fullProtocol?.title || 'Saved Protocol',
                isLoading: false
              }
            : tab
        )
      );
      
      // Don't trigger sidebar refresh for saved protocols - they're already in the sidebar
      // Only trigger refresh when protocols are saved/unsaved, not when loading them
    } catch (e) {
      console.error('Error loading saved protocol:', e);
      const assistantMessage: Message = {
        id: generateMessageId(),
        type: 'assistant',
        content: formatErrorMessage(e),
        timestamp: getUserTimestamp(),
      };
      setTabs(prevTabs =>
        prevTabs.map(tab =>
          tab.id === newTabId
            ? {
                ...tab,
                messages: [assistantMessage],
                title: 'Error',
                isLoading: false
              }
            : tab
        )
      );
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
  const handleShowUserProtocolsIndex = useCallback(async (keepProfileOpen = false) => {
    try {
      if (!currentUser) {
        console.log('❌ No current user for protocol index');
        return;
      }

      console.log('🚀 Creating protocol index tab');

      // Check if a protocol index tab already exists
      const existingIndexTab = tabs.find(tab => tab.type === 'protocol-index');

      if (existingIndexTab) {
        // Switch to existing tab
        setActiveTabId(existingIndexTab.id);
        console.log('✅ Switched to existing protocol index tab');
      } else {
        // Create new protocol index tab
        const newIndexTab: ProtocolIndexTab = {
          id: generateTabId(),
          title: 'Your Protocol Index',
          type: 'protocol-index',
          protocols: userIndexProtocols, // Use existing cached data if available
          isLoading: userIndexProtocols.length === 0 // Only loading if no cached data
        };

        setTabs(prevTabs => [...prevTabs, newIndexTab]);
        setActiveTabId(newIndexTab.id);
        console.log('✅ Created new protocol index tab');
      }

      // Clear other views
      setShowProtocolPreview(false);

      console.log('✅ Protocol index tab created/switched, checking if data refresh needed...');

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

        // Update the protocol index tab with the loaded data
        setTabs(prevTabs =>
          prevTabs.map(tab =>
            tab.type === 'protocol-index'
              ? { ...tab, protocols: response.protocols, isLoading: false } as ProtocolIndexTab
              : tab
          )
        );

        console.log('✅ BACKGROUND: Protocols data loaded and tab updated');
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

    // If called from profile modal, maintain the modal state
    if (keepProfileOpen) {
      setIsProfileOpen(true);
      setActiveProfileTab('protocols');
    }
  }, [currentUser, addToastNotification, tabs, userIndexProtocols, setTabs, setActiveTabId]);

  // Generated protocols handler
  const handleShowGeneratedProtocols = useCallback(async (uploadId: string, protocols: any[], keepProfileOpen = false) => {
    // Fetch preview to get status
    let protocolStatus = 'completed';
    if (currentUser) {
      try {
        const preview = await getUploadPreview(currentUser.uid, uploadId);
        protocolStatus = preview.status || 'completed';
      } catch (error) {
        console.error('Failed to get preview status:', error);
      }
    }

    // Check if a generated protocols tab already exists
    const existingProtocolTab = tabs.find(tab => tab.type === 'generated-protocols');

    if (existingProtocolTab) {
      // Update existing tab with new protocols and status
      setTabs(prevTabs =>
        prevTabs.map(tab =>
          tab.type === 'generated-protocols'
            ? { ...tab, protocols, status: protocolStatus, isLoading: false } as ProtocolTab
            : tab
        )
      );
      // Only switch to the tab if NOT keeping profile open (user wants to stay in upload modal)
      if (!keepProfileOpen) {
        setActiveTabId(existingProtocolTab.id);
      }
    } else {
      // Create new protocol tab with status
      const newProtocolTab: ProtocolTab = {
        id: generateTabId(),
        title: 'Generated Protocols',
        type: 'generated-protocols',
        protocols,
        status: protocolStatus,
        isLoading: false
      };

      setTabs(prevTabs => [...prevTabs, newProtocolTab]);
      // Only switch to the tab if NOT keeping profile open (user wants to stay in upload modal)
      if (!keepProfileOpen) {
        setActiveTabId(newProtocolTab.id);
      }
    }

    // Store for approval functionality
    setGeneratedProtocols(protocols);
    setGeneratedUploadId(uploadId);

    // Clear other views
    setShowProtocolPreview(false);

    // If called from profile modal, maintain the modal state
    if (keepProfileOpen) {
      setIsProfileOpen(true);
      setActiveProfileTab('protocols');
    }
  }, [tabs]);

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
    // No longer using showGeneratedProtocols state
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

      // Close the protocol tab and clear state
      const protocolTab = tabs.find(tab => tab.type === 'generated-protocols');
      if (protocolTab) {
        closeTab(protocolTab.id);
      }
      setGeneratedProtocols([]);
      setGeneratedUploadId(null);

      // Show success toast notification
      addToastNotification({
        type: 'success',
        title: 'Protocols Approved',
        message: 'Protocols approved successfully! Indexing in progress...'
      });

      // Trigger sidebar refresh for saved protocols
      setSavedProtocolsRefreshTrigger(prev => prev + 1);

      // Refresh user uploaded protocols after a short delay to allow indexing to complete
      setTimeout(async () => {
        try {
          console.log('🔄 Refreshing user protocols after indexing...');
          const response = await getUserUploadedProtocols(currentUser.uid, 20);
          if (response.success && response.protocols) {
            console.log('✅ User protocols refreshed:', response.protocols.length, 'protocols');
            setUserIndexProtocols(response.protocols);

            // Clear the cache so sidebar shows updated count
            if (clearProtocolCacheRef.current) {
              clearProtocolCacheRef.current();
            }

            addToastNotification({
              type: 'success',
              title: 'Protocols Indexed',
              message: `${response.protocols.length} protocols have been added to your index!`
            });
          }
        } catch (refreshError) {
          console.error('❌ Failed to refresh user protocols:', refreshError);
        }
      }, 2000); // Wait 2 seconds for indexing to complete

    } catch (error) {
      console.error('❌ Failed to approve protocols:', error);
      const errorMessage: Message = {
        id: Date.now().toString(),
        type: 'assistant',
        content: 'Failed to approve protocols. Please try again.',
        timestamp: getUserTimestamp(),
      };
      updateActiveTab({ messages: [errorMessage] });
    }
  }, [currentUser, generatedUploadId, addToastNotification, tabs, closeTab]);

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

              // Update the protocol tab with new protocols
              const protocolTab = tabs.find(tab => tab.type === 'generated-protocols');
              if (protocolTab) {
                setTabs(prevTabs =>
                  prevTabs.map(tab =>
                    tab.type === 'generated-protocols'
                      ? { ...tab, protocols: preview.protocols, isLoading: false } as ProtocolTab
                      : tab
                  )
                );
              }

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
  }, [currentUser, generatedUploadId, addToastNotification, tabs, setTabs]);

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
      updateActiveTab({ messages: [successMessage] });

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
      setGeneratedProtocols(notification.protocols);
      setGeneratedUploadId(notification.uploadId);
    }

    // Auto-remove notification after 10 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== newNotification.id));
    }, 10000);
  }, [userId, setGeneratedProtocols, setGeneratedUploadId]);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const handleNotificationClick = useCallback((notification: typeof notifications[0]) => {
    if (notification.type === 'upload_ready' && notification.uploadId && notification.protocols) {
      // Show generated protocols directly when user clicks "View Protocols"
      handleShowGeneratedProtocols(notification.uploadId, notification.protocols);
      removeNotification(notification.id);
    }
  }, [handleShowGeneratedProtocols, removeNotification]);

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

      // Clear deleted conversations tracking on logout
      deletedConversations.current.clear();
      console.log(`🧹 Cleared deleted conversations tracking on logout`);

      // Clear any pending auto-save timers
      if (debouncedSaveRef.current) {
        clearTimeout(debouncedSaveRef.current);
        debouncedSaveRef.current = null;
      }

      // Reset tabs to default state after logout
      const defaultTabId = generateTabId();
      setTabs([{
        id: defaultTabId,
        title: 'New Protocol',
        type: 'chat' as const,
        messages: [],
        conversationId: generateConversationId(),
        isLoading: false
      }]);

      // Reset active tab to the new default tab
      setActiveTabId(defaultTabId);

      // No need to clear generated protocols - they're now user-specific!

      setShowLogoutModal(false);
    } catch (error) {
      console.error('Failed to log out:', error);
      setErrorMessage('Failed to log out. Please try again.');
      setShowErrorDialog(true);
    }
  };

  const handleConfirmDeleteAccount = async () => {
    if (!currentUser) return;

    const passwordInput = document.getElementById('deletePasswordInput') as HTMLInputElement;
    const password = passwordInput?.value || '';

    try {
      // Re-authenticate user before deletion
      // Check if user signed in with Google
      const isGoogleUser = currentUser.providerData.some(
        provider => provider.providerId === 'google.com'
      );

      if (isGoogleUser) {
        // Re-authenticate with Google popup
        const provider = new GoogleAuthProvider();
        await reauthenticateWithPopup(currentUser, provider);
      } else {
        // Re-authenticate with email/password
        if (!password) {
          setDeleteConfirmError('Please enter your password to confirm deletion.');
          return;
        }

        if (!currentUser.email) {
          setDeleteConfirmError('Could not verify your email address.');
          return;
        }

        const credential = EmailAuthProvider.credential(currentUser.email, password);
        await reauthenticateWithCredential(currentUser, credential);
      }

      // First delete user's uploaded protocols from Elasticsearch
      try {
        await deleteAllUserProtocols(currentUser.uid);
      } catch (protocolError) {
        console.warn('Failed to delete Elasticsearch protocols:', protocolError);
      }

      // Then delete user data from Firestore backend (conversations and saved protocols)
      await deleteUserData(currentUser.uid);

      // Finally delete Firebase Auth user account
      await deleteUser(currentUser);

      // Clear all local state and storage
      localStorage.clear();
      sessionStorage.clear();

      // Reset tabs to default state
      const defaultTabId = generateTabId();
      setTabs([{
        id: defaultTabId,
        title: 'New Protocol',
        type: 'chat' as const,
        messages: [],
        conversationId: generateConversationId(),
        isLoading: false
      }]);
      setActiveTabId(defaultTabId);

      // Clear ALL user-specific protocol state
      setUserIndexProtocolsByUser({});
      setGeneratedProtocolsByUser({});
      setGeneratedUploadIdByUser({});

      // Clear any other user-related state
      setNotifications([]);
      setShowProtocolPreview(false);
      setPreviewProtocols([]);
      setPreviewUploadId(null);

      setShowDeleteModal(false);

      // Redirect to landing page
      navigate('/');
    } catch (error: any) {
      console.error('Failed to delete account:', error);

      // Clear the delete modal state
      setShowDeleteModal(false);

      if (error.code === 'auth/wrong-password') {
        setDeleteConfirmError('Incorrect password. Please try again.');
        setShowDeleteModal(true); // Keep modal open for retry
      } else if (error.code === 'auth/requires-recent-login') {
        setErrorMessage('For security reasons, please log out and log back in before deleting your account.');
        setShowErrorDialog(true);
      } else if (error.code === 'auth/popup-closed-by-user') {
        setDeleteConfirmError('Google sign-in was cancelled. Please try again.');
        setShowDeleteModal(true); // Keep modal open for retry
      } else if (error.code === 'auth/invalid-credential') {
        setDeleteConfirmError('Invalid password. Please check your password and try again.');
        setShowDeleteModal(true); // Keep modal open for retry
      } else if (error.code === 'auth/too-many-requests') {
        setErrorMessage('Too many failed attempts. Please try again later or reset your password.');
        setShowErrorDialog(true);
      } else {
        setErrorMessage(`Failed to delete account: ${error.message || 'Unknown error'}. Please try again.`);
        setShowErrorDialog(true);
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
          await saveCurrentConversation(currentMessages, lastUserMessage.content, currentConversationId);
        }
      }
      
      // Create new tab - this will switch activeTabId
      const newTabId = createNewTab(content.substring(0, 30) + '...');
      
      // Send message in the NEW tab by directly updating it
      // We need to use setTabs to ensure we're working with the new tab
      const userMessage: Message = {
        id: generateMessageId(),
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
      {/* Network Status Banner */}
      <NetworkStatusBanner />
      
      {/* Overlay - only show when sidebar is open on mobile */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      
      {/* Sidebar - always mounted, visibility controlled by CSS */}
      <div className={`fixed lg:relative lg:translate-x-0 inset-y-0 left-0 z-50 lg:z-auto transition-all duration-300 ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      } ${
        isSidebarCollapsed ? 'lg:w-16' : 'lg:w-80'
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
          // Profile modal state and handlers
          isProfileOpen={isProfileOpen}
          activeProfileTab={activeProfileTab}
          onOpenProfile={handleOpenProfile}
          onCloseProfile={handleCloseProfile}
          onSetActiveProfileTab={handleSetActiveProfileTab}
          // Upload state props for persistence
          isUploading={isUploading}
          setIsUploading={setIsUploading}
          uploadProgress={uploadProgress}
          setUploadProgress={setUploadProgress}
          uploadCancelled={uploadCancelled}
          setUploadCancelled={setUploadCancelled}
          currentUploadId={currentUploadId}
          setCurrentUploadId={setCurrentUploadId}
          showUploadModal={showUploadModal}
          setShowUploadModal={setShowUploadModal}
          userIndexProtocols={userIndexProtocols}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={handleToggleSidebarCollapse}
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
          onCloseAll={handleCloseAllTabs}
        />

        {activeTab?.type === 'chat' ? (
          <ChatContainer
            messages={messages}
            isLoading={isLoading}
            savedScrollPosition={savedScrollPositionRef.current}
            onSaveToggle={handleSaveToggle}
            onProtocolUpdate={handleProtocolUpdate}
            onFollowUpClick={handleFollowUpClick}
            onRetryMessage={handleRetryMessage}
            isSavedProtocolMessage={isSavedProtocolMessage}
          />
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 relative" key={`content-${activeTabId}`}>
          {/* User Protocol Index View - REMOVED - Now using tab system */}
          {false && (
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

          {/* Tab Content Area */}
          {activeTab?.type === 'generated-protocols' && (
            <div className="max-w-4xl mx-auto">
              {/* Header */}
              <div className="bg-white rounded-lg shadow-lg border border-slate-200 mb-6">
                <div className="p-6 border-b border-slate-200">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h1 className="text-2xl font-bold text-slate-900">
                        {activeTab.status === 'cancelled'
                          ? '🚫 Upload Cancelled'
                          : activeTab.protocols.length === 0
                            ? 'ℹ️ No Protocols Found'
                            : 'Generated Protocols'
                        }
                      </h1>
                      <p className="text-slate-600">
                        {activeTab.status === 'cancelled'
                          ? 'Protocol generation was cancelled. No protocols were generated.'
                          : activeTab.protocols.length === 0
                            ? 'No relevant medical protocols were found in the uploaded documents.'
                            : `${activeTab.protocols.length} protocols generated from your upload. Review and approve to add to your index.`
                        }
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons - Only show if protocols were generated */}
                  {activeTab.protocols.length > 0 && (
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
                        Approve & Add to Index ({activeTab.protocols.length} protocols)
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
                      <button
                        onClick={async () => {
                          console.log('🗑️ Clear Generated Protocols clicked');

                          try {
                            // Call backend to delete preview file if we have an upload ID
                            if (currentUser && generatedUploadId) {
                              console.log(`📡 Calling delete upload preview API for upload ID: ${generatedUploadId}`);
                              await deleteUploadPreview(currentUser.uid, generatedUploadId);
                              console.log('✅ Preview file deleted from backend');
                            }
                          } catch (error) {
                            console.error('⚠️ Failed to delete preview file from backend:', error);
                            // Continue with frontend cleanup even if backend call fails
                          }

                          // Clear the generated protocols from state (no confirmation needed - they're temporary)
                          setGeneratedProtocols([]);
                          setGeneratedUploadId(null);

                          // Close the generated protocols tab and go back to default
                          const newTabs = tabs.filter(tab => tab.type !== 'generated-protocols');
                          setTabs(newTabs);

                          // Switch to the first available tab
                          if (newTabs.length > 0) {
                            setActiveTabId(newTabs[0].id);
                          }

                          console.log('✅ Generated protocols cleared and tab closed');
                        }}
                        disabled={!currentUser || generatedProtocols.length === 0}
                        className={`px-6 py-2 rounded-lg font-medium ${
                          currentUser && generatedProtocols.length > 0
                            ? 'bg-red-600 hover:bg-red-700 text-white'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        Clear All
                      </button>
                    </div>
                  )}
                </div>

                {/* Protocols List */}
                <div className="p-6">
                  {activeTab.protocols.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      No protocols data available
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {activeTab.protocols.map((protocol: any, index: number) => {
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

          {/* Protocol Index Tab Content */}
          {activeTab?.type === 'protocol-index' && (
            <div className="max-w-4xl mx-auto">
              {/* Header */}
              <div className="bg-white rounded-lg shadow-lg border border-slate-200 mb-6">
                <div className="p-6 border-b border-slate-200">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h1 className="text-2xl font-bold text-slate-900">Your Protocol Index</h1>
                      <p className="text-slate-600">
                        {activeTab.protocols.length} protocols uploaded from your documents
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          showConfirmation({
                            title: 'Delete All Protocols',
                            message: `Are you sure you want to delete all ${activeTab.protocols.length} protocols from your index? This action cannot be undone and will permanently remove all your uploaded protocols.`,
                            confirmText: `Delete All ${activeTab.protocols.length} Protocols`,
                            confirmAction: async () => {
                              try {
                                if (!currentUser) return;

                                const response = await deleteAllUserProtocols(currentUser.uid);
                                if (response.success) {
                                  setUserIndexProtocols([]);

                                  // Update the tab
                                  setTabs(prevTabs =>
                                    prevTabs.map(tab =>
                                      tab.type === 'protocol-index'
                                        ? { ...tab, protocols: [] } as ProtocolIndexTab
                                        : tab
                                    )
                                  );

                                  addToastNotification({
                                    type: 'success',
                                    title: 'All Protocols Deleted',
                                    message: 'All protocols have been successfully removed from your index'
                                  });

                                  // Close the tab since there are no protocols left
                                  const protocolTab = tabs.find(tab => tab.type === 'protocol-index');
                                  if (protocolTab) {
                                    closeTab(protocolTab.id);
                                  }

                                } else {
                                  throw new Error(response.message || 'Failed to delete protocols');
                                }
                              } catch (error) {
                                console.error('❌ Error deleting all protocols:', error);
                                addToastNotification({
                                  type: 'error',
                                  title: 'Delete Failed',
                                  message: error instanceof Error ? error.message : 'Failed to delete protocols'
                                });
                              }
                            },
                            dangerous: true
                          });
                        }}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        Delete All
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Protocols List */}
                <div className="p-6">
                  {activeTab.isLoading ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mx-auto mb-4"></div>
                      <p className="text-slate-600">Loading your protocols...</p>
                    </div>
                  ) : activeTab.protocols.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      No protocols uploaded yet. Upload documents to generate protocols.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {activeTab.protocols.map((protocol: any, index: number) => (
                        <div key={`index-${index}`} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                                {protocol.title || protocol.name || `Protocol ${index + 1}`}
                              </h3>
                              <div className="text-sm text-slate-600 space-y-1">
                                <p><strong>Steps:</strong> {protocol.steps_count || 0}</p>
                                <p><strong>Citations:</strong> {protocol.citations_count || 0}</p>
                                <p><strong>Source:</strong> {protocol.source_file || 'Unknown'}</p>
                                <p><strong>Organization:</strong> {protocol.organization || 'Unknown'}</p>
                                <p><strong>Region:</strong> {protocol.region || 'Unknown'}</p>
                                <p><strong>Year:</strong> {protocol.year || 'Unknown'}</p>
                              </div>

                              {/* Protocol Steps Display */}
                              {(() => {
                                // Try multiple ways to get steps data
                                let protocolSteps = protocol.protocol_data?.step_details ||
                                                  protocol.protocol_data?.steps ||
                                                  protocol.protocol_data?.checklist ||
                                                  protocol.protocol_data?.procedures ||
                                                  protocol.protocol_data?.instructions ||
                                                  protocol.steps ||
                                                  protocol.checklist ||
                                                  [];

                                // If still no steps, try to parse JSON if it's a string
                                if (!protocolSteps || protocolSteps.length === 0) {
                                  if (typeof protocol.protocol_data === 'string') {
                                    try {
                                      const parsed = JSON.parse(protocol.protocol_data);
                                      protocolSteps = parsed.step_details || parsed.steps || parsed.checklist || parsed.procedures || [];
                                    } catch (e) {
                                      // Silently handle JSON parsing errors
                                    }
                                  }
                                }

                                return protocolSteps && protocolSteps.length > 0 ? (
                                  <div className="mt-4 border-t border-slate-200 pt-4">
                                    <h4 className="font-medium text-slate-700 mb-2">Protocol Steps:</h4>
                                    <div className="space-y-2 max-h-40 overflow-y-auto">
                                      {protocolSteps.slice(0, 5).map((step: any, stepIndex: number) => {
                                        // Try different step text fields
                                        const stepText = step.step ||
                                                       step.text ||
                                                       step.description ||
                                                       step.title ||
                                                       step.content ||
                                                       step.action ||
                                                       (typeof step === 'string' ? step : 'Protocol step');

                                        return (
                                          <div key={stepIndex} className="text-sm bg-slate-50 p-2 rounded border-l-2 border-teal-200">
                                            <div className="font-medium text-slate-800">
                                              {stepIndex + 1}. {stepText}
                                            </div>
                                            {step.explanation && (
                                              <div className="text-slate-600 mt-1 text-xs">
                                                {step.explanation}
                                              </div>
                                            )}
                                            {step.details && (
                                              <div className="text-slate-600 mt-1 text-xs">
                                                {step.details}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                      {protocolSteps.length > 5 && (
                                        <div className="text-xs text-slate-500 italic">
                                          ... and {protocolSteps.length - 5} more steps
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="mt-4 border-t border-slate-200 pt-4">
                                    <div className="text-sm text-slate-500 italic">
                                      No detailed steps available for this protocol
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                            <button
                              className="text-slate-400 hover:text-red-600 p-1 hover:bg-red-50 rounded"
                              onClick={async () => {
                                try {
                                  if (!currentUser) return;

                                  // Show confirmation dialog
                                  const confirmed = window.confirm(`Are you sure you want to delete "${protocol.title}"?`);
                                  if (!confirmed) return;

                                  // Use the existing deleteUserProtocol API function
                                  await deleteUserProtocol(currentUser.uid, protocol.id);

                                  // Remove from local state
                                  setUserIndexProtocols(prev => prev.filter(p => p.id !== protocol.id));

                                  // Update the protocol index tab
                                  setTabs(prevTabs =>
                                    prevTabs.map(tab =>
                                      tab.type === 'protocol-index'
                                        ? { ...tab, protocols: tab.protocols.filter((p: any) => p.id !== protocol.id) } as ProtocolIndexTab
                                        : tab
                                    )
                                  );

                                  // Clear sidebar cache to refresh protocol counts
                                  if (clearProtocolCacheRef.current) {
                                    clearProtocolCacheRef.current();
                                  }

                                  addToastNotification({
                                    type: 'success',
                                    title: 'Protocol Deleted',
                                    message: `"${protocol.title}" has been successfully deleted`
                                  });

                                } catch (error) {
                                  console.error('❌ Error deleting protocol:', error);
                                  addToastNotification({
                                    type: 'error',
                                    title: 'Delete Failed',
                                    message: 'Failed to delete the protocol. Please try again.'
                                  });
                                }
                              }}
                              title="Delete this protocol"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      ))}
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


          </div>
        )}
        
        {/* Notification Panel - outside chat container */}
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
        
        {!showProtocolPreview && activeTab?.type === 'chat' && (
          <ChatInput
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
            hasMessages={messages.length > 0}
            isInConversation={!!getCurrentProtocol()}
            currentProtocolTitle={getCurrentProtocol()?.title}
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
            <div className="space-y-4 mb-4">
              {/* Password input for email/password users */}
              {currentUser && !currentUser.providerData.some(p => p.providerId === 'google.com') && (
                <div>
                  <p className="text-sm text-slate-700 mb-2">Enter your password to confirm:</p>
                  <input
                    type="password"
                    placeholder="Your password"
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                      deleteConfirmError
                        ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                        : 'border-slate-300 focus:ring-red-500 focus:border-red-500'
                    }`}
                    id="deletePasswordInput"
                    onChange={() => setDeleteConfirmError('')}
                  />
                </div>
              )}

              {/* Google users message */}
              {currentUser && currentUser.providerData.some(p => p.providerId === 'google.com') && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">
                    You'll be asked to sign in with Google to confirm this action.
                  </p>
                </div>
              )}

              {/* DELETE confirmation text */}
              <div>
                <p className="text-sm text-slate-700 mb-2">Type <span className="font-semibold">DELETE</span> to confirm:</p>
                <input
                  type="text"
                  placeholder="Type DELETE here"
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                    deleteConfirmError
                      ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                      : 'border-slate-300 focus:ring-red-500 focus:border-red-500'
                  }`}
                  id="deleteConfirmInput"
                  onChange={() => setDeleteConfirmError('')}
                />
              </div>

              {deleteConfirmError && (
                <p className="text-sm text-red-600">{deleteConfirmError}</p>
              )}
            </div>
            <div className="flex space-x-3 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmError('');
                }}
                className="px-4 py-2"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  const input = document.getElementById('deleteConfirmInput') as HTMLInputElement;
                  if (input?.value === 'DELETE') {
                    setDeleteConfirmError('');
                    handleConfirmDeleteAccount();
                  } else {
                    setDeleteConfirmError('Please type DELETE to confirm account deletion.');
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

      {/* Close All Tabs Confirmation Dialog */}
      <AlertDialog open={showCloseAllDialog} onOpenChange={setShowCloseAllDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close All Tabs?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to close all tabs? All conversations will be saved automatically before closing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCloseAllTabs} className="bg-red-600 hover:bg-red-700">
              Close All Tabs
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Error Dialog */}
      <AlertDialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Error</AlertDialogTitle>
            <AlertDialogDescription>
              {errorMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowErrorDialog(false)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
