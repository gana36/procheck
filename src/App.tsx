import { useState, useRef, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';
import LandingScreen from '@/components/LandingScreen';
import Sidebar from '@/components/Sidebar';
import ChatInput from '@/components/ChatInput';
import ChatMessage from '@/components/ChatMessage';
import LoginPage from '@/components/auth/LoginPage';
import SignupPage from '@/components/auth/SignupPage';
import ForgotPasswordPage from '@/components/auth/ForgotPasswordPage';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Message, ProtocolData, ProtocolStep, Citation } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { searchProtocols, generateProtocol, saveConversation, getConversation, ConversationMessage } from '@/lib/api';

function App() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string>(() =>
    `conv_${Date.now()}`
  );
  const [sidebarRefreshTrigger, setSidebarRefreshTrigger] = useState(0);
  const [savedProtocolsRefreshTrigger, setSavedProtocolsRefreshTrigger] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

  const normalizeChecklist = (items: { step: number; text: string }[]): { step: number; text: string }[] => {
    const seen = new Set<string>();
    const out: { step: number; text: string }[] = [];
    for (const item of items || []) {
      const cleaned = cleanStepText(item?.text || '');
      if (!cleaned || cleaned.length < 4) continue;
      const key = cleaned.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ step: out.length + 1, text: cleaned });
    }
    return out.slice(0, 12);
  };

  const selectSnippets = (query: string, hits: any[]): string[] => {
    // Use semantic relevance scoring - trust Elasticsearch scores but add context diversity
    const scored = (hits || []).map((h) => {
      const s = h.source || {};
      let score = h.score || 0;
      
      // Boost based on content type relevance to query intent
      const section = String(s.section || '').toLowerCase();
      const title = String(s.title || '').toLowerCase();
      const queryLower = query.toLowerCase();
      
      // Boost clinical/management content for protocol queries
      if (section.includes('checklist') || section.includes('protocol') || section.includes('management')) {
        score += 1.0;
      }
      if (title.includes('protocol') || title.includes('checklist') || title.includes('guidelines')) {
        score += 0.8;
      }
      
      // Slight penalty for prevention/vaccination when query seems clinical
      if ((section.includes('prevention') || section.includes('vaccination')) && 
          (queryLower.includes('treatment') || queryLower.includes('management') || queryLower.includes('protocol'))) {
        score -= 0.3;
      }
      
      return { h, score };
    });

    scored.sort((a, b) => b.score - a.score);

    const snippets: string[] = [];
    for (const { h } of scored) {
      const s = h.source || {};
      const body = s.body || s.content || s.title;
      if (!body) continue;
      snippets.push(String(body));
      if (snippets.length >= 8) break; // Limit context to avoid overwhelming LLM
    }
    return snippets;
  };

  const mapBackendToProtocolData = (
    title: string,
    hits: any[],
    checklist: { step: number; text: string }[],
    citations: string[]
  ): ProtocolData => {
    const best = hits?.[0]?.source || {};
    const region = String(best.region || 'Global');
    const year = String(best.year || new Date().getFullYear());
    const organization = String(best.organization || 'ProCheck');

    const normalized = normalizeChecklist(checklist);
    const steps: ProtocolStep[] = normalized.length > 0
      ? normalized.map((item) => ({ id: item.step, step: item.text, citations: [] }))
      : (hits || []).slice(0, 6).map((h: any, idx: number) => ({
          id: idx + 1,
          step: cleanStepText(h.source?.body || h.source?.content || h.source?.title || '—'),
          citations: [],
        }));

    const citationObjs: Citation[] = [];
    for (let i = 0; i < Math.min(citations.length, 5); i++) {
      const url = citations[i];
      citationObjs.push({
        id: i + 1,
        source: 'Reference',
        organization: organization,
        year,
        region,
        url,
        excerpt: url,
      });
    }
    if (citationObjs.length === 0 && hits?.length) {
      hits.slice(0, 3).forEach((h: any) => {
        const url = h.source?.source_url || h.source?.url;
        if (url) {
          citationObjs.push({
            id: citationObjs.length + 1,
            source: h.source?.title || 'Source',
            organization: h.source?.organization || organization,
            year: String(h.source?.year || year),
            region: h.source?.region || region,
            url,
            excerpt: h.source?.section || h.source?.title || url,
          });
        }
      });
    }

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

  // Helper function to save conversation
  const saveCurrentConversation = async (updatedMessages: Message[], lastQuery: string) => {
    if (!currentUser) return;

    try {
      const conversationMessages: ConversationMessage[] = updatedMessages.map(msg => ({
        id: msg.id,
        type: msg.type as 'user' | 'assistant',
        content: msg.content,
        timestamp: msg.timestamp, // Preserve original message timestamp
        protocol_data: msg.protocolData || undefined,
      }));

      // Use the first message timestamp as conversation created_at
      const firstMessageTimestamp = updatedMessages.length > 0 ? updatedMessages[0].timestamp : getUserTimestamp();

      await saveConversation(currentUser.uid, {
        id: currentConversationId,
        title: lastQuery.length > 50 ? lastQuery.substring(0, 50) + '...' : lastQuery,
        messages: conversationMessages,
        last_query: lastQuery,
        tags: ['medical-protocol'],
        created_at: firstMessageTimestamp,
      });

      // Trigger sidebar refresh to show new conversation
      setSidebarRefreshTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Failed to save conversation:', error);
    }
  };

  const handleSendMessage = async (content: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content,
      timestamp: getUserTimestamp(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const searchRes = await searchProtocols({
        query: content,
        size: 8,
      });

      const snippets = selectSnippets(content, searchRes.hits);

      const genRes = await generateProtocol({
        title: content,
        context_snippets: snippets.length > 0 ? snippets : [content],
        instructions: `Analyze the provided context and generate a concise, actionable medical protocol checklist. Focus on the most relevant information for the user's query. Ignore irrelevant or conflicting information from different sources.`,
        region: null,
        year: null,
      });

      const protocolData: ProtocolData = mapBackendToProtocolData(
        content,
        searchRes.hits,
        genRes.checklist,
        genRes.citations
      );

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: `Here's the comprehensive protocol for your query:`,
        timestamp: getUserTimestamp(),
        protocolData,
      };

      setMessages(prev => {
        const newMessages = [...prev, assistantMessage];
        // Save conversation asynchronously
        saveCurrentConversation(newMessages, content);
        return newMessages;
      });
    } catch (err: any) {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: `Sorry, I couldn't process that request. ${err?.message || ''}`.trim(),
        timestamp: getUserTimestamp(),
      };
      setMessages(prev => {
        const newMessages = [...prev, assistantMessage];
        // Save conversation even on error
        saveCurrentConversation(newMessages, content);
        return newMessages;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewSearch = () => {
    setMessages([]);
    setCurrentConversationId(`conv_${Date.now()}`); // Generate new conversation ID
  };

  const handleRecentSearch = async (conversationId: string) => {
    if (!currentUser) return;

    try {
      setIsLoading(true);
      const response = await getConversation(currentUser.uid, conversationId);

      if (response.success && response.conversation) {
        const conv = response.conversation;

        // Convert conversation messages back to Message format
        const loadedMessages: Message[] = (conv.messages || []).map((msg: ConversationMessage) => ({
          id: msg.id,
          type: msg.type,
          content: msg.content,
          timestamp: msg.timestamp,
          protocolData: msg.protocol_data,
        }));

        // Set the messages and conversation ID
        setMessages(loadedMessages);
        setCurrentConversationId(conversationId);
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSavedProtocol = async (protocolId: string, protocolData: any) => {
    // Clear current messages and start fresh
    setMessages([]);
    setCurrentConversationId(`conv_${Date.now()}`);

    // Create a message with the saved protocol
    const assistantMessage: Message = {
      id: Date.now().toString(),
      type: 'assistant',
      content: `Here's your saved protocol:`,
      timestamp: getUserTimestamp(),
      protocolData: protocolData,
    };

    setMessages([assistantMessage]);
  };

  const handleAuthSuccess = () => {
    const from = location.state?.from?.pathname || '/dashboard';
    navigate(from, { replace: true });
  };

  const Dashboard = () => (
    <div className="h-screen flex bg-slate-50">
      {isSidebarOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
          <div className="fixed lg:relative lg:translate-x-0 inset-y-0 left-0 z-50 lg:z-auto">
            <Sidebar
              onNewSearch={handleNewSearch}
              onRecentSearch={handleRecentSearch}
              onSavedProtocol={handleSavedProtocol}
              refreshTrigger={sidebarRefreshTrigger}
              savedProtocolsRefreshTrigger={savedProtocolsRefreshTrigger}
            />
          </div>
        </>
      )}
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
            <h1 className="text-lg font-semibold text-slate-900">ProCheck Protocol Assistant</h1>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate('/')}
            className="text-slate-600"
          >
            Back to Home
          </Button>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-6xl mb-4">🏥</div>
                <h2 className="text-2xl font-semibold text-slate-900 mb-2">
                  Welcome to ProCheck
                </h2>
                <p className="text-slate-600 max-w-md">
                  Ask me about any medical protocol and I'll provide you with 
                  comprehensive, clinically cited guidelines.
                </p>
              </div>
            </div>
          )}
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              onSaveToggle={() => setSavedProtocolsRefreshTrigger(prev => prev + 1)}
            />
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="max-w-[90%]">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-teal-600"></div>
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <h4 className="font-semibold text-slate-900">ProCheck Protocol Assistant</h4>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                      <p className="text-sm text-slate-600">
                        Analyzing medical guidelines and synthesizing protocol...
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <ChatInput 
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
        />
      </div>
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
