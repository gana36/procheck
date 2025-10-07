import { useState, useEffect, memo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Global state type declaration
declare global {
  interface Window {
    __protocolStates?: Map<string, {
      expandedSteps: Set<number>;
      activeStepThread: number | null;
    }>;
  }
}
import {
  Star,
  Copy,
  Share2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileText,
  Calendar,
  MapPin,
  Building,
  AlertCircle,
  Clock,
  TrendingUp
} from 'lucide-react';
import { ProtocolData } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { saveProtocol, deleteSavedProtocol, isProtocolSaved, stepThreadChat, ChatMessage as APIChatMessage } from '@/lib/api';
import StepThread from './StepThread';

interface ProtocolCardProps {
  protocolData: ProtocolData;
  onSaveToggle?: () => void; // Callback to refresh saved list in sidebar
  onProtocolUpdate?: (updatedProtocol: ProtocolData) => void; // Callback when protocol is updated via threads
  intent?: 'emergency' | 'symptoms' | 'treatment' | 'diagnosis' | 'prevention' | 'general';
  isAlreadySaved?: boolean; // Pass this to avoid unnecessary API calls
}

// Professional theme configurations
const intentThemes = {
  emergency: {
    gradient: 'from-red-500 via-red-600 to-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
    badge: 'bg-red-100 text-red-800 border-red-200',
    stepBg: 'bg-red-50',
    stepBorder: 'border-red-200',
    checkBg: 'bg-red-500',
    checkColor: 'text-white',
    accentBorder: 'border-l-red-500',
    icon: AlertCircle,
    label: 'EMERGENCY PROTOCOL'
  },
  symptoms: {
    gradient: 'from-blue-500 via-blue-600 to-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    badge: 'bg-blue-100 text-blue-800 border-blue-200',
    stepBg: 'bg-blue-50',
    stepBorder: 'border-blue-200',
    checkBg: 'bg-blue-500',
    checkColor: 'text-white',
    accentBorder: 'border-l-blue-500',
    icon: TrendingUp,
    label: 'SYMPTOMS GUIDE'
  },
  treatment: {
    gradient: 'from-purple-500 via-purple-600 to-purple-700',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    badge: 'bg-purple-100 text-purple-800 border-purple-200',
    stepBg: 'bg-purple-50',
    stepBorder: 'border-purple-200',
    checkBg: 'bg-purple-500',
    checkColor: 'text-white',
    accentBorder: 'border-l-purple-500',
    icon: FileText,
    label: 'TREATMENT PROTOCOL'
  },
  diagnosis: {
    gradient: 'from-indigo-500 via-indigo-600 to-indigo-700',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    badge: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    stepBg: 'bg-indigo-50',
    stepBorder: 'border-indigo-200',
    checkBg: 'bg-indigo-500',
    checkColor: 'text-white',
    accentBorder: 'border-l-indigo-500',
    icon: FileText,
    label: 'DIAGNOSTIC GUIDE'
  },
  prevention: {
    gradient: 'from-green-500 via-green-600 to-green-700',
    bg: 'bg-green-50',
    border: 'border-green-200',
    badge: 'bg-green-100 text-green-800 border-green-200',
    stepBg: 'bg-green-50',
    stepBorder: 'border-green-200',
    checkBg: 'bg-green-500',
    checkColor: 'text-white',
    accentBorder: 'border-l-green-500',
    icon: FileText,
    label: 'PREVENTION GUIDE'
  },
  general: {
    gradient: 'from-slate-600 via-slate-700 to-slate-800',
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    badge: 'bg-slate-100 text-slate-800 border-slate-200',
    stepBg: 'bg-slate-50',
    stepBorder: 'border-slate-200',
    checkBg: 'bg-slate-600',
    checkColor: 'text-white',
    accentBorder: 'border-l-slate-500',
    icon: FileText,
    label: 'MEDICAL PROTOCOL'
  }
};

const ProtocolCard = memo(function ProtocolCard({ protocolData, onSaveToggle, onProtocolUpdate, intent = 'general', isAlreadySaved = false }: ProtocolCardProps) {
  const { currentUser } = useAuth();
  const theme = intentThemes[intent] || intentThemes.general;
  const ThemeIcon = theme.icon;

  const [isSaved, setIsSaved] = useState(false);
  const [isReferencesOpen, setIsReferencesOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [stepThreadLoading, setStepThreadLoading] = useState<number | null>(null);
  
  // Generate a unique ID for this protocol based on title
  const protocolId = `protocol_${protocolData.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
  
  // CRITICAL: Use global state storage that persists across re-renders
  // Store state in a global Map keyed by protocolId
  const getGlobalState = () => {
    if (!window.__protocolStates) {
      window.__protocolStates = new Map();
    }
    if (!window.__protocolStates.has(protocolId)) {
      window.__protocolStates.set(protocolId, {
        expandedSteps: new Set(),
        activeStepThread: null
      });
    }
    return window.__protocolStates.get(protocolId)!; // Non-null assertion since we just created it
  };

  const [, setUpdateCounter] = useState(0);
  const globalState = getGlobalState();
  const expandedSteps = globalState.expandedSteps;
  const activeStepThread = globalState.activeStepThread;

  // Check if protocol is already saved when component mounts
  // Use ref to track if we've already checked to prevent duplicate calls
  const hasCheckedRef = useRef(false);
  const lastProtocolIdRef = useRef<string | null>(null);
  const lastUserIdRef = useRef<string | null>(null);
  
  useEffect(() => {
    const userId = currentUser?.uid || null;
    
    // If we already know it's saved, don't make an API call
    if (isAlreadySaved) {
      setIsSaved(true);
      hasCheckedRef.current = true;
      lastProtocolIdRef.current = protocolId;
      lastUserIdRef.current = userId;
      return;
    }

    // Skip if we've already checked this exact protocol for this user
    if (hasCheckedRef.current && 
        lastProtocolIdRef.current === protocolId && 
        lastUserIdRef.current === userId) {
      console.log('⏭️ Protocol save status already checked, skipping');
      return;
    }

    const checkSaved = async () => {
      if (!currentUser) return;

      try {
        console.log('🔄 [API CALL] Checking if protocol is saved...');
        const result = await isProtocolSaved(currentUser.uid, protocolId);
        if (result.success) {
          setIsSaved(result.is_saved);
          hasCheckedRef.current = true;
          lastProtocolIdRef.current = protocolId;
          lastUserIdRef.current = userId;
        }
      } catch (error) {
        console.error('Failed to check if protocol is saved:', error);
      }
    };

    checkSaved();
  }, [currentUser, protocolId, isAlreadySaved]);

  const handleSave = async () => {
    if (!currentUser || isSaving) return;

    setIsSaving(true);
    try {
      if (isSaved) {
        // Unsave/delete protocol
        await deleteSavedProtocol(currentUser.uid, protocolId);
        setIsSaved(false);
      } else {
        // Save protocol
        await saveProtocol(currentUser.uid, {
          id: protocolId,
          ...protocolData,
          intent,
        });
        setIsSaved(true);
      }

      // Trigger callback to refresh sidebar
      if (onSaveToggle) {
        onSaveToggle();
      }
    } catch (error) {
      console.error('Failed to toggle save protocol:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = () => {
    const stepsText = protocolData.steps
      .map(s => `${s.id}. ${s.step}`)
      .join('\n');
    navigator.clipboard.writeText(stepsText);
  };

  const handleCitationClick = (citationId: number) => {
    setIsReferencesOpen(true);
    setTimeout(() => {
      const element = document.getElementById(`citation-${citationId}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  };

  const toggleStepExpansion = (stepId: number) => {
    const state = getGlobalState();
    if (state.expandedSteps.has(stepId)) {
      state.expandedSteps.delete(stepId);
    } else {
      state.expandedSteps.add(stepId);
    }
    setUpdateCounter(prev => prev + 1); // Trigger re-render to show updated state
  };

  const handleStepThreadMessage = async (stepId: number, message: string) => {
    setStepThreadLoading(stepId);
    
    // CRITICAL: Ensure thread stays open and step stays expanded BEFORE any async operations
    const state = getGlobalState();
    state.activeStepThread = stepId;
    state.expandedSteps.add(stepId);
    setUpdateCounter(prev => prev + 1); // Force re-render to show the state immediately
    
    try{
      const stepIndex = protocolData.steps.findIndex(s => s.id === stepId);
      if (stepIndex === -1) return;
      
      const step = protocolData.steps[stepIndex];

      // Build thread history
      const threadHistory: APIChatMessage[] = (step.thread || []).map(msg => ({
        role: msg.type as 'user' | 'assistant',
        content: msg.content
      }));

      // Build citations array
      const citations = protocolData.citations.map(c => c.excerpt || c.source);

      // Call backend
      const response = await stepThreadChat({
        message,
        step_id: stepId,
        step_text: step.step,
        step_citation: step.citation,
        protocol_title: protocolData.title,
        protocol_citations: citations,
        thread_history: threadHistory
      });

      // Create message objects
      const userMsg = {
        id: Date.now().toString(),
        type: 'user' as const,
        content: message,
        timestamp: new Date().toISOString()
      };

      const assistantMsg = {
        id: (Date.now() + 1).toString(),
        type: 'assistant' as const,
        content: response.message,
        timestamp: new Date().toISOString()
      };

      // Clone protocol data to update immutably
      const updatedProtocol = { ...protocolData };
      updatedProtocol.steps = [...protocolData.steps];
      updatedProtocol.steps[stepIndex] = {
        ...step,
        thread: [...(step.thread || []), userMsg, assistantMsg]
      };

      // Notify parent to update the protocol
      if (onProtocolUpdate) {
        onProtocolUpdate(updatedProtocol);
      }
      
      // CRITICAL: Re-ensure state is preserved after update
      const state = getGlobalState();
      state.activeStepThread = stepId;
      state.expandedSteps.add(stepId);
      
    } catch (error) {
      console.error('Failed to send step thread message:', error);
    } finally {
      setStepThreadLoading(null);
      setUpdateCounter(prev => prev + 1); // Force re-render to show final state
    }
  };

  return (
    <Card className="w-full bg-white shadow-xl border-0 overflow-hidden">
      {/* Professional Header with Gradient */}
      <CardHeader className={`bg-gradient-to-r ${theme.gradient} text-white pb-6 pt-6`}>
        <div className="space-y-4">
          {/* Protocol Type Badge */}
          <div className="flex items-center space-x-2">
            <div className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full">
              <div className="flex items-center space-x-2">
                <ThemeIcon className="h-3.5 w-3.5 text-white" />
                <span className="text-xs font-bold tracking-wider">{theme.label}</span>
              </div>
            </div>
          </div>

          {/* Title */}
          <CardTitle className="text-2xl font-bold leading-tight">
              {protocolData.title}
            </CardTitle>

          {/* Meta Information */}
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm border-0">
              <MapPin className="h-3 w-3 mr-1.5" />
              <span className="font-medium">{protocolData.region}</span>
              </Badge>
            <Badge className="bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm border-0">
              <Calendar className="h-3 w-3 mr-1.5" />
              <span className="font-medium">{protocolData.year}</span>
              </Badge>
            <Badge className="bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm border-0">
              <Building className="h-3 w-3 mr-1.5" />
              <span className="font-medium">{protocolData.organization}</span>
              </Badge>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2 pt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSave}
              className={`${isSaved ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' : 'bg-white/20 text-white hover:bg-white/30'} backdrop-blur-sm border-0 transition-all`}
            >
              <Star className={`h-4 w-4 mr-1.5 ${isSaved ? 'fill-current' : ''}`} />
              {isSaved ? 'Saved' : 'Save'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopy}
              className="bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm border-0"
            >
              <Copy className="h-4 w-4 mr-1.5" />
              Copy
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm border-0"
            >
              <Share2 className="h-4 w-4 mr-1.5" />
              Share
            </Button>
          </div>
        </div>
      </CardHeader>

      {/* Protocol Steps */}
      <CardContent className="p-6 space-y-3">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
              Protocol Steps
            </h3>
            {protocolData.citations && protocolData.citations.length > 0 && (
              <Badge className="bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200">
                {protocolData.citations.length} sources
              </Badge>
            )}
          </div>
          <Badge variant="outline" className="border-slate-300 text-slate-700">
            {protocolData.steps.length} steps
          </Badge>
        </div>

        <div className="space-y-2">
          {protocolData.steps.map((step, index) => {
            const citation = step.citation || step.citations?.[0];
            const citationRef = citation ? protocolData.citations?.find(c => c.id === citation) : null;
            const isExpanded = expandedSteps.has(step.id);
            
            return (
              <div
                key={step.id}
                className={`group relative rounded-xl border-l-4 ${theme.accentBorder} bg-white transition-all duration-200 border border-slate-200 ${isExpanded ? 'shadow-lg' : 'hover:shadow-md'}`}
              >
                {/* Main Step Content - Always Visible */}
                <div className="p-4 cursor-pointer" onClick={() => toggleStepExpansion(step.id)}>
                  <div className="flex items-start space-x-4">
                    {/* Step Number */}
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br ${theme.gradient} flex items-center justify-center shadow-sm`}>
                      <span className="text-white text-sm font-bold">{index + 1}</span>
                    </div>

                    {/* Step Content with Inline Citation */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <p className="text-sm text-slate-800 leading-relaxed font-medium flex-1">
                          {step.step}
                        </p>
                        {citation && citation > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCitationClick(citation);
                            }}
                            className="inline-flex items-center flex-shrink-0 align-text-top text-xs text-slate-600 hover:text-slate-900 font-medium cursor-pointer transition-colors"
                            title={citationRef ? `Source: ${citationRef.organization} - ${citationRef.source}` : `Source ${citation}`}
                          >
                            [{citation}]
                          </button>
                        )}
                      </div>
                      {citationRef && !isExpanded && (
                        <div className="mt-2 flex items-center text-xs text-slate-500">
                          <ExternalLink className="h-3 w-3 mr-1" />
                          <span className="truncate">{citationRef.organization} • {citationRef.year}</span>
                        </div>
                      )}
                    </div>

                    {/* Expand/Collapse Icon */}
                  <div className="flex-shrink-0">
                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5 text-slate-400" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-slate-400 group-hover:text-slate-600" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Content - Explanation & Source Details */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-slate-100 pt-4 mt-2 space-y-4">
                    {/* How-To Explanation */}
                    {step.explanation && (
                      <div className="bg-gradient-to-br from-slate-50 to-gray-50 p-4 rounded-lg border border-slate-200 shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center shadow-sm">
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Clinical Guidance</h5>
                            <p className="text-sm text-slate-700 leading-relaxed">
                              {step.explanation}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Source Citation Details */}
                    {citationRef && (
                      <div className={`p-4 rounded-lg ${theme.bg} border ${theme.border}`}>
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center space-x-2">
                            <span className="inline-flex items-center px-2 py-1 rounded bg-slate-800 text-white text-xs font-bold">
                              [{citation}]
                            </span>
                            <div>
                              <p className="text-sm font-bold text-slate-900">
                                {citationRef.source}
                              </p>
                              <div className="flex items-center space-x-2 text-xs text-slate-600 mt-1">
                                <Badge variant="secondary" className="bg-white">
                                  {citationRef.organization}
                                </Badge>
                                <span>•</span>
                                <span>{citationRef.year}</span>
                                <span>•</span>
                                <span>{citationRef.region}</span>
                              </div>
                            </div>
                          </div>
                          {citationRef.url && (
                            <a
                              href={citationRef.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="flex-shrink-0 flex items-center space-x-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white rounded-md transition-colors text-xs font-medium shadow-sm"
                            >
                              <span>View Source</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                        
                        {/* Full Source Content */}
                        {citationRef.excerpt && (
                          <div className="mt-3 p-3 bg-white rounded border border-slate-200">
                            <p className="text-xs text-slate-500 uppercase font-semibold mb-2">Source Text:</p>
                            <p className="text-xs text-slate-700 leading-relaxed">
                              {citationRef.excerpt}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Step Thread Discussion */}
                    <div className="border-t border-slate-200 pt-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const state = getGlobalState();
                          if (state.activeStepThread === step.id) {
                            state.activeStepThread = null;
                          } else {
                            state.activeStepThread = step.id;
                          }
                          setUpdateCounter(prev => prev + 1); // Trigger re-render to show updated state
                        }}
                        className="text-slate-600 hover:text-slate-900"
                      >
                        <span className="flex items-center gap-2">
                          💬 Discuss This Step
                          {step.thread && step.thread.length > 0 && (
                            <Badge variant="secondary" className="ml-1">
                              {step.thread.length}
                            </Badge>
                          )}
                        </span>
                      </Button>
                      
                      {activeStepThread === step.id && (
                        <StepThread
                          messages={step.thread || []}
                          onSendMessage={(msg) => handleStepThreadMessage(step.id, msg)}
                          isLoading={stepThreadLoading === step.id}
                        />
                      )}
                    </div>
                  </div>
                )}
                </div>
            );
          })}
        </div>

        {/* Citations Section */}
        {protocolData.citations && protocolData.citations.length > 0 && (
          <div className="mt-6 pt-6 border-t border-slate-200">
          <Button
            variant="ghost"
              size="sm"
            onClick={() => setIsReferencesOpen(!isReferencesOpen)}
              className="w-full justify-between text-slate-700 hover:text-slate-900 hover:bg-slate-100"
          >
              <div className="flex items-center">
                <FileText className="h-4 w-4 mr-2" />
                <span className="font-semibold">
              References ({protocolData.citations.length})
            </span>
              </div>
            {isReferencesOpen ? (
                <ChevronUp className="h-4 w-4" />
            ) : (
                <ChevronDown className="h-4 w-4" />
            )}
          </Button>
          
          {isReferencesOpen && (
              <div className="mt-3 space-y-2">
              {protocolData.citations.map((citation) => (
                  <div
                    key={citation.id}
                    id={`citation-${citation.id}`}
                    className="p-4 bg-white rounded-lg border-2 border-slate-200 hover:border-teal-300 transition-all shadow-sm"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="inline-flex items-center px-2 py-1 rounded bg-slate-800 text-white text-xs font-bold">
                            [{citation.id}]
                          </span>
                          <p className="text-sm font-bold text-slate-900">
                            {citation.source}
                          </p>
                        </div>
                        <div className="flex items-center space-x-2 text-xs text-slate-600">
                          <Badge variant="secondary" className="bg-slate-100">
                            {citation.organization}
                          </Badge>
                          <span>•</span>
                          <span>{citation.year}</span>
                          <span>•</span>
                          <span>{citation.region}</span>
                        </div>
                        {citation.excerpt && (
                          <p className="text-xs text-slate-500 mt-2 italic">
                          {citation.excerpt}
                        </p>
                        )}
                      </div>
                      {citation.url && (
                        <a
                          href={citation.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-3 flex-shrink-0 flex items-center space-x-1 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-md transition-colors text-xs font-medium"
                        >
                          <span>View Source</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
              ))}
            </div>
          )}
        </div>
        )}

        {/* Last Updated */}
        {protocolData.lastUpdated && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <div className="flex items-center text-xs text-slate-500">
              <Clock className="h-3 w-3 mr-1.5" />
              Last updated: {protocolData.lastUpdated}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function to prevent unnecessary re-renders
  // Only re-render if protocolData actually changes (new thread messages, etc.)
  
  // Basic checks first
  if (prevProps.protocolData.title !== nextProps.protocolData.title ||
      prevProps.protocolData.steps.length !== nextProps.protocolData.steps.length ||
      prevProps.intent !== nextProps.intent) {
    return false; // Should re-render
  }
  
  // Check if thread data has changed
  for (let i = 0; i < prevProps.protocolData.steps.length; i++) {
    const prevStep = prevProps.protocolData.steps[i];
    const nextStep = nextProps.protocolData.steps[i];
    
    if (prevStep.id !== nextStep.id) {
      return false; // Should re-render
    }
    
    // Check thread messages
    const prevThread = prevStep.thread || [];
    const nextThread = nextStep.thread || [];
    
    if (prevThread.length !== nextThread.length) {
      return false; // Should re-render
    }
    
    for (let j = 0; j < prevThread.length; j++) {
      if (prevThread[j].id !== nextThread[j].id ||
          prevThread[j].content !== nextThread[j].content) {
        return false; // Should re-render
      }
    }
  }
  
  return true; // Props are equal, don't re-render
});

export default ProtocolCard;
