import { useState, useEffect } from 'react';
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
  Settings,
  User,
  Plus,
  Loader2,
  MoreVertical,
  Trash2,
  Edit2
} from 'lucide-react';
// import { mockSavedProtocols } from '@/data/mockData';
import { useAuth } from '@/contexts/AuthContext';
import { getUserConversations, getSavedProtocols, deleteConversation, updateConversationTitle, deleteSavedProtocol, updateSavedProtocolTitle, ConversationListItem, SavedProtocol as ApiSavedProtocol } from '@/lib/api';

interface SidebarProps {
  onNewSearch: () => void;
  onRecentSearch: (conversationId: string) => void;
  onSavedProtocol: (protocolId: string, protocolData: any) => void;
  onLoadConversation?: (conversationId: string) => void;
  onConversationDeleted?: (conversationId: string) => void; // Notify parent when conversation is deleted
  refreshTrigger?: number;
  savedProtocolsRefreshTrigger?: number;
}

export default function Sidebar({ onNewSearch, onRecentSearch, onSavedProtocol, onLoadConversation, onConversationDeleted, refreshTrigger, savedProtocolsRefreshTrigger }: SidebarProps) {
  const { currentUser } = useAuth();
  const [recentConversations, setRecentConversations] = useState<ConversationListItem[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  const [savedProtocols, setSavedProtocols] = useState<ApiSavedProtocol[]>([]);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  const [savedError, setSavedError] = useState<string | null>(null);

  // Track if data has been loaded to prevent unnecessary refetches
  const [conversationsLoaded, setConversationsLoaded] = useState(false);
  const [savedProtocolsLoaded, setSavedProtocolsLoaded] = useState(false);

  // Track which conversation's menu is open and editing state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  // Track which protocol's menu is open and editing state
  const [openProtocolMenuId, setOpenProtocolMenuId] = useState<string | null>(null);
  const [editingProtocolId, setEditingProtocolId] = useState<string | null>(null);
  const [editProtocolTitle, setEditProtocolTitle] = useState('');

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (openMenuId) setOpenMenuId(null);
      if (openProtocolMenuId) setOpenProtocolMenuId(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [openMenuId, openProtocolMenuId]);

  // Fetch conversations when user changes or refreshTrigger updates
  useEffect(() => {
    if (currentUser) {
      // Only reload if not already loaded
      if (!conversationsLoaded) {
        loadConversations();
      }
    } else {
      // Reset when user logs out
      setRecentConversations([]);
      setConversationsLoaded(false);
    }
  }, [currentUser, refreshTrigger]);

  // Fetch saved protocols only when savedProtocolsRefreshTrigger changes
  useEffect(() => {
    const loadSaved = async () => {
      if (!currentUser) return;

      // Prevent redundant fetches
      if (isLoadingSaved) return;

      setIsLoadingSaved(true);
      setSavedError(null);
      try {
        const res = await getSavedProtocols(currentUser.uid, 50);
        if (res.success) {
          setSavedProtocols(res.protocols || []);
          setSavedProtocolsLoaded(true);
        } else {
          setSavedError(res.error || 'Failed to load saved checklists');
        }
      } catch (err: any) {
        setSavedError(err.message || 'Failed to load saved checklists');
      } finally {
        setIsLoadingSaved(false);
      }
    };

    if (currentUser) {
      // Only load if not already loaded
      if (!savedProtocolsLoaded) {
        loadSaved();
      }
    } else {
      // Reset when user logs out
      setSavedProtocols([]);
      setSavedProtocolsLoaded(false);
    }
  }, [currentUser, savedProtocolsRefreshTrigger]);

  const loadConversations = async () => {
    if (!currentUser) return;

    // Prevent redundant fetches
    if (isLoadingConversations) return;

    setIsLoadingConversations(true);
    setConversationsError(null);

    try {
      const response = await getUserConversations(currentUser.uid, 10);
      if (response.success) {
        setRecentConversations(response.conversations);
        setConversationsLoaded(true);
      } else {
        setConversationsError(response.error || 'Failed to load conversations');
      }
    } catch (error: any) {
      console.error('Error loading conversations:', error);
      setConversationsError(error.message || 'Failed to load conversations');
    } finally {
      setIsLoadingConversations(false);
    }
  };

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

  const handleDeleteConversation = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!currentUser) return;
    if (!confirm('Are you sure you want to delete this conversation?')) return;

    try {
      await deleteConversation(currentUser.uid, conversationId);
      // Remove from local state
      setRecentConversations(prev => prev.filter(c => c.id !== conversationId));
      setOpenMenuId(null);

      // Notify parent to clear from cache
      if (onConversationDeleted) {
        onConversationDeleted(conversationId);
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      alert('Failed to delete conversation');
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
      // Update local state
      setRecentConversations(prev =>
        prev.map(c => c.id === conversationId ? { ...c, title: editTitle.trim() } : c)
      );
      setEditingId(null);
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
  const handleDeleteProtocol = async (protocolId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!currentUser) return;
    if (!confirm('Are you sure you want to delete this saved protocol?')) return;

    try {
      await deleteSavedProtocol(currentUser.uid, protocolId);
      // Remove from local state
      setSavedProtocols(prev => prev.filter(p => p.id !== protocolId));
      setOpenProtocolMenuId(null);
    } catch (error) {
      console.error('Failed to delete protocol:', error);
      alert('Failed to delete protocol');
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
      // Update local state
      setSavedProtocols(prev =>
        prev.map(p => p.id === protocolId ? { ...p, title: editProtocolTitle.trim() } : p)
      );
      setEditingProtocolId(null);
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
                    onClick={() => editingProtocolId !== p.id && onSavedProtocol(p.id, p.protocol_data)}
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
        <div className="space-y-2">
          <Button variant="ghost" className="w-full justify-start">
            <User className="h-4 w-4 mr-2" />
            Profile
          </Button>
          <Button variant="ghost" className="w-full justify-start">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </div>
      </div>
    </div>
  );
}
