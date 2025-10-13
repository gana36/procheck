export interface FollowUpQuestion {
  text: string;
  category?: 'dosage' | 'symptoms' | 'complications' | 'timing' | 'safety' | 'general';
}

export interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: string;
  protocolData?: ProtocolData;
  searchMetadata?: SearchMetadata;
  followUpQuestions?: FollowUpQuestion[];
  citations?: CitationSource[]; // Structured citations for conversation responses
  uncertaintyNote?: string; // Notes about limitations in source data
  usedNewSources?: boolean; // Whether fresh context was retrieved
  isFollowUp?: boolean; // Indicates if this is a follow-up question to existing protocol
  status?: 'pending' | 'sent' | 'failed' | 'retrying'; // Message delivery status
  retryCount?: number; // Number of retry attempts
  error?: string; // Error message if failed
}

export interface SearchMetadata {
  totalResults: number;
  responseTimes: number;
  searchMethod: 'hybrid' | 'traditional';
  resultsFound: number;
}

export interface StepThreadMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ProtocolStep {
  id: number;
  step: string;
  explanation?: string;  // Detailed how-to explanation
  citation?: number;  // Primary citation for this step
  citations: number[]; // Legacy support
  isNew?: boolean;
  changes?: string;
  thread?: StepThreadMessage[];  // Step-level chat thread
}

export interface Citation {
  id: number;
  source: string;
  organization: string;
  year: string;
  region: string;
  url?: string;
  excerpt: string;
}

export interface CitationSource {
  id: number;
  title: string;
  organization: string;
  source_url?: string;
  excerpt: string;
  relevance_score?: number;
}

export interface ProtocolData {
  title: string;
  region: string;
  year: string;
  organization: string;
  steps: ProtocolStep[];
  citations: Citation[];
  lastUpdated?: string;
  intent?: 'emergency' | 'symptoms' | 'treatment' | 'diagnosis' | 'prevention' | 'general';
}

export interface RecentSearch {
  id: string;
  query: string;
  timestamp: string;
  region: string;
  year: string;
}

export interface SavedProtocol {
  id: string;
  title: string;
  organization: string;
  savedDate: string;
  region: string;
  year: string;
}

export type Region = 'Mumbai' | 'Delhi' | 'Bangalore' | 'Chennai' | 'Global' | 'WHO' | 'India' | 'US' | 'UK';
export type Year = '2024' | '2023' | '2022' | '2021' | '2020';

export const regions: Region[] = ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Global', 'WHO', 'India', 'US', 'UK'];
export const years: Year[] = ['2024', '2023', '2022', '2021', '2020'];

// Tab system types
export interface ConversationTab {
  id: string;
  title: string;
  type: 'chat';
  messages: Message[];
  conversationId: string;
  isLoading: boolean;
}

export interface ProtocolTab {
  id: string;
  title: string;
  type: 'generated-protocols';
  protocols: any[]; // Generated protocols data
  isLoading: boolean;
}

export interface ProtocolIndexTab {
  id: string;
  title: string;
  type: 'protocol-index';
  protocols: any[]; // User uploaded protocols
  isLoading: boolean;
}

export type AppTab = ConversationTab | ProtocolTab | ProtocolIndexTab;
