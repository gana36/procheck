export interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: string;
  protocolData?: ProtocolData;
}

export interface ProtocolStep {
  id: number;
  step: string;
  citations: number[];
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
