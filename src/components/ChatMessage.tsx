import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Stethoscope, User, Zap, Search, Clock, 
  AlertTriangle, Activity, Pill, Microscope, Shield, FileText,
  CheckCircle2, Info
} from 'lucide-react';
import { Message } from '@/types';
import ProtocolCard from './ProtocolCard';

interface ChatMessageProps {
  message: Message;
}

// Detect query intent from message content
const detectIntent = (content: string): string => {
  const c = content.toLowerCase();
  if (c.includes('emergency') || c.includes('urgent') || c.includes('attack') || c.includes('crisis')) return 'emergency';
  if (c.includes('symptom') || c.includes('sign')) return 'symptoms';
  if (c.includes('treatment') || c.includes('therapy') || c.includes('medication')) return 'treatment';
  if (c.includes('diagnosis') || c.includes('test')) return 'diagnosis';
  if (c.includes('prevention') || c.includes('prevent')) return 'prevention';
  return 'general';
};

// Theme configurations for different intents
const intentThemes = {
  emergency: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: AlertTriangle,
    iconColor: 'text-red-600',
    iconBg: 'bg-red-100',
    badge: 'bg-red-600',
    badgeText: 'Emergency Protocol',
    accent: 'border-l-4 border-l-red-500'
  },
  symptoms: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: Activity,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-100',
    badge: 'bg-blue-600',
    badgeText: 'Symptom Guide',
    accent: 'border-l-4 border-l-blue-500'
  },
  treatment: {
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    icon: Pill,
    iconColor: 'text-purple-600',
    iconBg: 'bg-purple-100',
    badge: 'bg-purple-600',
    badgeText: 'Treatment Protocol',
    accent: 'border-l-4 border-l-purple-500'
  },
  diagnosis: {
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    icon: Microscope,
    iconColor: 'text-indigo-600',
    iconBg: 'bg-indigo-100',
    badge: 'bg-indigo-600',
    badgeText: 'Diagnostic Guide',
    accent: 'border-l-4 border-l-indigo-500'
  },
  prevention: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    icon: Shield,
    iconColor: 'text-green-600',
    iconBg: 'bg-green-100',
    badge: 'bg-green-600',
    badgeText: 'Prevention Guide',
    accent: 'border-l-4 border-l-green-500'
  },
  general: {
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    icon: FileText,
    iconColor: 'text-slate-600',
    iconBg: 'bg-slate-100',
    badge: 'bg-slate-600',
    badgeText: 'Medical Protocol',
    accent: 'border-l-4 border-l-slate-500'
  }
};

export default function ChatMessage({ message }: ChatMessageProps) {
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (message.type === 'user') {
    return (
      <div className="flex justify-end mb-6">
        <div className="max-w-[75%]">
          <div className="flex items-end justify-end space-x-3">
            <Card className="bg-gradient-to-br from-teal-600 to-teal-700 text-white border-0 shadow-md">
              <CardContent className="p-4">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
              </CardContent>
            </Card>
            <div className="flex-shrink-0">
              <div className="w-9 h-9 bg-gradient-to-br from-teal-600 to-teal-700 rounded-full flex items-center justify-center shadow-sm">
                <User className="h-4 w-4 text-white" />
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2 text-right">
            {formatTime(message.timestamp)}
          </p>
        </div>
      </div>
    );
  }

  // Detect intent for theming
  const intent = detectIntent(message.content);
  const theme = intentThemes[intent as keyof typeof intentThemes] || intentThemes.general;
  const ThemeIcon = theme.icon;

  return (
    <div className="flex justify-start mb-6">
      <div className="max-w-[95%] w-full">
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0 mt-1">
            <div className={`w-10 h-10 ${theme.iconBg} rounded-full flex items-center justify-center shadow-sm`}>
              <ThemeIcon className={`h-5 w-5 ${theme.iconColor}`} />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            {/* Header with metadata */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <h4 className="font-semibold text-slate-900">ProCheck AI</h4>
                <Badge className={`${theme.badge} text-white text-xs`}>
                  {theme.badgeText}
                </Badge>
              </div>
              <span className="text-xs text-slate-500">{formatTime(message.timestamp)}</span>
            </div>
            
            {/* Search Metadata */}
            {message.searchMetadata && (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Badge className="bg-gradient-to-r from-teal-500 to-blue-500 text-white border-0 shadow-sm">
                  <Zap className="h-3 w-3 mr-1" />
                  Hybrid AI Search
                </Badge>
                <Badge variant="outline" className="border-slate-300 text-slate-700 bg-white">
                  <Search className="h-3 w-3 mr-1" />
                  {message.searchMetadata.totalResults} sources
                </Badge>
                <Badge variant="outline" className="border-slate-300 text-slate-700 bg-white">
                  <Clock className="h-3 w-3 mr-1" />
                  {message.searchMetadata.responseTimes}ms
                </Badge>
              </div>
            )}
            
            {/* Content Card with Theme */}
            {message.content && (
              <Card className={`${theme.bg} ${theme.border} ${theme.accent} shadow-sm mb-4`}>
                <CardContent className="p-5">
                  <div className="flex items-start space-x-3">
                    <Info className={`h-5 w-5 ${theme.iconColor} flex-shrink-0 mt-0.5`} />
                    <p className="text-sm leading-relaxed text-slate-800 font-medium">
                      {message.content}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* Protocol Data with Enhanced Display */}
            {message.protocolData && (
              <ProtocolCard protocolData={message.protocolData} intent={intent} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
