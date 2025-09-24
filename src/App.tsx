import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';
import LandingScreen from '@/components/LandingScreen';
import Sidebar from '@/components/Sidebar';
import ChatInput from '@/components/ChatInput';
import ChatMessage from '@/components/ChatMessage';
import { Message, Region, Year } from '@/types';
import { generateMockProtocol } from '@/data/mockData';

function App() {
  const [showLanding, setShowLanding] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleStartSearch = () => {
    setShowLanding(false);
    setIsSidebarOpen(true);
  };

  const handleSampleQuery = (query: string) => {
    setShowLanding(false);
    setIsSidebarOpen(true);
    // Simulate sending the sample query
    setTimeout(() => {
      handleSendMessage(query, 'India', '2024');
    }, 100);
  };

  const handleSendMessage = async (content: string, _region: Region, _year: Year) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    // Simulate AI response delay
    setTimeout(() => {
      const protocolData = generateMockProtocol(content);
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: `Here's the comprehensive protocol for your query:`,
        timestamp: new Date().toISOString(),
        protocolData,
      };

      setMessages(prev => [...prev, assistantMessage]);
      setIsLoading(false);
    }, 2000);
  };

  const handleNewSearch = () => {
    setMessages([]);
  };

  const handleRecentSearch = (query: string) => {
    handleSendMessage(query, 'India', '2024');
  };

  const handleSavedProtocol = (protocolId: string) => {
    // In a real app, this would load the saved protocol
    console.log('Loading saved protocol:', protocolId);
  };

  if (showLanding) {
    return (
      <LandingScreen 
        onStartSearch={handleStartSearch}
        onSampleQuery={handleSampleQuery}
      />
    );
  }

  return (
    <div className="h-screen flex bg-slate-50">
      {/* Sidebar */}
      {isSidebarOpen && (
        <>
          {/* Mobile overlay */}
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
          {/* Sidebar */}
          <div className="fixed lg:relative lg:translate-x-0 inset-y-0 left-0 z-50 lg:z-auto">
            <Sidebar
              onNewSearch={handleNewSearch}
              onRecentSearch={handleRecentSearch}
              onSavedProtocol={handleSavedProtocol}
            />
          </div>
        </>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full">
        {/* Header */}
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
            onClick={() => setShowLanding(true)}
            className="text-slate-600"
          >
            Back to Home
          </Button>
        </header>

        {/* Chat Messages */}
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
            <ChatMessage key={message.id} message={message} />
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

        {/* Chat Input */}
        <ChatInput 
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}

export default App;
