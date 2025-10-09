import { useState, useEffect, memo, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
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
  UserX
} from 'lucide-react';
// import { mockSavedProtocols } from '@/data/mockData';
import { useAuth } from '@/contexts/AuthContext';
import { getUserConversations, getSavedProtocols, getSavedProtocol, deleteConversation, updateConversationTitle, deleteSavedProtocol, updateSavedProtocolTitle, ConversationListItem, SavedProtocol as ApiSavedProtocol } from '@/lib/api';
import { updateProfile } from 'firebase/auth';

interface SidebarProps {
  onNewSearch: () => void;
  onRecentSearch: (conversationId: string) => void;
  onSavedProtocol: (protocolId: string, protocolData: any) => void;
  onConversationDeleted?: (conversationId: string) => void; // Notify parent when conversation is deleted
  savedProtocolsRefreshTrigger?: number;
  onShowLogoutModal?: () => void;
  onShowDeleteModal?: () => void;
}

// Global cache to persist data completely outside React
const globalDataCache = {
  userId: null as string | null,
  conversations: [] as ConversationListItem[],
  protocols: [] as ApiSavedProtocol[],
  isLoading: false
};

const Sidebar = memo(function Sidebar({ onNewSearch, onRecentSearch, onSavedProtocol, onConversationDeleted, savedProtocolsRefreshTrigger, onShowLogoutModal, onShowDeleteModal }: SidebarProps) {
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

  // Track if data has been loaded to prevent redundant API calls
  // Using refs to avoid recreating callbacks when these change
  const conversationsLoadedRef = useRef(false);
  const savedProtocolsLoadedRef = useRef(false);
  const isLoadingConversationsRef = useRef(false);
  const isLoadingSavedRef = useRef(false);

  // Track which conversation's menu is open and editing state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  // Track which protocol's menu is open and editing state
  const [openProtocolMenuId, setOpenProtocolMenuId] = useState<string | null>(null);
  const [editingProtocolId, setEditingProtocolId] = useState<string | null>(null);
  const [editProtocolTitle, setEditProtocolTitle] = useState('');

  // Profile modal state
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState('');

  // Confirmation dialogs
  const [showDeleteConversationDialog, setShowDeleteConversationDialog] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const [showDeleteProtocolDialog, setShowDeleteProtocolDialog] = useState(false);
  const [protocolToDelete, setProtocolToDelete] = useState<string | null>(null);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

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

  // Wrap in useCallback with NO dependencies - use userId from closure
  const loadConversations = useCallback(async (force: boolean = false) => {
    
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
        console.log('✅ Conversations loaded successfully');
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
        console.log('✅ Saved protocols loaded successfully');
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

  // Load data when user logs in - simple and bulletproof
  useEffect(() => {
    // Load if: userId changed OR we have no data yet
    const hasData = recentConversations.length > 0 || savedProtocols.length > 0;
    const userChanged = globalDataCache.userId !== userId;
    const shouldLoad = userChanged || (userId && !hasData);
    
    if (!shouldLoad || globalDataCache.isLoading) {
      return;
    }
    
    // Update global cache
    globalDataCache.userId = userId;
    
    if (userId) {
      globalDataCache.isLoading = true;
      
      Promise.all([
        loadConversations(true),
        loadSavedProtocols(true)
      ]).finally(() => {
        globalDataCache.isLoading = false;
      });
    } else {
      // Clear on logout
      setRecentConversations([]);
      setSavedProtocols([]);
      globalDataCache.conversations = [];
      globalDataCache.protocols = [];
      conversationsLoadedRef.current = false;
      savedProtocolsLoadedRef.current = false;
    }
  }, [userId, loadConversations, loadSavedProtocols, recentConversations.length, savedProtocols.length]);

  // Handle refresh trigger - only when trigger value changes
  const lastRefreshTriggerRef = useRef(0);
  useEffect(() => {
    const triggerValue = savedProtocolsRefreshTrigger || 0;
    // Refresh trigger effect
    
    // Only reload if trigger actually changed and is greater than 0
    if (triggerValue > 0 && triggerValue !== lastRefreshTriggerRef.current) {
      console.log('🔄 Refresh trigger detected, reloading saved protocols...');
      lastRefreshTriggerRef.current = triggerValue;
      // Force reload when explicitly triggered
      loadSavedProtocols(true);
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
    setConversationToDelete(conversationId);
    setShowDeleteConversationDialog(true);
  };

  const confirmDeleteConversation = async () => {
    if (!currentUser || !conversationToDelete) return;
    
    try {
      await deleteConversation(currentUser.uid, conversationToDelete);
      // Remove from local state - no need to reload from server
      setRecentConversations(prev => prev.filter(c => c.id !== conversationToDelete));
      setOpenMenuId(null);
      console.log('✅ Conversation deleted locally, no API reload needed');

      // Notify parent to clear from cache
      if (onConversationDeleted) {
        onConversationDeleted(conversationToDelete);
      }
      
      setShowDeleteConversationDialog(false);
      setConversationToDelete(null);
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      setShowDeleteConversationDialog(false);
      setErrorMessage('Failed to delete conversation');
      setShowErrorDialog(true);
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
      setRecentConversations(prev =>
        prev.map(c => c.id === conversationId ? { ...c, title: editTitle.trim() } : c)
      );
      setEditingId(null);
      console.log('✅ Conversation renamed locally, no API reload needed');
    } catch (error) {
      console.error('Failed to rename conversation:', error);
      setErrorMessage('Failed to rename conversation');
      setShowErrorDialog(true);
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
    setProtocolToDelete(protocolId);
    setShowDeleteProtocolDialog(true);
  };

  const confirmDeleteProtocol = async () => {
    if (!currentUser || !protocolToDelete) return;
    
    try {
      await deleteSavedProtocol(currentUser.uid, protocolToDelete);
      // Remove from local state - no need to reload from server
      setSavedProtocols(prev => prev.filter(p => p.id !== protocolToDelete));
      setOpenProtocolMenuId(null);
      console.log('✅ Protocol deleted locally, no API reload needed');
      
      setShowDeleteProtocolDialog(false);
      setProtocolToDelete(null);
    } catch (error) {
      console.error('Failed to delete protocol:', error);
      setShowDeleteProtocolDialog(false);
      setErrorMessage('Failed to delete protocol');
      setShowErrorDialog(true);
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
      setSavedProtocols(prev =>
        prev.map(p => p.id === protocolId ? { ...p, title: editProtocolTitle.trim() } : p)
      );
      setEditingProtocolId(null);
      console.log('✅ Protocol renamed locally, no API reload needed');
    } catch (error) {
      console.error('Failed to rename protocol:', error);
      setErrorMessage('Failed to rename protocol');
      setShowErrorDialog(true);
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

    try {
      // Only call getSavedProtocol API - this is necessary to get full protocol data
      console.log('🔄 [API CALL] Starting getSavedProtocol (required for protocol data)...');
      const response = await getSavedProtocol(currentUser.uid, protocolId);
      console.log('🔄 [API CALL] getSavedProtocol completed');
      if (response.success && response.protocol) {
        console.log('✅ Protocol data fetched, calling onSavedProtocol');
        onSavedProtocol(protocolId, response.protocol.protocol_data);
      } else {
        console.error('❌ Failed to load saved protocol:', response.error);
        // Fallback: try to find in the current list
        const protocol = savedProtocols.find(p => p.id === protocolId);
        if (protocol) {
          console.log('🔄 Using fallback protocol data');
          onSavedProtocol(protocolId, null);
        }
      }
    } catch (error) {
      console.error('❌ Error loading saved protocol:', error);
      // Fallback: try to find in the current list
      const protocol = savedProtocols.find(p => p.id === protocolId);
      if (protocol) {
        console.log('🔄 Using fallback protocol data (error case)');
        onSavedProtocol(protocolId, null);
      }
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
      setSuccessMessage('Name updated successfully!');
      setShowSuccessDialog(true);
    } catch (error) {
      console.error('Failed to update name:', error);
      setErrorMessage('Failed to update name. Please try again.');
      setShowErrorDialog(true);
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


  return (
    <div className="w-80 bg-white border-r border-slate-200 h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2 bg-teal-100 rounded-lg">
            <Stethoscope className="h-5 w-5 text-teal-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">ProCheck</h2>
            <Badge variant="secondary" className="bg-teal-100 text-teal-700 text-xs">
              Beta
            </Badge>
          </div>
        </div>
        <Button 
          onClick={onNewSearch}
          className="w-full bg-teal-600 hover:bg-teal-700 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Protocol Search
        </Button>
      </div>

      {/* Content Area - Split into two scrollable sections */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Saved Protocols Section - Takes up half */}
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
                    className="group relative cursor-pointer hover:shadow-md transition-all duration-200 hover:border-teal-200"
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

        {/* Recent Searches Section - Takes up half */}
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
                  className="group relative cursor-pointer hover:shadow-md transition-all duration-200 hover:border-teal-200"
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

      {/* Footer */}
      <div className="p-6 border-t border-slate-200 flex-shrink-0">
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={() => setIsProfileOpen(true)}
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
      </div>

      {/* Profile Modal */}
      {isProfileOpen && (
        <div className="absolute inset-0 bg-white z-50 flex flex-col">
          {/* Profile Header */}
          <div className="p-6 border-b border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Profile</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsProfileOpen(false)}
                className="h-8 w-8 p-0"
              >
                ×
              </Button>
            </div>

            {/* User Info */}
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
      )}

      {/* Delete Conversation Confirmation Dialog */}
      <AlertDialog open={showDeleteConversationDialog} onOpenChange={setShowDeleteConversationDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this conversation? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteConversation} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Protocol Confirmation Dialog */}
      <AlertDialog open={showDeleteProtocolDialog} onOpenChange={setShowDeleteProtocolDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from Saved?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this protocol from your saved checklists?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteProtocol} className="bg-red-600 hover:bg-red-700">
              Remove
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

      {/* Success Dialog */}
      <AlertDialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Success</AlertDialogTitle>
            <AlertDialogDescription>
              {successMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowSuccessDialog(false)} className="bg-teal-600 hover:bg-teal-700">
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});

export default Sidebar;
