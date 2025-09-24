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
import { mockRecentSearches, mockSavedProtocols } from '@/data/mockData';

interface SidebarProps {
  onNewSearch: () => void;
  onRecentSearch: (query: string) => void;
  onSavedProtocol: (protocolId: string) => void;
}

export default function Sidebar({ onNewSearch, onRecentSearch, onSavedProtocol }: SidebarProps) {
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
          
          <div className="space-y-3">
            {mockRecentSearches.map((search) => (
              <Card 
                key={search.id}
                className="cursor-pointer hover:shadow-md transition-all duration-200 hover:border-teal-200"
                onClick={() => onRecentSearch(search.query)}
              >
                <CardContent className="p-3">
                  <p className="text-sm font-medium text-slate-900 mb-2 line-clamp-2">
                    {search.query}
                  </p>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center space-x-1">
                        <Clock className="h-3 w-3" />
                        <span>{search.timestamp}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <MapPin className="h-3 w-3" />
                        <span>{search.region}</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Calendar className="h-3 w-3" />
                      <span>{search.year}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Saved Protocols */}
        <div className="px-6 pb-6">
          <div className="flex items-center space-x-2 mb-4">
            <Star className="h-4 w-4 text-slate-600" />
            <h3 className="text-sm font-semibold text-slate-900">Saved Checklists</h3>
          </div>
          
          <div className="space-y-3">
            {mockSavedProtocols.map((protocol) => (
              <Card 
                key={protocol.id}
                className="cursor-pointer hover:shadow-md transition-all duration-200 hover:border-teal-200"
                onClick={() => onSavedProtocol(protocol.id)}
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
                    <span>{protocol.savedDate}</span>
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
