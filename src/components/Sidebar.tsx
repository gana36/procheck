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
  Loader2
} from 'lucide-react';
// import { mockSavedProtocols } from '@/data/mockData';
import { useAuth } from '@/contexts/AuthContext';
import { getUserConversations, getSavedProtocols, ConversationListItem, SavedProtocol as ApiSavedProtocol } from '@/lib/api';

interface SidebarProps {
  onNewSearch: () => void;
  onRecentSearch: (conversationId: string) => void;
  onSavedProtocol: (protocolId: string, protocolData: any) => void;
  refreshTrigger?: number;
  savedProtocolsRefreshTrigger?: number;
}

export default function Sidebar({ onNewSearch, onRecentSearch, onSavedProtocol, refreshTrigger, savedProtocolsRefreshTrigger }: SidebarProps) {
  const { currentUser } = useAuth();
  const [recentConversations, setRecentConversations] = useState<ConversationListItem[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  const [savedProtocols, setSavedProtocols] = useState<ApiSavedProtocol[]>([]);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  const [savedError, setSavedError] = useState<string | null>(null);

  // Fetch conversations when user changes or sidebar mounts
  useEffect(() => {
    if (currentUser) {
      loadConversations();
    }
  }, [currentUser, refreshTrigger]);

  // Fetch saved protocols
  useEffect(() => {
    const loadSaved = async () => {
      if (!currentUser) return;
      setIsLoadingSaved(true);
      setSavedError(null);
      try {
        const res = await getSavedProtocols(currentUser.uid, 50);
        if (res.success) {
          setSavedProtocols(res.protocols || []);
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
      loadSaved();
    }
  }, [currentUser, savedProtocolsRefreshTrigger]);

  const loadConversations = async () => {
    if (!currentUser) return;

    setIsLoadingConversations(true);
    setConversationsError(null);
    
    try {
      const response = await getUserConversations(currentUser.uid, 10);
      if (response.success) {
        setRecentConversations(response.conversations);
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

  return (
    <div className="w-80 bg-white border-r border-slate-200 h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-slate-200">
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

      {/* Recent Searches */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Search className="h-4 w-4 text-slate-600" />
              <h3 className="text-sm font-semibold text-slate-900">Recent Searches</h3>
            </div>
            {isLoadingConversations && (
              <Loader2 className="h-4 w-4 text-slate-400 animate-spin" />
            )}
          </div>
          
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
                  className="cursor-pointer hover:shadow-md transition-all duration-200 hover:border-teal-200"
                  onClick={() => onRecentSearch(conversation.id)}
                >
                  <CardContent className="p-3">
                    <p className="text-sm font-medium text-slate-900 mb-2 line-clamp-2">
                      {conversation.title}
                    </p>
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
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>

        {/* Saved Protocols */}
        <div className="px-6 pb-6">
          <div className="flex items-center space-x-2 mb-4">
            <Star className="h-4 w-4 text-slate-600" />
            <h3 className="text-sm font-semibold text-slate-900">Saved Checklists</h3>
          </div>
          
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
                  className="cursor-pointer hover:shadow-md transition-all duration-200 hover:border-teal-200"
                  onClick={() => onSavedProtocol(p.id, p.protocol_data)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="text-sm font-medium text-slate-900 line-clamp-2 flex-1">
                        {p.title}
                      </h4>
                      <Star className="h-4 w-4 text-yellow-500 fill-current flex-shrink-0 ml-2" />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="font-medium text-slate-600">{p.organization}</span>
                      <span>{p.saved_at}</span>
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
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-6 border-t border-slate-200">
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
