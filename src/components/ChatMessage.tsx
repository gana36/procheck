import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  User, Search, Clock, FileText, Pill, Stethoscope, AlertTriangle, Timer, Shield, MessageSquare
} from 'lucide-react';
import { Message } from '@/types';
import ProtocolCard from './ProtocolCard';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMessageProps {
  message: Message;
  onSaveToggle?: () => void;
  onProtocolUpdate?: (updatedProtocol: any) => void;
  onFollowUpClick?: (question: string) => void;
  isFirstUserMessage?: boolean;
  isProtocolAlreadySaved?: boolean;
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

// Theme configurations for different intents - Professional medical colors
const intentThemes = {
  emergency: {
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    icon: FileText,
    iconColor: 'text-slate-700',
    iconBg: 'bg-slate-100',
    badge: 'bg-slate-700',
    badgeText: 'Emergency Protocol',
    accent: 'border-l-4 border-l-slate-600'
  },
  symptoms: {
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    icon: FileText,
    iconColor: 'text-slate-700',
    iconBg: 'bg-slate-100',
    badge: 'bg-slate-700',
    badgeText: 'Symptom Guide',
    accent: 'border-l-4 border-l-slate-600'
  },
  treatment: {
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    icon: FileText,
    iconColor: 'text-slate-700',
    iconBg: 'bg-slate-100',
    badge: 'bg-slate-700',
    badgeText: 'Treatment Protocol',
    accent: 'border-l-4 border-l-slate-600'
  },
  diagnosis: {
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    icon: FileText,
    iconColor: 'text-slate-700',
    iconBg: 'bg-slate-100',
    badge: 'bg-slate-700',
    badgeText: 'Diagnostic Guide',
    accent: 'border-l-4 border-l-slate-600'
  },
  prevention: {
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    icon: FileText,
    iconColor: 'text-slate-700',
    iconBg: 'bg-slate-100',
    badge: 'bg-slate-700',
    badgeText: 'Prevention Guide',
    accent: 'border-l-4 border-l-slate-600'
  },
  general: {
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    icon: FileText,
    iconColor: 'text-slate-700',
    iconBg: 'bg-slate-100',
    badge: 'bg-slate-700',
    badgeText: 'Medical Protocol',
    accent: 'border-l-4 border-l-slate-600'
  }
};


const categoryIcons = {
  dosage: Pill,
  symptoms: Stethoscope,
  complications: AlertTriangle,
  timing: Timer,
  safety: Shield,
  general: MessageSquare
};

// Helper function to strip markdown formatting from text
const stripMarkdown = (text: string): string => {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1') // Remove **bold**
    .replace(/\*(.*?)\*/g, '$1')     // Remove *italic*
    .replace(/`(.*?)`/g, '$1')       // Remove `code`
    .replace(/#{1,6}\s/g, '')        // Remove # headers
    .replace(/^\s*[-*+]\s/gm, '')    // Remove bullet points
    .replace(/^\s*\d+\.\s/gm, '')    // Remove numbered lists
    .trim();
};

export default function ChatMessage({ message, onSaveToggle, onProtocolUpdate, onFollowUpClick, isFirstUserMessage = false, isProtocolAlreadySaved = false }: ChatMessageProps) {

  if (message.type === 'user') {
    return (
      <div className={`flex justify-end mb-6 ${isFirstUserMessage ? 'sticky top-0 z-30 bg-slate-50 pb-4 pt-4 border-b border-slate-200 shadow-sm' : ''}`}>
        <div className="max-w-[75%]">
          <div className="flex items-end justify-end space-x-3">
            <Card className="bg-slate-700 text-white border-0 shadow-md">
              <CardContent className="p-4">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
              </CardContent>
            </Card>
            <div className="flex-shrink-0">
              <div className="w-9 h-9 bg-slate-700 rounded-full flex items-center justify-center shadow-sm">
                <User className="h-4 w-4 text-white" />
              </div>
            </div>
          </div>
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
            <div className="flex items-center space-x-2 mb-3">
              <h4 className="font-semibold text-slate-900">ProCheck AI</h4>
              <Badge className={`${theme.badge} text-white text-xs`}>
                {theme.badgeText}
              </Badge>
            </div>
            
            {/* Search Metadata */}
            {message.searchMetadata && (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Badge className="bg-slate-700 text-white border-0 shadow-sm">
                  Hybrid Search
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
                    {(() => {
                      const IconComponent = theme.icon;
                      return <IconComponent className={`h-5 w-5 ${theme.iconColor} flex-shrink-0 mt-0.5`} />;
                    })()}
                    <div className="text-sm leading-relaxed text-slate-800 font-medium prose prose-sm prose-slate max-w-none">
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={{
                          // Style paragraphs
                          p: ({children}) => <p className="mb-3 last:mb-0 text-slate-800">{children}</p>,
                          // Style lists
                          ul: ({children}) => <ul className="list-disc list-inside mb-3 space-y-1 text-slate-700">{children}</ul>,
                          ol: ({children}) => <ol className="list-decimal list-inside mb-3 space-y-1 text-slate-700">{children}</ol>,
                          li: ({children}) => <li className="text-slate-700">{children}</li>,
                          // Style strong/bold - make them stand out more
                          strong: ({children}) => <strong className="font-bold text-slate-900 bg-yellow-100 px-1 py-0.5 rounded border border-yellow-200">{children}</strong>,
                          // Style emphasis/italic
                          em: ({children}) => <em className="italic text-slate-700">{children}</em>,
                          // Style code
                          code: ({children}) => <code className="bg-slate-200 px-2 py-1 rounded text-xs font-mono text-slate-800">{children}</code>,
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* Protocol Data with Enhanced Display */}
            {message.protocolData && (() => {
              const protocolIntent = (message.protocolData as any)?.intent || intent;
              // Determine if this is a user protocol vs global protocol
              // TODO: This will come from the protocol data in the future
              const protocolSource: 'global' | 'user' =
                message.content.startsWith('Saved:') ||
                (message.protocolData as any)?.source_type === 'user'
                  ? 'user'
                  : 'global';

              return (
                <ProtocolCard
                  protocolData={message.protocolData}
                  onSaveToggle={onSaveToggle}
                  onProtocolUpdate={onProtocolUpdate}
                  intent={protocolIntent as 'emergency' | 'symptoms' | 'treatment' | 'diagnosis' | 'prevention' | 'general'}
                  isAlreadySaved={isProtocolAlreadySaved}
                  protocolSource={protocolSource}
                />
              );
            })()}

            {/* Follow-up Questions */}
            {message.followUpQuestions && message.followUpQuestions.length > 0 && onFollowUpClick && (
              <div className="mt-4">
                <p className="text-xs font-medium text-slate-500 mb-3 uppercase tracking-wide">Continue discussion</p>
                <div className="flex flex-wrap gap-2">
                  {message.followUpQuestions.map((question, index) => {
                    const category = question.category || 'general';
                    const IconComponent = categoryIcons[category];
                    
                    return (
                      <button
                        key={index}
                        onClick={() => onFollowUpClick(question.text)}
                        className="protocol-followup-chip group"
                      >
                        <IconComponent className="protocol-followup-icon" />
                        <span className="text-xs">{stripMarkdown(question.text)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
