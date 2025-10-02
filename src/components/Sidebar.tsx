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
  Plus
} from 'lucide-react';
import { getUserConversations, ConversationListItem, getSavedProtocols, SavedProtocol } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface SidebarProps {
  onNewSearch: () => void;
  onRecentSearch: (conversationId: string) => void; // Changed to pass conversation ID
  onSavedProtocol: (protocolId: string, protocolData: any) => void;
  refreshTrigger?: number; // Used to trigger refresh when conversations are updated
  savedProtocolsRefreshTrigger?: number; // Used to trigger refresh when protocols are saved/unsaved
}

export default function Sidebar({ onNewSearch, onRecentSearch, onSavedProtocol, refreshTrigger, savedProtocolsRefreshTrigger }: SidebarProps) {
  const { currentUser } = useAuth();
  const [recentConversations, setRecentConversations] = useState<ConversationListItem[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [savedProtocols, setSavedProtocols] = useState<SavedProtocol[]>([]);
  const [isLoadingProtocols, setIsLoadingProtocols] = useState(true);

  // Fetch recent conversations when component mounts, user changes, or refreshTrigger updates
  useEffect(() => {
    const fetchConversations = async () => {
      if (!currentUser) {
        setRecentConversations([]);
        setIsLoadingConversations(false);
        return;
      }

      try {
        setIsLoadingConversations(true);
        const response = await getUserConversations(currentUser.uid, 5);
        if (response.success) {
          setRecentConversations(response.conversations);
        }
      } catch (error) {
        console.error('Failed to fetch conversations:', error);
        setRecentConversations([]);
      } finally {
        setIsLoadingConversations(false);
      }
    };

    fetchConversations();
  }, [currentUser, refreshTrigger]);

  // Fetch saved protocols when component mounts, user changes, or savedProtocolsRefreshTrigger updates
  useEffect(() => {
    const fetchProtocols = async () => {
      if (!currentUser) {
        setSavedProtocols([]);
        setIsLoadingProtocols(false);
        return;
      }

      try {
        setIsLoadingProtocols(true);
        const response = await getSavedProtocols(currentUser.uid, 10);
        if (response.success) {
          setSavedProtocols(response.protocols);
        }
      } catch (error) {
        console.error('Failed to fetch saved protocols:', error);
        setSavedProtocols([]);
      } finally {
        setIsLoadingProtocols(false);
      }
    };

    fetchProtocols();
  }, [currentUser, savedProtocolsRefreshTrigger]);

  // Helper function to format timestamp
  const formatTimestamp = (isoString: string): string => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    return date.toLocaleDateString();
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
          <div className="flex items-center space-x-2 mb-4">
            <Search className="h-4 w-4 text-slate-600" />
            <h3 className="text-sm font-semibold text-slate-900">Recent Searches</h3>
          </div>

          {isLoadingConversations ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600"></div>
            </div>
          ) : recentConversations.length === 0 ? (
            <div className="text-center py-8 text-sm text-slate-500">
              No recent searches yet
            </div>
          ) : (
            <div className="space-y-3">
              {recentConversations.map((conversation) => (
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
                          <span>{conversation.message_count} messages</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Saved Protocols */}
        <div className="px-6 pb-6">
          <div className="flex items-center space-x-2 mb-4">
            <Star className="h-4 w-4 text-slate-600" />
            <h3 className="text-sm font-semibold text-slate-900">Saved Checklists</h3>
          </div>

          {isLoadingProtocols ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600"></div>
            </div>
          ) : savedProtocols.length === 0 ? (
            <div className="text-center py-8 text-sm text-slate-500">
              No saved protocols yet
            </div>
          ) : (
            <div className="space-y-3">
              {savedProtocols.map((protocol) => (
                <Card
                  key={protocol.id}
                  className="cursor-pointer hover:shadow-md transition-all duration-200 hover:border-teal-200"
                  onClick={() => onSavedProtocol(protocol.id, protocol.protocol_data)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="text-sm font-medium text-slate-900 line-clamp-2 flex-1">
                        {protocol.title}
                      </h4>
                      <Star className="h-4 w-4 text-yellow-500 fill-current flex-shrink-0 ml-2" />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="font-medium text-slate-600">{protocol.organization}</span>
                      <span>{formatTimestamp(protocol.saved_at)}</span>
                    </div>
                    <div className="flex items-center space-x-2 mt-2 text-xs text-slate-500">
                      <div className="flex items-center space-x-1">
                        <MapPin className="h-3 w-3" />
                        <span>{protocol.region}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Calendar className="h-3 w-3" />
                        <span>{protocol.year}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
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
