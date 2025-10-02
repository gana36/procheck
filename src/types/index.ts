export interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: string;
  protocolData?: ProtocolData;
  searchMetadata?: SearchMetadata;
}

export interface SearchMetadata {
  totalResults: number;
  responseTimes: number;
  searchMethod: 'hybrid' | 'traditional';
  resultsFound: number;
}

export interface ProtocolStep {
  id: number;
  step: string;
  explanation?: string;  // Detailed how-to explanation
  citation?: number;  // Primary citation for this step
  citations: number[]; // Legacy support
  isNew?: boolean;
  changes?: string;
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
