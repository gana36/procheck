import { useState, useEffect, memo, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Stethoscope,
  Search,
  Star,
  Clock,
  MapPin,
  Calendar,
  User,
  Plus,
  Loader2,
  MoreVertical,
  Trash2,
  Edit2,
  LogOut,
  UserX,
  Upload,
  FileText,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
// import { mockSavedProtocols } from '@/data/mockData';
import { useAuth } from '@/contexts/AuthContext';
import { getUserConversations, getSavedProtocols, getSavedProtocol, deleteConversation, updateConversationTitle, deleteSavedProtocol, updateSavedProtocolTitle, uploadDocuments, getUploadStatus, getUserUploadedProtocols, regenerateProtocol, deleteUserProtocol, updateUserProtocolTitle, getUploadPreview, cancelUpload, deleteUploadPreview, ConversationListItem, SavedProtocol as ApiSavedProtocol } from '@/lib/api';
import { updateProfile } from 'firebase/auth';

interface SidebarProps {
  onNewSearch: () => void;
  onRecentSearch: (conversationId: string) => void;
  onSavedProtocol: (protocolId: string, protocolData: any) => void;
  onConversationDeleted?: (conversationId: string) => void; // Notify parent when conversation is deleted
  onSavedProtocolDeleted?: (protocolId: string, protocolTitle: string) => void; // Notify parent when saved protocol is deleted
  
  // LIVE UPDATE CALLBACKS (No API reloads)
  onConversationSaved?: (conversation: ConversationListItem) => void; // New conversation created
  onConversationUpdated?: (conversationId: string, updates: Partial<ConversationListItem>) => void; // Conversation updated
  onProtocolBookmarked?: (protocol: any) => void; // Protocol saved/bookmarked
  
  savedProtocolsRefreshTrigger?: number;
  onShowLogoutModal?: () => void;
  onShowDeleteModal?: () => void;
  onShowProtocolPreview?: (uploadId: string, protocols: any[]) => void; // Show preview in main content area
  onShowUserProtocolsIndex?: (keepProfileOpen?: boolean) => void; // Show user's protocol index in main content area
  onShowGeneratedProtocols?: (uploadId: string, protocols: any[], keepProfileOpen?: boolean) => void; // Show generated protocols view
  generatedProtocols?: any[]; // Currently generated protocols
  generatedUploadId?: string | null; // Upload ID for generated protocols
  onNotifyUploadReady?: (notification: {
    type: 'upload_ready' | 'query_ready';
    title: string;
    message: string;
    uploadId?: string;
    protocols?: any[];
  }) => void; // Send notification for upload completion
  onShowConfirmation?: (data: {
    title: string;
    message: string;
    confirmText: string;
    confirmAction: () => void;
    dangerous?: boolean;
  }) => void; // Show custom confirmation modal
  onClearProtocolCache?: (clearCacheFunction: () => void) => void; // Register cache clearing function

  // Profile modal state and handlers (moved from local state)
  isProfileOpen: boolean;
  activeProfileTab: 'profile' | 'protocols';
  onOpenProfile: () => void;
  onCloseProfile: () => void;
  onSetActiveProfileTab: (tab: 'profile' | 'protocols') => void;

  // Upload state props for persistence across navigation
  isUploading: boolean;
  setIsUploading: (value: boolean) => void;
  uploadProgress: {
    status: string;
    filename?: string;
    upload_id?: string;
    progress?: number;
    protocols_extracted?: number;
    protocols_indexed?: number;
    error?: string;
  } | null;
  setUploadProgress: (value: {
    status: string;
    filename?: string;
    upload_id?: string;
    progress?: number;
    protocols_extracted?: number;
    protocols_indexed?: number;
    error?: string;
  } | null) => void;
  uploadCancelled: boolean;
  setUploadCancelled: (value: boolean) => void;
  currentUploadId: string | null;
  setCurrentUploadId: (value: string | null) => void;

  // Upload modal state for persistence across navigation
  showUploadModal: boolean;
  setShowUploadModal: (value: boolean) => void;

  // User index protocols data from parent (single source of truth)
  userIndexProtocols: any[];

  // Sidebar collapse/expand state
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

// Global cache to persist data completely outside React
const globalDataCache = {
  userId: null as string | null,
  conversations: [] as ConversationListItem[],
  protocols: [] as ApiSavedProtocol[],
  isLoading: false
};

// Helper functions for local storage caching (outside component to avoid recreation)
const getCacheKey = (userId: string) => `user_protocols_${userId}`;

const getCachedProtocols = (userId: string) => {
  try {
    const cached = localStorage.getItem(getCacheKey(userId));
    if (cached) {
      const { data, expires } = JSON.parse(cached);
      if (Date.now() < expires) {
        
        return data;
      } else {
        console.log('⏰ Cache expired, will fetch fresh data');
        localStorage.removeItem(getCacheKey(userId));
      }
    }
  } catch (error) {
    console.error('❌ Error reading cached protocols:', error);
    localStorage.removeItem(getCacheKey(userId));
  }
  return null;
};

const cacheProtocols = (userId: string, protocols: any[]) => {
  try {
    const cacheData = {
      data: protocols,
      timestamp: Date.now(),
      expires: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    };
    localStorage.setItem(getCacheKey(userId), JSON.stringify(cacheData));
    console.log(`💾 Cached ${protocols.length} user protocols`);
  } catch (error) {
    console.error('❌ Error caching protocols:', error);
  }
};

const clearProtocolCache = (userId: string) => {
  try {
    localStorage.removeItem(getCacheKey(userId));
    console.log('🗑️ Cleared user protocol cache');
  } catch (error) {
    console.error('❌ Error clearing protocol cache:', error);
  }
};

const Sidebar = memo(function Sidebar({ onNewSearch, onRecentSearch, onSavedProtocol, onConversationDeleted, onSavedProtocolDeleted, onConversationSaved, onConversationUpdated, onProtocolBookmarked, savedProtocolsRefreshTrigger, onShowLogoutModal, onShowDeleteModal, onShowUserProtocolsIndex, onShowGeneratedProtocols, generatedProtocols = [], generatedUploadId = null, onNotifyUploadReady, onShowConfirmation, onClearProtocolCache, isProfileOpen, activeProfileTab, onOpenProfile, onCloseProfile, onSetActiveProfileTab, isUploading, setIsUploading, uploadProgress, setUploadProgress, uploadCancelled, setUploadCancelled, currentUploadId, setCurrentUploadId, showUploadModal, setShowUploadModal, userIndexProtocols, isCollapsed, onToggleCollapse }: SidebarProps) {
  const { currentUser } = useAuth();
  
  // CRITICAL: Extract userId directly - this is stable because we'll control when effects run
  const userId = currentUser?.uid || null;
  
  // Initialize state from global cache
  const [recentConversations, setRecentConversations] = useState<ConversationListItem[]>(() => 
    globalDataCache.userId === userId ? globalDataCache.conversations : []
  );
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  
  const [savedProtocols, setSavedProtocols] = useState<ApiSavedProtocol[]>(() =>
    globalDataCache.userId === userId ? globalDataCache.protocols : []
  );
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  const [savedError, setSavedError] = useState<string | null>(null);

  // State for uploaded protocols (from Elasticsearch) - initialize from cache if available
  const [, setUploadedProtocols] = useState<any[]>(() => {
    if (userId) {
      const cached = getCachedProtocols(userId);
      if (cached) {
        console.log(`🚀 Initializing with ${cached.length} cached protocols`);
        return cached;
      }
    }
    return [];
  });
  const [isLoadingUploaded, setIsLoadingUploaded] = useState(false);
  const [uploadedError, setUploadedError] = useState<string | null>(null);

  // Track if data has been loaded to prevent redundant API calls
  // Using refs to avoid recreating callbacks when these change
  const conversationsLoadedRef = useRef(false);
  const savedProtocolsLoadedRef = useRef(false);
  const isLoadingConversationsRef = useRef(false);
  const isLoadingSavedRef = useRef(false);
  const skipNextLoadRef = useRef(false); // Skip next load after optimistic update

  // Track which conversation's menu is open and editing state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  // Track which protocol's menu is open and editing state
  const [openProtocolMenuId, setOpenProtocolMenuId] = useState<string | null>(null);
  const [editingProtocolId, setEditingProtocolId] = useState<string | null>(null);
  const [editProtocolTitle, setEditProtocolTitle] = useState('');

  // Generated protocols are now passed as props

  // Profile modal state - now passed as props from parent
  const [isRenaming, setIsRenaming] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState('');

  // Upload modal state - now comes from props for persistence
  // Upload state - now comes from props for persistence
  const [customPrompt, setCustomPrompt] = useState('');
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uploadAbortController = useRef<AbortController | null>(null);
  const uploadCancelledRef = useRef(false); // Track cancellation state immediately (not async like state)
  const uploadProgressRef = useRef(uploadProgress); // Track latest upload progress for polling closure

  // Keep refs synced with state to survive component re-renders and closure issues
  useEffect(() => {
    uploadCancelledRef.current = uploadCancelled;
    console.log('🔄 Syncing uploadCancelledRef with state:', uploadCancelled, 'ref is now:', uploadCancelledRef.current);
  }, [uploadCancelled]);

  useEffect(() => {
    uploadProgressRef.current = uploadProgress;
    console.log('🔄 Syncing uploadProgressRef, status is now:', uploadProgress?.status);
  }, [uploadProgress]);

  // Regeneration state
  const [regeneratingProtocolId, setRegeneratingProtocolId] = useState<string | null>(null);
  const [regenerationPrompt, setRegenerationPrompt] = useState('');
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [protocolToRegenerate, setProtocolToRegenerate] = useState<string | null>(null);


  // Combine saved protocols and uploaded protocols (using userIndexProtocols from parent)
  const userProtocols = [
    // Saved protocols (bookmarked from searches)
    ...savedProtocols.map(protocol => ({
      id: `saved_${protocol.id}`,
      title: protocol.title,
      created_at: protocol.saved_at,
      source: protocol.organization,
      protocol_count: protocol.protocol_data?.checklist?.length || 0,
      status: 'saved',
      type: 'SAVED',
      protocol_data: protocol.protocol_data
    })),
    // Uploaded protocols (from document processing) - now from parent prop
    ...userIndexProtocols.map(protocol => ({
      id: `uploaded_${protocol.id}`,
      title: protocol.title,
      created_at: protocol.created_at || new Date().toISOString(),
      source: protocol.source_file || protocol.organization,
      protocol_count: protocol.steps_count || 0,
      status: 'processed',
      type: 'YOUR',
      protocol_data: protocol.protocol_data
    }))
  ];

  // Get Google profile image URL
  const getProfileImageUrl = () => {
    if (!currentUser) return null;

    // First try to get from provider data (more reliable for Google Auth)
    const googleProvider = currentUser.providerData.find(provider => provider.providerId === 'google.com');
    if (googleProvider?.photoURL) {
      return googleProvider.photoURL;
    }

    // Fallback to user photoURL
    return currentUser.photoURL;
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (openMenuId) setOpenMenuId(null);
      if (openProtocolMenuId) setOpenProtocolMenuId(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [openMenuId, openProtocolMenuId]);

  const isMountedRef = useRef(true);

  // Track component mount status
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Create a function that the parent can call to clear cache
  const handleClearCache = useCallback(() => {
    if (userId) {
      clearProtocolCache(userId);
      // Also clear the component's local state
      setUploadedProtocols([]); // Clear uploaded protocols state to update count display
      setSavedProtocols([]); // Clear saved protocols as well
    }
  }, [userId]);

  // Expose the cache clearing function to parent component
  useEffect(() => {
    if (onClearProtocolCache) {
      onClearProtocolCache(handleClearCache);
    }
  }, [onClearProtocolCache, handleClearCache]);

  // LIVE UPDATE HANDLERS - Called by parent to update sidebar without API reload
  useEffect(() => {
    if (!onConversationSaved) return;
    
    // Expose function to parent that adds new conversation to sidebar
    const handleNewConversation = (conversation: ConversationListItem) => {
      console.log('📥 [LIVE UPDATE] New conversation added to sidebar:', conversation.id);
      
      // PERFORMANCE: Batch state updates using queueMicrotask to avoid layout thrashing
      queueMicrotask(() => {
        setRecentConversations(prev => {
          // Check if conversation already exists
          if (prev.find(c => c.id === conversation.id)) {
            console.log('⏭️ Conversation already in sidebar, skipping');
            return prev;
          }
          
          // Add to top of list (most recent)
          const updated = [conversation, ...prev];
          
          // Update global cache
          if (globalDataCache.userId === userId) {
            globalDataCache.conversations = updated;
          }
          
          return updated;
        });
      });
    };
    
    // Store function reference so parent can call it
    (window as any).__sidebarAddConversation = handleNewConversation;
    console.log('✅ Registered __sidebarAddConversation');
    
    return () => {
      delete (window as any).__sidebarAddConversation;
      console.log('🗑️ Unregistered __sidebarAddConversation');
    };
  }, [onConversationSaved, userId]);

  useEffect(() => {
    if (!onConversationUpdated) return;
    
    // Expose function to parent that updates existing conversation
    const handleUpdateConversation = (conversationId: string, updates: Partial<ConversationListItem>) => {
      console.log('🔄 [LIVE UPDATE] Conversation updated in sidebar:', conversationId, updates);
      
      setRecentConversations(prev => {
        const index = prev.findIndex(c => c.id === conversationId);
        if (index === -1) {
          console.log('⏭️ Conversation not in sidebar, skipping update');
          return prev;
        }
        
        // Update conversation and move to top
        const updated = [...prev];
        updated[index] = { ...updated[index], ...updates };
        
        // Move to top if it's not already there
        if (index !== 0) {
          const [movedConv] = updated.splice(index, 1);
          updated.unshift(movedConv);
          console.log(`✅ Moved conversation to top: ${conversationId}`);
        } else {
          console.log(`✅ Conversation already at top: ${conversationId}`);
        }
        
        // Update global cache
        if (globalDataCache.userId === userId) {
          globalDataCache.conversations = updated;
        }
        
        return updated;
      });
    };
    
    // Store function reference so parent can call it
    (window as any).__sidebarUpdateConversation = handleUpdateConversation;
    console.log('✅ Registered __sidebarUpdateConversation');
    
    return () => {
      delete (window as any).__sidebarUpdateConversation;
      console.log('🗑️ Unregistered __sidebarUpdateConversation');
    };
  }, [onConversationUpdated, userId]);

  useEffect(() => {
    if (!onProtocolBookmarked) return;
    
    // Expose function to parent that adds bookmarked protocol
    const handleProtocolBookmarked = (protocol: any) => {
      console.log('⭐ [LIVE UPDATE] Protocol bookmarked, added to sidebar:', protocol.id);
      
      setSavedProtocols(prev => {
        // Check if protocol already exists
        if (prev.find(p => p.id === protocol.id)) {
          console.log('⏭️ Protocol already in sidebar, skipping');
          return prev;
        }
        
        // Add to top of list
        const updated = [protocol, ...prev];
        
        // Update global cache
        if (globalDataCache.userId === userId) {
          globalDataCache.protocols = updated;
        }
        
        return updated;
      });
    };
    
    // Expose function to parent that removes unbookmarked protocol
    const handleProtocolUnbookmarked = (protocolId: string) => {
      console.log('🗑️ [LIVE UPDATE] Protocol unbookmarked, removed from sidebar:', protocolId);
      
      setSavedProtocols(prev => {
        // Remove from list
        const updated = prev.filter(p => p.id !== protocolId);
        
        // Update global cache
        if (globalDataCache.userId === userId) {
          globalDataCache.protocols = updated;
        }
        
        return updated;
      });
    };
    
    // Store function references so parent can call them
    (window as any).__sidebarAddProtocol = handleProtocolBookmarked;
    (window as any).__sidebarRemoveProtocol = handleProtocolUnbookmarked;
    
    return () => {
      delete (window as any).__sidebarAddProtocol;
      delete (window as any).__sidebarRemoveProtocol;
    };
  }, [onProtocolBookmarked, userId]);

  // Wrap in useCallback with NO dependencies - use userId from closure
  const loadConversations = useCallback(async (force: boolean = false) => {
    // Skip if we just did an optimistic update (delete)
    if (skipNextLoadRef.current) {
      console.log('⏭️ Skipping load after optimistic update');
      skipNextLoadRef.current = false;
      return;
    }
    
    // Skip if already loaded and not forced
    if (!force && conversationsLoadedRef.current) {
      console.log('⏭️ Conversations already loaded, skipping API call');
      return;
    }

    if (!userId || isLoadingConversationsRef.current) {
      console.log('⏭️ Skipping conversations load: no user or already loading');
      return;
    }

    console.log('🔄 [API CALL] Starting getUserConversations...');
    isLoadingConversationsRef.current = true;
    setIsLoadingConversations(true);
    setConversationsError(null);

    try {
      const response = await getUserConversations(userId, 10);
      console.log('🔄 [API CALL] getUserConversations completed');
      
      // Only update state if component is still mounted
      if (!isMountedRef.current) return;
      
      if (response.success) {
        setRecentConversations(response.conversations);
        globalDataCache.conversations = response.conversations; // Save to global cache
        conversationsLoadedRef.current = true;
        console.log('✅ Conversations loaded successfully:', response.conversations.length, 'conversations');
      } else {
        setConversationsError(response.error || 'Failed to load conversations');
      }
    } catch (error: any) {
      console.error('❌ Error loading conversations:', error);
      if (isMountedRef.current) {
        setConversationsError(error.message || 'Failed to load conversations');
      }
    } finally {
      isLoadingConversationsRef.current = false;
      if (isMountedRef.current) {
        setIsLoadingConversations(false);
      }
    }
  }, [userId]);

  const loadSavedProtocols = useCallback(async (force: boolean = false) => {
    // Skip if already loaded and not forced
    if (!force && savedProtocolsLoadedRef.current) {
      console.log('⏭️ Saved protocols already loaded, skipping API call');
      return;
    }

    if (!userId || isLoadingSavedRef.current) {
      console.log('⏭️ Skipping protocols load: no user or already loading');
      return;
    }

    console.log('🔄 [API CALL] Starting getSavedProtocols...');
    isLoadingSavedRef.current = true;
    setIsLoadingSaved(true);
    setSavedError(null);

    try {
      const res = await getSavedProtocols(userId, 50);
      console.log('🔄 [API CALL] getSavedProtocols completed');
      
      // Only update state if component is still mounted
      if (!isMountedRef.current) return;
      
      if (res.success) {
        setSavedProtocols(res.protocols || []);
        globalDataCache.protocols = res.protocols || []; // Save to global cache
        savedProtocolsLoadedRef.current = true;
        console.log('✅ Saved protocols loaded successfully:', (res.protocols || []).length, 'protocols');
      } else {
        setSavedError(res.error || 'Failed to load saved checklists');
      }
    } catch (err: any) {
      console.error('❌ Error loading saved protocols:', err);
      if (isMountedRef.current) {
        setSavedError(err.message || 'Failed to load saved checklists');
      }
    } finally {
      isLoadingSavedRef.current = false;
      if (isMountedRef.current) {
        setIsLoadingSaved(false);
      }
    }
  }, [userId]);


  // Load uploaded protocols from Elasticsearch with caching
  const loadUploadedProtocols = useCallback(async (forceRefresh = false) => {
    if (!userId || isLoadingUploaded) {
      console.log(`⏭️ Skipping loadUploadedProtocols: userId=${!!userId}, isLoading=${isLoadingUploaded}`);
      return;
    }

    // Try cache first unless forcing refresh
    if (!forceRefresh) {
      const cachedProtocols = getCachedProtocols(userId);
      if (cachedProtocols) {
        console.log(`💾 Using cached protocols: ${cachedProtocols.length} protocols found`);
        setUploadedProtocols(cachedProtocols);
        return; // Use cached data, skip API call
      } else {
        console.log('🔍 No cached protocols found, will fetch from API');
      }
    } else {
      console.log('🔄 Force refresh requested, skipping cache');
    }

    console.log('🔄 [API CALL] Starting getUserUploadedProtocols...');
    setIsLoadingUploaded(true);
    setUploadedError(null);

    try {
      const res = await getUserUploadedProtocols(userId, 20);
      console.log('🔄 [API CALL] getUserUploadedProtocols completed');

      if (!isMountedRef.current) return;

      if (res.success) {
        const protocols = res.protocols || [];
        setUploadedProtocols(protocols);
        cacheProtocols(userId, protocols); // Cache the fresh data
        console.log(`✅ Uploaded protocols loaded successfully: ${protocols.length} protocols`);
        if (res.error) {
          console.log(`⚠️ Note: ${res.error}`);
        }
      } else {
        setUploadedError(res.error || 'Failed to load uploaded protocols');
      }
    } catch (err: any) {
      console.error('❌ Error loading uploaded protocols:', err);
      if (isMountedRef.current) {
        setUploadedError(err.message || 'Failed to load uploaded protocols');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingUploaded(false);
      }
    }
  }, [userId]);

  // Load data when user logs in - simple and bulletproof
  useEffect(() => {
    // Only reload on user change or initial load - don't force reload on navigation
    const userChanged = globalDataCache.userId !== userId;

    if (!userId) {
      // Clear on logout
      setRecentConversations([]);
      setSavedProtocols([]);
      setUploadedProtocols([]);
      globalDataCache.conversations = [];
      globalDataCache.protocols = [];
      conversationsLoadedRef.current = false;
      savedProtocolsLoadedRef.current = false;

      // Clear protocol cache on logout
      if (globalDataCache.userId) {
        clearProtocolCache(globalDataCache.userId);
      }
      globalDataCache.userId = null;
      return;
    }

    // Only load if user changed or we're loading for the first time
    if (!userChanged && globalDataCache.userId === userId) {
      console.log('⏭️ User unchanged, skipping reload - preserving existing data');
      return;
    }

    if (globalDataCache.isLoading) {
      console.log('⏭️ Already loading, skipping duplicate load');
      return;
    }

    console.log('🔄 Loading data for user:', userId, 'userChanged:', userChanged);

    // Update global cache
    globalDataCache.userId = userId;
    globalDataCache.isLoading = true;

    Promise.all([
      loadConversations(true),
      loadSavedProtocols(true),
      loadUploadedProtocols(userChanged) // Force refresh on user change, use cache otherwise
    ]).finally(() => {
      globalDataCache.isLoading = false;
    });
  }, [userId, loadConversations, loadSavedProtocols, loadUploadedProtocols]);

  // DEPRECATED: Handle refresh trigger - no longer needed with live updates
  const lastRefreshTriggerRef = useRef(0);
  useEffect(() => {
    // Skip if no trigger provided (new behavior - we use live updates instead)
    if (savedProtocolsRefreshTrigger === undefined) {
      console.log('✅ Using live updates - no refresh trigger needed');
      return;
    }
    
    const triggerValue = savedProtocolsRefreshTrigger || 0;
    
    // Only reload if trigger actually changed and is greater than 0
    if (triggerValue > 0 && triggerValue !== lastRefreshTriggerRef.current) {
      console.log('🔄 Refresh trigger detected, reloading saved protocols...');
      lastRefreshTriggerRef.current = triggerValue;
      // Force reload when explicitly triggered
      loadSavedProtocols(true);
      loadUploadedProtocols(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedProtocolsRefreshTrigger]); // Only depend on the trigger value


  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
      if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

      return date.toLocaleDateString();
    } catch {
      return timestamp;
    }
  };

  const handleDeleteConversation = (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser) return;

    // Find conversation title for the confirmation message
    const conversation = recentConversations.find(c => c.id === conversationId);
    const conversationTitle = conversation?.title || 'this conversation';

    if (onShowConfirmation) {
      onShowConfirmation({
        title: 'Delete Conversation',
        message: `Are you sure you want to delete "${conversationTitle}"? This action cannot be undone.`,
        confirmText: 'Delete Conversation',
        dangerous: true,
        confirmAction: async () => {
          // Store conversation data BEFORE removing for potential rollback
          const conversationToDelete = recentConversations.find(c => c.id === conversationId);
          
          try {
            // LIVE UPDATE: Optimistically remove from UI first for instant feedback
            const updatedConversations = recentConversations.filter(c => c.id !== conversationId);
            
            console.log('🔄 Optimistically removed conversation from sidebar');
            console.log('   Before:', recentConversations.length, 'conversations');
            console.log('   After:', updatedConversations.length, 'conversations');
            console.log('   Removed ID:', conversationId);
            
            // Update BOTH local state AND global cache IMMEDIATELY
            setRecentConversations(updatedConversations);
            if (globalDataCache.userId === userId) {
              globalDataCache.conversations = updatedConversations;
              console.log('✅ Updated global cache immediately');
            }
            
            skipNextLoadRef.current = true; // Prevent next API reload from overwriting
            console.log('🚫 Set skipNextLoadRef = true to prevent reload');
            setOpenMenuId(null);

            // Notify parent FIRST to close tabs and clear cache
            if (onConversationDeleted) {
              onConversationDeleted(conversationId);
            }

            // Then delete from backend
            await deleteConversation(currentUser.uid, conversationId);
            
            console.log('✅ Conversation deleted successfully (backend + cache + tabs)');
          } catch (error) {
            console.error('❌ Failed to delete conversation:', error);
            
            // ROLLBACK: Restore conversation to sidebar on error
            if (conversationToDelete) {
              setRecentConversations(prev => [...prev, conversationToDelete].sort((a, b) => 
                new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
              ));
              
              // Restore to global cache too
              if (globalDataCache.userId === userId) {
                globalDataCache.conversations = [...globalDataCache.conversations, conversationToDelete].sort((a, b) => 
                  new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
                );
              }
              
              console.log('🔄 Rolled back conversation deletion in sidebar');
            }
            
            alert('Failed to delete conversation. Please try again.');
          }
        }
      });
    }
  };

  const handleStartRename = (conversation: ConversationListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conversation.id);
    setEditTitle(conversation.title);
    setOpenMenuId(null);
  };

  const handleSaveRename = async (conversationId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    if (!currentUser || !editTitle.trim()) {
      setEditingId(null);
      return;
    }

    try {
      await updateConversationTitle(currentUser.uid, conversationId, editTitle.trim());
      
      // Update local state - no need to reload from server
      const updatedConversations = recentConversations.map(c => 
        c.id === conversationId ? { ...c, title: editTitle.trim() } : c
      );
      setRecentConversations(updatedConversations);
      
      // Update global cache to persist across remounts
      if (globalDataCache.userId === userId) {
        globalDataCache.conversations = updatedConversations;
      }
      
      setEditingId(null);
      console.log('✅ Conversation renamed (local + cache updated)');
    } catch (error) {
      console.error('Failed to rename conversation:', error);
      alert('Failed to rename conversation');
    }
  };

  const handleCancelRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
    setEditTitle('');
  };

  // Protocol handlers
  const handleDeleteProtocol = (protocolId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser) return;

    // Find protocol title for the confirmation message
    const protocol = savedProtocols.find(p => p.id === protocolId);
    const protocolTitle = protocol?.title || 'this saved protocol';

    if (onShowConfirmation) {
      onShowConfirmation({
        title: 'Remove from Saved',
        message: `Are you sure you want to remove "${protocolTitle}" from your saved protocols?`,
        confirmText: 'Remove from Saved',
        dangerous: true,
        confirmAction: async () => {
          // Store protocol data BEFORE removing for potential rollback
          const protocolToDelete = savedProtocols.find(p => p.id === protocolId);
          
          try {
            // LIVE UPDATE: Optimistically remove from UI first for instant feedback
            const updatedProtocols = savedProtocols.filter(p => p.id !== protocolId);
            
            console.log('🔄 Optimistically removed protocol from sidebar');
            console.log('   Before:', savedProtocols.length, 'protocols');
            console.log('   After:', updatedProtocols.length, 'protocols');
            console.log('   Removed ID:', protocolId);
            
            // Update BOTH local state AND global cache IMMEDIATELY
            setSavedProtocols(updatedProtocols);
            if (globalDataCache.userId === userId) {
              globalDataCache.protocols = updatedProtocols;
              console.log('✅ Updated global cache immediately');
            }
            
            setOpenProtocolMenuId(null);
            
            // Notify parent FIRST to close tabs
            if (onSavedProtocolDeleted) {
              onSavedProtocolDeleted(protocolId, protocolTitle);
            }

            // Then delete from backend
            await deleteSavedProtocol(currentUser.uid, protocolId);
            
            console.log('✅ Protocol deleted successfully (backend + cache + tabs)');
          } catch (error) {
            console.error('❌ Failed to delete protocol:', error);
            
            // ROLLBACK: Restore protocol to sidebar on error
            if (protocolToDelete) {
              setSavedProtocols(prev => [...prev, protocolToDelete].sort((a, b) => 
                new Date(b.saved_at).getTime() - new Date(a.saved_at).getTime()
              ));
              
              // Restore to global cache too
              if (globalDataCache.userId === userId) {
                globalDataCache.protocols = [...globalDataCache.protocols, protocolToDelete].sort((a, b) => 
                  new Date(b.saved_at).getTime() - new Date(a.saved_at).getTime()
                );
              }
              
              console.log('🔄 Rolled back protocol deletion in sidebar');
            }
            
            alert('Failed to remove protocol. Please try again.');
          }
        }
      });
    }
  };

  const handleStartProtocolRename = (protocol: ApiSavedProtocol, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProtocolId(protocol.id);
    setEditProtocolTitle(protocol.title);
    setOpenProtocolMenuId(null);
  };

  const handleSaveProtocolRename = async (protocolId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    if (!currentUser || !editProtocolTitle.trim()) {
      setEditingProtocolId(null);
      return;
    }

    try {
      await updateSavedProtocolTitle(currentUser.uid, protocolId, editProtocolTitle.trim());
      
      // Update local state - no need to reload from server
      const updatedProtocols = savedProtocols.map(p => 
        p.id === protocolId ? { ...p, title: editProtocolTitle.trim() } : p
      );
      setSavedProtocols(updatedProtocols);
      
      // Update global cache to persist across remounts
      if (globalDataCache.userId === userId) {
        globalDataCache.protocols = updatedProtocols;
      }
      
      setEditingProtocolId(null);
      console.log('✅ Protocol renamed (local + cache updated)');
    } catch (error) {
      console.error('Failed to rename protocol:', error);
      alert('Failed to rename protocol');
    }
  };

  const handleCancelProtocolRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProtocolId(null);
    setEditProtocolTitle('');
  };

  const handleSavedProtocolClick = async (protocolId: string) => {
    console.log('🎯 [USER ACTION] Clicking saved protocol:', protocolId);
    if (!currentUser) return;

    // PERFORMANCE: Use cached protocol data from savedProtocols state (no API call needed)
    const protocol = savedProtocols.find(p => p.id === protocolId);
    if (protocol && protocol.protocol_data) {
      console.log('✅ Using cached protocol data (instant load)');
      onSavedProtocol(protocolId, protocol.protocol_data);
      return;
    }

    // Fallback: Only fetch from API if protocol_data is missing (rare case)
    try {
      console.log('🔄 [API CALL] Protocol data not in cache, fetching from API...');
      const response = await getSavedProtocol(currentUser.uid, protocolId);
      console.log('🔄 [API CALL] getSavedProtocol completed');
      if (response.success && response.protocol) {
        console.log('✅ Protocol data fetched from API');
        onSavedProtocol(protocolId, response.protocol.protocol_data);
      } else {
        console.error('❌ Failed to load saved protocol:', response.error);
        onSavedProtocol(protocolId, null);
      }
    } catch (error) {
      console.error('❌ Error loading saved protocol:', error);
      onSavedProtocol(protocolId, null);
    }
  };

  // Profile action handlers
  const handleStartProfileRename = () => {
    setIsRenaming(true);
    setNewDisplayName(currentUser?.displayName || '');
  };

  const handleSaveProfileRename = async () => {
    if (!currentUser || !newDisplayName.trim()) {
      setIsRenaming(false);
      return;
    }

    try {
      await updateProfile(currentUser, { displayName: newDisplayName.trim() });
      setIsRenaming(false);
      alert('Name updated successfully!');
    } catch (error) {
      console.error('Failed to update name:', error);
      alert('Failed to update name. Please try again.');
    }
  };

  const handleCancelProfileRename = () => {
    setIsRenaming(false);
    setNewDisplayName('');
  };

  const handleLogout = () => {
    if (onShowLogoutModal) {
      onShowLogoutModal();
    }
  };

  const handleDeleteAccount = () => {
    if (onShowDeleteModal) {
      onShowDeleteModal();
    }
  };

  // Upload handling functions
  const handleFileUpload = async (file: File) => {
    if (!currentUser) {
      alert('Please log in to upload files');
      return;
    }

    // Prevent multiple simultaneous uploads
    if (isUploading) {
      alert('Please wait for the current upload to complete before starting a new one');
      return;
    }

    if (!file.name.toLowerCase().endsWith('.zip')) {
      alert('Please select a ZIP file');
      return;
    }

    if (file.size > 100 * 1024 * 1024) { // 100MB limit
      alert('File size exceeds 100MB limit');
      return;
    }

    setIsUploading(true);
    setUploadCancelled(false);
    uploadCancelledRef.current = false; // Reset ref for new upload
    setCurrentUploadId(null); // Reset upload ID
    const newUploadProgress = {
      status: 'uploading' as const,
      filename: file.name,
      progress: 0
    };
    setUploadProgress(newUploadProgress);
    uploadProgressRef.current = newUploadProgress; // Immediately sync ref for new upload

    // Create abort controller for upload cancellation
    uploadAbortController.current = new AbortController();

    try {
      console.log('🔄 Starting file upload:', file.name);
      console.log('📝 Custom prompt:', customPrompt || 'None provided');
      const result = await uploadDocuments(currentUser.uid, file, customPrompt, uploadAbortController.current.signal);

      // Check if upload was cancelled during the request (use ref for immediate check)
      if (uploadCancelledRef.current) {
        console.log('🚫 Upload was cancelled during request');
        return;
      }

      console.log('✅ Upload initiated:', result);
      setCurrentUploadId(result.upload_id);
      setUploadProgress({
        status: 'processing',
        filename: result.filename,
        upload_id: result.upload_id,
        progress: 25
      });

      // Start polling for status updates
      pollUploadStatus(result.upload_id);
    } catch (error) {
      console.error('❌ Upload failed:', error);

      // Check if it was aborted by user
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('🚫 Upload aborted by user');
        setUploadProgress(null);
        setIsUploading(false);
        setUploadCancelled(true);
        setCurrentUploadId(null);
      } else {
        setUploadProgress({
          status: 'error',
          filename: file.name,
          error: error instanceof Error ? error.message : 'Upload failed'
        });
        setIsUploading(false);
        setUploadCancelled(false);
      }
    }
  };

  const pollUploadStatus = async (uploadId: string) => {
    if (!currentUser) return;

    const poll = async () => {
      // Check if upload was cancelled (use ref for immediate access)
      if (uploadCancelledRef.current) {
        console.log('🚫 Polling stopped due to cancellation');
        if (pollingRef.current) {
          clearTimeout(pollingRef.current);
          pollingRef.current = null;
        }
        return;
      }

      try {
        const status = await getUploadStatus(currentUser.uid, uploadId);
        console.log('📊 Upload status:', status);

        // Check again if upload was cancelled while waiting for status (prevent race condition)
        if (uploadCancelledRef.current) {
          console.log('🚫 Upload was cancelled during status check, ignoring result');
          return;
        }

        // CRITICAL: Check cancellation BEFORE updating state with any success status
        // Use refs to get the LATEST values (not closure values)
        const latestUploadProgress = uploadProgressRef.current;
        const latestCancelled = uploadCancelledRef.current;

        console.log('🔍 Checking cancellation state AT POLL TIME:', {
          backendStatus: status.status,
          'uploadCancelledRef.current': uploadCancelledRef.current,
          latestCancelled: latestCancelled,
          latestProgressStatus: latestUploadProgress?.status,
          'Are they the same?': uploadCancelledRef.current === latestCancelled,
          willIgnore: (status.status === 'completed' || status.status === 'awaiting_approval') && (latestCancelled || latestUploadProgress?.status === 'cancelled')
        });

        // Check BOTH the ref AND the uploadProgress status using refs to get latest values
        if ((status.status === 'completed' || status.status === 'awaiting_approval') &&
            (latestCancelled || latestUploadProgress?.status === 'cancelled')) {
          console.log('🚫 User cancelled but backend completed - keeping cancelled state, not updating UI');
          // Stop polling since we're ignoring this completion
          if (pollingRef.current) {
            clearTimeout(pollingRef.current);
            pollingRef.current = null;
          }
          return;
        }

        // CRITICAL: For completion statuses, check cancellation BEFORE updating uploadProgress
        if (status.status === 'completed' || status.status === 'awaiting_approval') {
          // Use functional update to check the absolute latest cancelled state
          let isCancelled = false;
          setUploadCancelled((currentCancelled) => {
            isCancelled = currentCancelled;
            return currentCancelled; // Don't change it, just read it
          });

          if (isCancelled) {
            console.log('🚫 Upload is cancelled - ignoring backend completion, NOT updating uploadProgress');
            // Stop polling and bail out WITHOUT updating any state
            if (pollingRef.current) {
              clearTimeout(pollingRef.current);
              pollingRef.current = null;
            }
            return;
          }
        }

        // Calculate progress based on status
        let calculatedProgress = 25; // Start at 25% after upload
        if (status.status === 'processing') {
          calculatedProgress = 25 + (status.progress || 0) * 0.6; // 25% to 85%
        } else if (status.status === 'awaiting_approval' || status.status === 'completed') {
          calculatedProgress = 100;
        }

        if (status.status === 'completed') {
          setUploadProgress({
            status: status.status,
            upload_id: uploadId,
            progress: calculatedProgress,
            protocols_extracted: status.protocols_extracted,
            protocols_indexed: status.protocols_indexed
          });

          console.log('✅ Upload processing completed');
          setIsUploading(false);
          setUploadCancelled(false);
          uploadCancelledRef.current = false; // Sync ref with state
          // Refresh user protocols list with fresh data
          loadUploadedProtocols(true);
          setTimeout(() => {
            setUploadProgress(null);
          }, 3000); // Show success for 3 seconds
        } else if (status.status === 'awaiting_approval') {
          // TRIPLE CHECK: Use functional update to get the absolute latest cancelled state
          let shouldShowPreview = true;
          setUploadCancelled((currentCancelled) => {
            console.log('🔍 FINAL CHECK: Is upload currently cancelled?', currentCancelled);
            if (currentCancelled) {
              console.log('🚫 Upload is cancelled - will NOT show preview or reset state');
              shouldShowPreview = false;
              return true; // Keep it cancelled
            }
            console.log('⏳ Upload processing completed, awaiting user approval');
            return false; // Not cancelled, reset to false
          });

          if (!shouldShowPreview) {
            // Stop polling and bail out - don't update uploadProgress
            if (pollingRef.current) {
              clearTimeout(pollingRef.current);
              pollingRef.current = null;
            }
            return;
          }

          setIsUploading(false);
          uploadCancelledRef.current = false; // Sync ref with state
          // Show preview modal and get actual protocol count
          await showProtocolPreview(uploadId, false, (actualCount: number) => {
            // Update uploadProgress with actual protocol count from preview
            setUploadProgress({
              status: status.status,
              upload_id: uploadId,
              progress: calculatedProgress,
              protocols_extracted: actualCount,
              protocols_indexed: status.protocols_indexed
            });
          });
        } else if (status.status === 'cancelled') {
          console.log('🚫 Upload was cancelled, cleaning up UI');
          setIsUploading(false);
          setUploadCancelled(true);
          // Update status to show cancelled in the upload modal
          setUploadProgress({
            status: 'cancelled',
            upload_id: uploadId,
            filename: uploadProgress?.filename || 'Unknown file'
          });
          setCurrentUploadId(null);
          // Stop polling
          if (pollingRef.current) {
            clearTimeout(pollingRef.current);
            pollingRef.current = null;
          }
          // Show the cancellation notification by calling showProtocolPreview
          // which will read the cancelled status and show the appropriate notification
          await showProtocolPreview(uploadId);
          // Then delete the preview file to clean up
          try {
            await deleteUploadPreview(currentUser.uid, uploadId);
            console.log('🧹 Deleted cancelled preview file from backend');
          } catch (error) {
            console.error('⚠️ Failed to delete cancelled preview file:', error);
          }
        } else if (status.status === 'failed') {
          console.log('❌ Upload processing failed');
          setUploadProgress({ status: 'error', error: 'Processing failed' });
          setIsUploading(false);
          setUploadCancelled(false);
        } else {
          // Update progress for processing/uploading status if not cancelled
          if (!uploadCancelledRef.current) {
            setUploadProgress({
              status: status.status,
              upload_id: uploadId,
              progress: calculatedProgress,
              protocols_extracted: status.protocols_extracted,
              protocols_indexed: status.protocols_indexed
            });
          }
          // Continue polling
          pollingRef.current = setTimeout(poll, 2000); // Poll every 2 seconds
        }
      } catch (error) {
        console.error('❌ Status polling failed:', error);
        setUploadProgress({ status: 'error', error: 'Status check failed' });
        setIsUploading(false);
        setUploadCancelled(false);
      }
    };

    poll();
  };

  const handleUploadDocuments = () => {
    setShowUploadModal(true);
    setCustomPrompt(''); // Reset custom prompt when opening modal
  };

  const handleCancelUpload = async () => {
    console.log('🎯 Cancel button clicked!', {
      isUploading,
      currentUploadId,
      currentUser: !!currentUser,
      uploadProgress: uploadProgress?.status
    });

    if (!isUploading || !currentUser) {
      console.log('⏭️ Nothing to cancel');
      return;
    }

    try {
      // If we have an upload_id, it means we're in processing phase - call backend cancel API
      if (currentUploadId) {
        console.log('🚫 Cancelling processing phase with upload_id:', currentUploadId);
        const result = await cancelUpload(currentUser.uid, currentUploadId);
        console.log('✅ Upload cancellation result:', result);
      }
      // If we don't have upload_id yet, we're still in upload phase - abort the fetch request
      else if (uploadAbortController.current) {
        console.log('🚫 Aborting upload request');
        uploadAbortController.current.abort();
      }

      // Clean up state regardless of which phase we cancelled
      console.log('🔴 Setting uploadCancelled to TRUE and status to cancelled');
      uploadCancelledRef.current = true; // Set ref IMMEDIATELY (not async like state)
      setUploadCancelled(true);
      setIsUploading(false);
      // Set status to 'cancelled' instead of clearing it entirely
      setUploadProgress({
        status: 'cancelled',
        filename: uploadProgress?.filename || 'Unknown file',
        protocols_extracted: 0,
        protocols_indexed: 0,
        progress: 0
      });
      console.log('🔴 Upload progress updated to cancelled with 0 protocols');
      setCurrentUploadId(null);

      // Clear any pending polling
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
        pollingRef.current = null;
      }

      console.log('🚫 Upload cancelled by user');
    } catch (error) {
      console.error('❌ Failed to cancel upload:', error);

      // Still cancel locally even if API call fails
      uploadCancelledRef.current = true; // Set ref IMMEDIATELY (not async like state)
      setUploadCancelled(true);
      setIsUploading(false);
      // Set status to 'cancelled' instead of clearing it entirely
      setUploadProgress({
        status: 'cancelled',
        filename: uploadProgress?.filename || 'Unknown file',
        protocols_extracted: 0,
        protocols_indexed: 0,
        progress: 0
      });
      setCurrentUploadId(null);

      // Clear any pending polling
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
        pollingRef.current = null;
      }
    }
  };

  // Cleanup polling on component unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
      }
    };
  }, []);

  // Handler function for regenerating protocols (currently unused but kept for future features)
  // @ts-ignore - Intentionally unused, kept for future features
  const handleRegenerateProtocol = async (protocolId: string) => {
    if (!currentUser) {
      alert('Please log in to regenerate protocols');
      return;
    }

    // Show the regenerate modal instead of window.prompt
    setProtocolToRegenerate(protocolId);
    setRegenerationPrompt('Focus on specific aspects like pediatric considerations, emergency protocols, or detailed contraindications');
    setShowRegenerateModal(true);
  };

  const handleConfirmRegenerate = async () => {
    if (!currentUser || !protocolToRegenerate) return;

    try {
      setRegeneratingProtocolId(protocolToRegenerate);
      setShowRegenerateModal(false);
      console.log('🔄 Starting protocol regeneration:', protocolToRegenerate);

      // Remove the uploaded_ prefix if present to get the actual protocol ID
      const actualProtocolId = protocolToRegenerate.replace('uploaded_', '');

      const result = await regenerateProtocol(currentUser.uid, actualProtocolId, regenerationPrompt);

      console.log('✅ Protocol regeneration initiated:', result);
      alert(`Protocol regeneration started! ${result.message}`);

      // Refresh the uploaded protocols list with fresh data
      setTimeout(() => {
        loadUploadedProtocols(true);
      }, 2000);

    } catch (error) {
      console.error('❌ Protocol regeneration failed:', error);
      alert(`Failed to regenerate protocol: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setRegeneratingProtocolId(null);
      setProtocolToRegenerate(null);
      setRegenerationPrompt('');
    }
  };

  const handleCancelRegenerate = () => {
    setShowRegenerateModal(false);
    setProtocolToRegenerate(null);
    setRegenerationPrompt('');
  };

  // Handler function for deleting user protocols (currently unused but kept for future features)
  // @ts-ignore - Intentionally unused, kept for future features
  const handleDeleteUserProtocol = async (protocolId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!currentUser) return;

    // Find protocol title for the confirmation message
    const actualProtocolId = protocolId.replace('uploaded_', '');
    const protocol = userIndexProtocols.find(p => p.id === actualProtocolId);
    const protocolTitle = protocol?.title || 'this uploaded protocol';

    if (onShowConfirmation) {
      onShowConfirmation({
        title: 'Delete Uploaded Protocol',
        message: `Are you sure you want to delete "${protocolTitle}"? This action cannot be undone and will permanently remove this protocol from your index.`,
        confirmText: 'Delete Protocol',
        dangerous: true,
        confirmAction: async () => {
          try {
            await deleteUserProtocol(currentUser.uid, actualProtocolId);

            // Remove from local state and clear cache
            setUploadedProtocols(prev => prev.filter(p => p.id !== actualProtocolId));
            setOpenProtocolMenuId(null);
            // Clear cache since data has changed
            clearProtocolCache(currentUser.uid);
            console.log('✅ User protocol deleted locally, cache cleared');
          } catch (error) {
            console.error('Failed to delete user protocol:', error);
            alert('Failed to delete protocol');
          }
        }
      });
    }
  };

  // Handler function for renaming user protocols (currently unused but kept for future features)
  // @ts-ignore - Intentionally unused, kept for future features
  const handleSaveUserProtocolRename = async (protocolId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    if (!currentUser || !editProtocolTitle.trim()) {
      setEditingProtocolId(null);
      return;
    }

    try {
      // Remove the uploaded_ prefix if present to get the actual protocol ID
      const actualProtocolId = protocolId.replace('uploaded_', '');

      await updateUserProtocolTitle(currentUser.uid, actualProtocolId, editProtocolTitle.trim());

      // Update local state - no need to reload from server
      setUploadedProtocols(prev =>
        prev.map(p => p.id === actualProtocolId ? { ...p, title: editProtocolTitle.trim() } : p)
      );
      setEditingProtocolId(null);
      console.log('✅ User protocol renamed locally, no API reload needed');
    } catch (error) {
      console.error('Failed to rename user protocol:', error);
      alert('Failed to rename protocol');
    }
  };

  const showProtocolPreview = async (uploadId: string, forceShow = false, onProtocolCountLoaded?: (count: number) => void) => {
    try {
      if (!currentUser) return;

      const preview = await getUploadPreview(currentUser.uid, uploadId);

      if (forceShow) {
        // Directly show generated protocols view when clicked from sidebar (after notification was dismissed)
        if (onShowGeneratedProtocols) {
          onShowGeneratedProtocols(uploadId, preview.protocols);
        }
      } else {
        // Send notification for automatic upload completion
        // DON'T switch tabs or close modals - just show notification
        if (onNotifyUploadReady) {
          // Extract protocols array (handle both old and new format)
          const protocols = Array.isArray(preview.protocols) ? preview.protocols : (preview.protocols || []);
          const status = preview.status || 'completed';

          // Call the callback with actual protocol count
          if (onProtocolCountLoaded) {
            onProtocolCountLoaded(protocols.length);
          }

          // Check status field to determine the correct notification
          if (status === 'cancelled') {
            onNotifyUploadReady({
              type: 'upload_ready',
              title: '🚫 Upload Cancelled',
              message: 'Protocol generation was cancelled successfully.',
              uploadId,
              protocols
            });
          } else if (protocols.length === 0) {
            // Upload completed but no relevant protocols found
            onNotifyUploadReady({
              type: 'upload_ready',
              title: 'ℹ️ No Protocols Found',
              message: 'No relevant medical protocols were found in the uploaded documents.',
              uploadId,
              protocols
            });
          } else {
            onNotifyUploadReady({
              type: 'upload_ready',
              title: '🎉 Protocols Ready!',
              message: `Your ${protocols.length} protocol${protocols.length === 1 ? '' : 's'} have been generated and are ready for review.`,
              uploadId,
              protocols
            });
          }
        }

        // Don't automatically create the tab - let user click "View Protocols" to open it
        // This prevents duplicate tabs and keeps user in upload modal if they're watching progress
      }

      // DON'T clear upload progress here - let it stay visible in the upload modal
      // Only clear it when user dismisses the notification or closes the modal
      // setUploadProgress(null);  // REMOVED

    } catch (error) {
      console.error('❌ Failed to get protocol preview:', error);
      alert('Failed to load protocol preview');
    }
  };



  return (
    <div className={`${isCollapsed ? 'w-16' : 'w-80'} bg-white border-r border-slate-200 h-full flex flex-col overflow-hidden transition-all duration-300`}>
      {/* Header */}
      <div className={`${isCollapsed ? 'p-3' : 'p-6'} border-b border-slate-200 flex-shrink-0`}>
        <div className={`flex items-center ${isCollapsed ? 'justify-center mb-3' : 'space-x-3 mb-4'}`}>
          {!isCollapsed && (
            <div className="p-2 bg-teal-100 rounded-lg">
              <Stethoscope className="h-5 w-5 text-teal-600" />
            </div>
          )}
          {!isCollapsed && (
            <div className="flex-1">
              <h2 className="text-lg font-bold text-slate-900">ProCheck</h2>
              <Badge variant="secondary" className="bg-teal-100 text-teal-700 text-xs">
                Beta
              </Badge>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="h-8 w-8 text-slate-600 hover:text-slate-900 flex-shrink-0"
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>
        {!isCollapsed && (
          <Button
            onClick={onNewSearch}
            className="w-full bg-teal-600 hover:bg-teal-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Protocol Search
          </Button>
        )}
        {isCollapsed && (
          <Button
            onClick={onNewSearch}
            size="icon"
            className="w-full bg-teal-600 hover:bg-teal-700 text-white"
            title="New Protocol Search"
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Content Area - Split into three scrollable sections */}
      <div className={`flex-1 flex flex-col overflow-hidden ${isCollapsed ? 'hidden' : ''}`}>
        {/* Saved Protocols Section - Takes up one third */}
        <div className="flex-1 min-h-0 border-b border-slate-200 flex flex-col">
          <div className="px-6 pt-6 pb-3 flex-shrink-0">
            <div className="flex items-center space-x-2 mb-4">
              <Star className="h-4 w-4 text-slate-600" />
              <h3 className="text-sm font-semibold text-slate-900">Saved Checklists</h3>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <div className="space-y-3">
              {savedError && (
                <div className="text-xs text-red-600 mb-3 p-2 bg-red-50 rounded">
                  {savedError}
                </div>
              )}
              {isLoadingSaved ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 text-teal-600 animate-spin" />
                </div>
              ) : savedProtocols.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-sm">No saved checklists yet</div>
              ) : (
                savedProtocols.map((p) => (
                  <Card
                    key={p.id}
                    className={`group relative cursor-pointer hover:shadow-md transition-all duration-200 hover:border-teal-200 ${
                      openProtocolMenuId === p.id ? 'z-50' : 'z-0'
                    }`}
                    onClick={() => editingProtocolId !== p.id && handleSavedProtocolClick(p.id)}
                  >
                    <CardContent className="p-3">
                      {editingProtocolId === p.id ? (
                        // Edit mode
                        <div onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editProtocolTitle}
                            onChange={(e) => setEditProtocolTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveProtocolRename(p.id);
                              if (e.key === 'Escape') handleCancelProtocolRename(e as any);
                            }}
                            className="w-full text-sm font-medium text-slate-900 mb-2 px-2 py-1 border border-teal-500 rounded focus:outline-none focus:ring-2 focus:ring-teal-500"
                            autoFocus
                          />
                          <div className="flex items-center space-x-2">
                            <Button
                              size="sm"
                              onClick={(e) => handleSaveProtocolRename(p.id, e)}
                              className="h-6 text-xs bg-teal-600 hover:bg-teal-700"
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleCancelProtocolRename}
                              className="h-6 text-xs"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        // View mode
                        <>
                          <div className="flex items-start justify-between mb-2">
                            <h4 className="text-sm font-medium text-slate-900 line-clamp-2 flex-1 pr-2">
                              {p.title}
                            </h4>
                            <div className="relative flex-shrink-0 flex items-center space-x-1">
                              <Star className="h-4 w-4 text-yellow-500 fill-current" />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenProtocolMenuId(openProtocolMenuId === p.id ? null : p.id);
                                }}
                              >
                                <MoreVertical className="h-3 w-3" />
                              </Button>
                              {openProtocolMenuId === p.id && (
                                <div
                                  className="absolute right-0 top-8 z-50 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-32"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    onClick={(e) => handleStartProtocolRename(p, e)}
                                    className="w-full px-3 py-2 text-left text-xs hover:bg-slate-100 flex items-center space-x-2"
                                  >
                                    <Edit2 className="h-3 w-3" />
                                    <span>Rename</span>
                                  </button>
                                  <button
                                    onClick={(e) => handleDeleteProtocol(p.id, e)}
                                    className="w-full px-3 py-2 text-left text-xs hover:bg-red-50 text-red-600 flex items-center space-x-2"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                    <span>Unstar</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span className="font-medium text-slate-600">{p.organization}</span>
                            <span>{formatTimestamp(p.saved_at)}</span>
                          </div>
                          <div className="flex items-center space-x-2 mt-2 text-xs text-slate-500">
                            <div className="flex items-center space-x-1">
                              <MapPin className="h-3 w-3" />
                              <span>{p.region}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Calendar className="h-3 w-3" />
                              <span>{p.year}</span>
                            </div>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Recent Searches Section - Takes up more space now */}
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="px-6 pt-6 pb-3 flex-shrink-0">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Search className="h-4 w-4 text-slate-600" />
                <h3 className="text-sm font-semibold text-slate-900">Recent Searches</h3>
              </div>
              {isLoadingConversations && (
                <Loader2 className="h-4 w-4 text-slate-400 animate-spin" />
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {conversationsError && (
              <div className="text-xs text-red-600 mb-3 p-2 bg-red-50 rounded">
                {conversationsError}
              </div>
            )}

            <div className="space-y-3">
              {isLoadingConversations ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 text-teal-600 animate-spin" />
                </div>
              ) : recentConversations.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">
                  No recent searches yet
                </div>
              ) : (
              recentConversations.map((conversation) => (
                <Card
                  key={conversation.id}
                  className={`group relative cursor-pointer hover:shadow-md transition-all duration-200 hover:border-teal-200 ${
                    openMenuId === conversation.id ? 'z-50' : 'z-0'
                  }`}
                  onClick={() => editingId !== conversation.id && onRecentSearch(conversation.id)}
                >
                  <CardContent className="p-3">
                    {editingId === conversation.id ? (
                      // Edit mode
                      <div onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(conversation.id);
                            if (e.key === 'Escape') handleCancelRename(e as any);
                          }}
                          className="w-full text-sm font-medium text-slate-900 mb-2 px-2 py-1 border border-teal-500 rounded focus:outline-none focus:ring-2 focus:ring-teal-500"
                          autoFocus
                        />
                        <div className="flex items-center space-x-2">
                          <Button
                            size="sm"
                            onClick={(e) => handleSaveRename(conversation.id, e)}
                            className="h-6 text-xs bg-teal-600 hover:bg-teal-700"
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCancelRename}
                            className="h-6 text-xs"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      // View mode
                      <>
                        <div className="flex items-start justify-between mb-2">
                          <p className="text-sm font-medium text-slate-900 line-clamp-2 flex-1 pr-2">
                            {conversation.title}
                          </p>
                          <div className="relative flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(openMenuId === conversation.id ? null : conversation.id);
                              }}
                            >
                              <MoreVertical className="h-3 w-3" />
                            </Button>
                            {openMenuId === conversation.id && (
                              <div
                                className="absolute right-0 top-8 z-50 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-32"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  onClick={(e) => handleStartRename(conversation, e)}
                                  className="w-full px-3 py-2 text-left text-xs hover:bg-slate-100 flex items-center space-x-2"
                                >
                                  <Edit2 className="h-3 w-3" />
                                  <span>Rename</span>
                                </button>
                                <button
                                  onClick={(e) => handleDeleteConversation(conversation.id, e)}
                                  className="w-full px-3 py-2 text-left text-xs hover:bg-red-50 text-red-600 flex items-center space-x-2"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  <span>Delete</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <div className="flex items-center space-x-3">
                            <div className="flex items-center space-x-1">
                              <Clock className="h-3 w-3" />
                              <span>{formatTimestamp(conversation.updated_at)}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <span className="text-slate-400">•</span>
                              <span>{conversation.message_count} msg{conversation.message_count !== 1 ? 's' : ''}</span>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Collapsed View - Show minimal icons */}
      {isCollapsed && (
        <div className="flex-1 flex flex-col justify-center items-center space-y-4 py-4">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-slate-600 hover:text-teal-600 hover:bg-teal-50"
            onClick={() => {
              onToggleCollapse(); // Expand sidebar first
              setTimeout(() => onSetActiveProfileTab('protocols'), 100); // Then open protocols tab
              onOpenProfile(); // Open profile modal
            }}
            title="My Protocols"
          >
            <FileText className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-slate-600 hover:text-yellow-600 hover:bg-yellow-50"
            onClick={onToggleCollapse} // Just expand to show saved checklists
            title="Saved Checklists"
          >
            <Star className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-slate-600 hover:text-blue-600 hover:bg-blue-50"
            onClick={onToggleCollapse} // Just expand to show recent searches
            title="Recent Searches"
          >
            <Search className="h-5 w-5" />
          </Button>
        </div>
      )}

      {/* Footer */}
      <div className={`${isCollapsed ? 'p-3' : 'p-6'} border-t border-slate-200 flex-shrink-0`}>
        {!isCollapsed ? (
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={onOpenProfile}
          >
            <div className="h-8 w-8 bg-teal-100 rounded-full flex items-center justify-center mr-3">
              {getProfileImageUrl() ? (
                <img
                  src={getProfileImageUrl()!}
                  alt="Profile"
                  className="h-8 w-8 rounded-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    // Hide image if it fails to load
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <User className="h-4 w-4 text-teal-600" />
              )}
            </div>
            <div className="flex flex-col items-start">
              <span className="text-sm font-medium text-slate-900">
                {currentUser?.displayName || currentUser?.email || 'User'}
              </span>
              <span className="text-xs text-slate-500">View profile</span>
            </div>
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="w-full h-10"
            onClick={() => {
              onToggleCollapse(); // Expand sidebar first
              setTimeout(() => onOpenProfile(), 100); // Then open profile modal with a small delay
            }}
            title="View profile"
          >
            <div className="h-8 w-8 bg-teal-100 rounded-full flex items-center justify-center">
              {getProfileImageUrl() ? (
                <img
                  src={getProfileImageUrl()!}
                  alt="Profile"
                  className="h-8 w-8 rounded-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    // Hide image if it fails to load
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <User className="h-4 w-4 text-teal-600" />
              )}
            </div>
          </Button>
        )}
      </div>

      {/* Profile Modal */}
      {isProfileOpen && (
        <div className="absolute inset-0 bg-white z-50 flex flex-col">
          {/* Modal Header */}
          <div className="p-6 border-b border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Account & Protocols</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={onCloseProfile}
                className="h-8 w-8 p-0"
              >
                ×
              </Button>
            </div>

            {/* Tab Navigation */}
            <div className="flex space-x-1 bg-slate-100 rounded-lg p-1">
              <Button
                variant={activeProfileTab === 'profile' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => onSetActiveProfileTab('profile')}
                className={`flex-1 text-sm ${activeProfileTab === 'profile' ? 'bg-teal-600 text-white shadow-sm hover:bg-teal-700' : 'hover:bg-slate-200'}`}
              >
                <User className="h-4 w-4 mr-2" />
                Profile
              </Button>
              <Button
                variant={activeProfileTab === 'protocols' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => onSetActiveProfileTab('protocols')}
                className={`flex-1 text-sm ${activeProfileTab === 'protocols' ? 'bg-teal-600 text-white shadow-sm hover:bg-teal-700' : 'hover:bg-slate-200'}`}
              >
                <FileText className="h-4 w-4 mr-2" />
                My Protocols ({userIndexProtocols.length + generatedProtocols.length})
              </Button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden">
            {activeProfileTab === 'profile' ? (
              /* Profile Tab */
              <div className="h-full flex flex-col">
                {/* User Info */}
                <div className="p-6 border-b border-slate-200">
                  <div className="flex items-center space-x-4">
                    <div className="h-16 w-16 bg-teal-100 rounded-full flex items-center justify-center">
                      {getProfileImageUrl() ? (
                        <img
                          src={getProfileImageUrl()!}
                          alt="Profile"
                          className="h-16 w-16 rounded-full object-cover"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            // Hide image if it fails to load
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <User className="h-8 w-8 text-teal-600" />
                      )}
                    </div>
                    <div className="flex-1">
                      {isRenaming ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={newDisplayName}
                            onChange={(e) => setNewDisplayName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveProfileRename();
                              if (e.key === 'Escape') handleCancelProfileRename();
                            }}
                            className="text-lg font-semibold text-slate-900 border border-teal-500 rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-teal-500"
                            placeholder="Enter your name"
                            autoFocus
                          />
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              onClick={handleSaveProfileRename}
                              className="h-6 text-xs bg-teal-600 hover:bg-teal-700"
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleCancelProfileRename}
                              className="h-6 text-xs"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <h3 className="text-lg font-semibold text-slate-900">
                            {currentUser?.displayName || 'User'}
                          </h3>
                          <p className="text-sm text-slate-600">{currentUser?.email}</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Profile Actions */}
                <div className="flex-1 p-6">
                  <div className="space-y-3">
                    <Button
                      variant="ghost"
                      className="w-full justify-start text-left"
                      onClick={handleStartProfileRename}
                      disabled={isRenaming}
                    >
                      <Edit2 className="h-4 w-4 mr-3" />
                      <div>
                        <div className="font-medium">Rename Account</div>
                        <div className="text-xs text-slate-500">Change your display name</div>
                      </div>
                    </Button>

                    <Button
                      variant="ghost"
                      className="w-full justify-start text-left"
                      onClick={handleUploadDocuments}
                      disabled={isRenaming}
                    >
                      {isUploading ? (
                        <Loader2 className="h-4 w-4 mr-3 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 mr-3" />
                      )}
                      <div>
                        <div className="font-medium">
                          {isUploading ? 'Upload in Progress...' : 'Upload Medical Documents'}
                        </div>
                        <div className="text-xs text-slate-500">
                          {isUploading
                            ? `${uploadProgress?.status === 'uploading' ? 'Uploading file...' : 'Processing documents...'}`
                            : 'Add your own protocols from PDFs'
                          }
                        </div>
                      </div>
                    </Button>

                    <Button
                      variant="ghost"
                      className="w-full justify-start text-left hover:bg-red-50 hover:text-red-600"
                      onClick={handleLogout}
                      disabled={isRenaming}
                    >
                      <LogOut className="h-4 w-4 mr-3" />
                      <div>
                        <div className="font-medium">Log Out</div>
                        <div className="text-xs text-slate-500">Sign out of your account</div>
                      </div>
                    </Button>

                    <Button
                      variant="ghost"
                      className="w-full justify-start text-left hover:bg-red-50 hover:text-red-600"
                      onClick={handleDeleteAccount}
                      disabled={isRenaming}
                    >
                      <UserX className="h-4 w-4 mr-3" />
                      <div>
                        <div className="font-medium">Delete Account</div>
                        <div className="text-xs text-slate-500">Permanently delete your account</div>
                      </div>
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              /* Protocols Tab */
              <div className="h-full flex flex-col">
                {/* Protocols Header */}
                <div className="p-6 border-b border-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">My Protocols</h3>
                      <p className="text-sm text-slate-600">
                        Your uploaded and generated protocols ({userIndexProtocols.length + generatedProtocols.length} total)
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleUploadDocuments}
                      className="flex items-center space-x-2"
                      disabled={isUploading}
                    >
                      {isUploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      <span>{isUploading ? 'Uploading...' : 'Upload'}</span>
                    </Button>
                  </div>
                </div>

                {/* Protocols List */}
                <div className="flex-1 overflow-y-auto p-6">
                  {(isLoadingSaved || isLoadingUploaded) ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 text-teal-600 animate-spin" />
                    </div>
                  ) : (savedError || uploadedError) ? (
                    <div className="text-xs text-red-600 mb-3 p-2 bg-red-50 rounded">
                      {savedError || uploadedError}
                    </div>
                  ) : userProtocols.length === 0 && !isUploading && userIndexProtocols.length === 0 && generatedProtocols.length === 0 ? (
                    <div className="text-center py-12">
                      <FileText className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                      <h4 className="text-lg font-medium text-slate-900 mb-2">No protocols yet</h4>
                      <p className="text-sm text-slate-600 mb-6">
                        Upload medical documents or save protocols from searches to see them here
                      </p>
                      <Button
                        onClick={handleUploadDocuments}
                        className="bg-teal-600 hover:bg-teal-700"
                        disabled={isUploading}
                      >
                        {isUploading ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4 mr-2" />
                        )}
                        {isUploading ? 'Upload in Progress...' : 'Upload Documents'}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* User's Protocol Index - Always show when user has protocols or is uploading */}
                      {(userIndexProtocols.length > 0 || isUploading || userProtocols.length > 0) && (
                        <Card
                          className="cursor-pointer hover:shadow-md transition-all duration-200 hover:border-teal-200 border-blue-200 bg-blue-50"
                          onClick={(e) => {
                            console.log('🎯 Protocol Index clicked!', { isUploading, uploadProgress: uploadProgress?.status });
                            e.preventDefault();
                            e.stopPropagation();
                            e.nativeEvent.stopImmediatePropagation();

                            // Call the handler with keepProfileOpen=true
                            onShowUserProtocolsIndex?.(true);
                          }}
                          style={{
                            pointerEvents: 'auto',
                            position: 'relative',
                            zIndex: 1000
                          }} // Ensure always clickable and on top
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <div className="h-10 w-10 bg-blue-100 rounded-lg flex items-center justify-center">
                                  <FileText className="h-5 w-5 text-blue-600" />
                                </div>
                                <div>
                                  <h4 className="text-sm font-medium text-slate-900">
                                    Your Protocol Index
                                  </h4>
                                  <p className="text-xs text-slate-600">
                                    {userIndexProtocols.length} protocols uploaded
                                  </p>
                                </div>
                              </div>
                              <div className="text-xl font-bold text-blue-600">
                                {userIndexProtocols.length}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Generated Protocols Summary - shown when protocols have been generated */}
                      {generatedProtocols.length > 0 && (
                        <Card
                          className="border-purple-200 bg-purple-50 cursor-pointer hover:bg-purple-100 transition-colors"
                          onClick={(e) => {
                            console.log('🎯 Generated Protocols clicked!');
                            e.preventDefault();
                            e.stopPropagation();
                            e.nativeEvent.stopImmediatePropagation();

                            // Call the handler with keepProfileOpen=true
                            if (generatedUploadId && generatedProtocols.length > 0) {
                              onShowGeneratedProtocols?.(generatedUploadId, generatedProtocols, true);
                            }
                          }}
                          style={{
                            pointerEvents: 'auto',
                            position: 'relative',
                            zIndex: 1000
                          }}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <div className="h-10 w-10 bg-purple-100 rounded-lg flex items-center justify-center">
                                  <Sparkles className="h-5 w-5 text-purple-600" />
                                </div>
                                <div>
                                  <h4 className="text-sm font-medium text-slate-900">
                                    Generated Protocols
                                  </h4>
                                  <p className="text-xs text-slate-600">
                                    {generatedProtocols.length} protocols generated
                                  </p>
                                </div>
                              </div>
                              <div className="text-xl font-bold text-purple-600">
                                {generatedProtocols.length}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}


                      {/* Quick Actions */}
                      <div className="border-t border-slate-200 pt-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleUploadDocuments}
                          className="w-full flex items-center justify-center space-x-2"
                          disabled={isUploading}
                        >
                          {isUploading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4" />
                          )}
                          <span>{isUploading ? 'Uploading...' : 'Upload Documents'}</span>
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Upload Documents Modal */}
      {showUploadModal && (
        <div className="absolute inset-0 bg-white z-[60] flex flex-col">
          {/* Upload Header */}
          <div className="p-6 border-b border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Upload Medical Documents</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowUploadModal(false)}
                className="h-8 w-8 p-0"
              >
                ×
              </Button>
            </div>
            <p className="text-sm text-slate-600">
              Upload ZIP files containing medical PDFs to create your personalized protocols
            </p>
          </div>

          {/* Upload Content */}
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="space-y-6">
              {/* Custom Prompt Input */}
              <div className="space-y-3">
                <div>
                  <label htmlFor="custom-prompt" className="block text-sm font-medium text-slate-900 mb-2">
                    Custom Processing Instructions (Optional)
                  </label>
                  <textarea
                    id="custom-prompt"
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="e.g., 'Focus on emergency protocols and include detailed contraindications' or 'Extract pediatric dosages and age-specific considerations'"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none text-sm"
                    rows={3}
                    disabled={isUploading}
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Provide specific instructions for how the AI should process and structure your medical documents into protocols.
                  </p>
                </div>
              </div>

              {/* File Upload Area */}
              <div
                className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-teal-400 transition-colors"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.add('border-teal-400', 'bg-teal-50');
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('border-teal-400', 'bg-teal-50');
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('border-teal-400', 'bg-teal-50');
                  const file = e.dataTransfer.files[0];
                  if (file) {
                    handleFileUpload(file);
                  }
                }}
              >
                <Upload className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-900 mb-2">
                  Drop your ZIP file here
                </h3>
                <p className="text-sm text-slate-600 mb-4">
                  or click to browse files
                </p>
                <input
                  type="file"
                  accept=".zip"
                  className="hidden"
                  id="file-upload"
                  disabled={isUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file && !isUploading) {
                      handleFileUpload(file);
                      // Reset input value so same file can be selected again
                      e.target.value = '';
                    }
                  }}
                />
                <label
                  htmlFor="file-upload"
                  className={`inline-flex items-center px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 cursor-pointer ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  style={{ pointerEvents: isUploading ? 'none' : 'auto' }}
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  {isUploading ? 'Upload in Progress...' : 'Choose ZIP File'}
                </label>
              </div>

              {/* Upload Requirements */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h4 className="font-medium text-slate-900 mb-2">Requirements:</h4>
                <ul className="text-sm text-slate-600 space-y-1">
                  <li>• ZIP file containing PDF documents only</li>
                  <li>• Maximum file size: 100MB</li>
                  <li>• PDFs should contain medical protocols or guidelines</li>
                  <li>• Processing may take 2-5 minutes depending on file size</li>
                </ul>
              </div>

              {/* Processing Status */}
              <div className="space-y-3">
                <h4 className="font-medium text-slate-900">Processing Status</h4>
                {uploadProgress ? (
                  <div className="bg-white border border-slate-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-slate-700">{uploadProgress.filename}</span>
                      <div className="flex items-center space-x-2">
                        <Badge
                          variant={
                            uploadProgress.status === 'completed' || uploadProgress.status === 'awaiting_approval' ? 'default' :
                            uploadProgress.status === 'error' || uploadProgress.status === 'cancelled' ? 'destructive' :
                            'secondary'
                          }
                          className={
                            uploadProgress.status === 'completed' || uploadProgress.status === 'awaiting_approval' ? 'bg-green-600' :
                            uploadProgress.status === 'error' ? 'bg-red-600' :
                            uploadProgress.status === 'cancelled' ? 'bg-gray-600' :
                            'bg-blue-600'
                          }
                        >
                          {uploadProgress.status === 'uploading' ? 'Uploading' :
                           uploadProgress.status === 'processing' ? 'Processing' :
                           uploadProgress.status === 'awaiting_approval' ? 'Ready for Review' :
                           uploadProgress.status === 'completed' ? 'Completed' :
                           uploadProgress.status === 'cancelled' ? 'Cancelled by user' :
                           uploadProgress.status === 'error' ? 'Error' :
                           uploadProgress.status}
                        </Badge>
                        {(uploadProgress.status === 'uploading' || uploadProgress.status === 'processing') && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCancelUpload}
                            className="h-6 text-xs text-red-600 border-red-200 hover:bg-red-50"
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    {(uploadProgress.status === 'uploading' || uploadProgress.status === 'processing') && (
                      <div className="space-y-2 mb-3">
                        <div className="flex items-center justify-between text-xs text-slate-600">
                          <span>Progress</span>
                          <span>{Math.round(uploadProgress.progress || 0)}%</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2">
                          <div
                            className="bg-teal-600 h-2 rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${uploadProgress.progress || 0}%` }}
                          ></div>
                        </div>
                      </div>
                    )}

                    {(uploadProgress.status === 'uploading' || uploadProgress.status === 'processing') && (
                      <div className="space-y-2">
                        <div className="flex items-center text-sm text-slate-600">
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {uploadProgress.status === 'uploading' ? 'Uploading file...' : 'Processing documents and generating protocols...'}
                        </div>
                        {uploadProgress.protocols_extracted !== undefined && (
                          <div className="text-xs text-slate-500">
                            Protocols extracted: {uploadProgress.protocols_extracted}
                          </div>
                        )}
                        {uploadProgress.protocols_indexed !== undefined && (
                          <div className="text-xs text-slate-500">
                            Protocols indexed: {uploadProgress.protocols_indexed}
                          </div>
                        )}
                      </div>
                    )}

                    {(uploadProgress.status === 'completed' || uploadProgress.status === 'awaiting_approval') && (
                      <div className="flex items-center text-sm text-green-600">
                        <div className="h-2 w-2 bg-green-500 rounded-full mr-2"></div>
                        {uploadProgress.status === 'awaiting_approval'
                          ? `Ready for review! ${uploadProgress.protocols_extracted || 0} protocols generated`
                          : `Successfully processed ${uploadProgress.protocols_extracted || 0} protocols`
                        }
                      </div>
                    )}

                    {uploadProgress.status === 'cancelled' && (
                      <div className="flex items-center text-sm text-gray-600">
                        <div className="h-2 w-2 bg-gray-500 rounded-full mr-2"></div>
                        Upload cancelled by user
                      </div>
                    )}

                    {uploadProgress.status === 'error' && uploadProgress.error && (
                      <div className="text-sm text-red-600 mt-2">
                        Error: {uploadProgress.error}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">
                    No files uploaded yet
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Protocol Regeneration Modal */}
      {showRegenerateModal && (
        <div className="absolute inset-0 bg-white z-50 flex flex-col">
          {/* Regenerate Header */}
          <div className="p-6 border-b border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Regenerate Protocol</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancelRegenerate}
                className="h-8 w-8 p-0"
              >
                ×
              </Button>
            </div>
            <p className="text-sm text-slate-600">
              Provide custom instructions to regenerate this protocol with different focus or requirements.
            </p>
          </div>

          {/* Regenerate Content */}
          <div className="flex-1 p-6">
            <div className="space-y-6">
              <div>
                <label htmlFor="regeneration-prompt" className="block text-sm font-medium text-slate-900 mb-2">
                  Custom Instructions
                </label>
                <textarea
                  id="regeneration-prompt"
                  value={regenerationPrompt}
                  onChange={(e) => setRegenerationPrompt(e.target.value)}
                  placeholder="e.g., 'Focus on emergency protocols and include detailed contraindications' or 'Extract pediatric dosages and age-specific considerations'"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none text-sm"
                  rows={4}
                />
                <p className="text-xs text-slate-500 mt-1">
                  Specify how you want the protocol to be regenerated. The AI will use these instructions to create a new version.
                </p>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <span className="text-yellow-600">⚠️</span>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-yellow-800">
                      Protocol Regeneration
                    </h3>
                    <div className="mt-2 text-sm text-yellow-700">
                      <p>This will create a new version of the protocol based on your instructions. The original will be replaced.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Regenerate Actions */}
          <div className="p-6 border-t border-slate-200 bg-slate-50">
            <div className="flex space-x-3">
              <Button
                onClick={handleCancelRegenerate}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmRegenerate}
                className="flex-1 bg-teal-600 hover:bg-teal-700 text-white"
                disabled={!regenerationPrompt.trim()}
              >
                {regeneratingProtocolId ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    🔄 Regenerate Protocol
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default Sidebar;
