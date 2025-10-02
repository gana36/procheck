export type BackendSearchFilters = {
  region?: string[];
  year?: number[];
  authority?: string[];
  specialty?: string[];
  urgency?: string[];
  tags?: string[];
};

export type BackendSearchRequest = {
  query?: string;
  size?: number;
  filters?: BackendSearchFilters;
};

export type BackendSearchHit = {
  id: string;
  score?: number;
  source: Record<string, any>;
  highlight?: Record<string, any> | null;
};

export type BackendSearchResponse = {
  total: number;
  hits: BackendSearchHit[];
  took_ms: number;
  medical_context?: Record<string, any>;
};

export type BackendGenerateRequest = {
  title: string;
  context_snippets: string[];
  instructions?: string | null;
  region?: string | null;
  year?: number | null;
  medical_context?: Record<string, any>;
};

export type BackendChecklistItem = {
  step: number;
  text: string;
  explanation?: string;  // Detailed how-to explanation
  citation?: number;  // Citation source number
  priority?: string;
  rationale?: string;
};

export type BackendGenerateResponse = {
  title: string;
  checklist: BackendChecklistItem[];
  citations: string[];
  safety_notes?: string[];
  context?: Record<string, any>;
};

// Conversation types
export type ConversationMessage = {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: string;
  protocol_data?: any;
};

export type ConversationSaveRequest = {
  id?: string;
  title?: string;
  messages: ConversationMessage[];
  protocol_data?: any;
  last_query?: string;
  tags?: string[];
  created_at?: string;
};

export type ConversationResponse = {
  success: boolean;
  conversation_id?: string;
  document_id?: string;
  error?: string;
  details?: string;
  message?: string;
};

export type ConversationListItem = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_query: string;
};

export type ConversationListResponse = {
  success: boolean;
  conversations: ConversationListItem[];
  total: number;
  error?: string;
  details?: string;
};

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

export async function searchProtocols(
  req: BackendSearchRequest, 
  options?: {
    useHybrid?: boolean;
    enhanceQuery?: boolean;
  }
): Promise<BackendSearchResponse> {
  // Default to hybrid search enabled for better results!
  const useHybrid = options?.useHybrid !== undefined ? options.useHybrid : true;
  const enhanceQuery = options?.enhanceQuery || false;
  
  const url = `${API_BASE}/protocols/search?use_hybrid=${useHybrid}&enhance_query=${enhanceQuery}`;
  
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Search failed: ${res.status} ${text}`);
  }
  return res.json();
}

// Backward compatibility: hybridSearchProtocols now just calls searchProtocols
export async function hybridSearchProtocols(req: BackendSearchRequest): Promise<BackendSearchResponse> {
  return searchProtocols(req, { useHybrid: true, enhanceQuery: false });
}

export async function generateProtocol(req: BackendGenerateRequest): Promise<BackendGenerateResponse> {
  const res = await fetch(`${API_BASE}/protocols/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Generate failed: ${res.status} ${text}`);
  }
  return res.json();
}

// Conversation API functions
export async function saveConversation(userId: string, conversation: ConversationSaveRequest): Promise<ConversationResponse> {
  const res = await fetch(`${API_BASE}/conversations/save?user_id=${encodeURIComponent(userId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(conversation),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Save conversation failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function getUserConversations(userId: string, limit: number = 20): Promise<ConversationListResponse> {
  const res = await fetch(`${API_BASE}/conversations/${encodeURIComponent(userId)}?limit=${limit}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Get conversations failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function getConversation(userId: string, conversationId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/conversations/${encodeURIComponent(userId)}/${encodeURIComponent(conversationId)}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Get conversation failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function deleteConversation(userId: string, conversationId: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/conversations/${encodeURIComponent(userId)}/${encodeURIComponent(conversationId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Delete conversation failed: ${res.status} ${text}`);
  }
  return res.json();
}

// ==================== Saved Protocols API ====================

export type SavedProtocol = {
  id: string;
  title: string;
  saved_at: string;
  region: string;
  year: string;
  organization: string;
  protocol_data: any;
};

export type SavedProtocolsResponse = {
  success: boolean;
  protocols: SavedProtocol[];
  total: number;
  error?: string;
  details?: string;
};

export async function saveProtocol(userId: string, protocolData: any): Promise<{ success: boolean; protocol_id: string; document_id: string }> {
  const res = await fetch(`${API_BASE}/protocols/save?user_id=${encodeURIComponent(userId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(protocolData),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Save protocol failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function getSavedProtocols(userId: string, limit: number = 20): Promise<SavedProtocolsResponse> {
  const res = await fetch(`${API_BASE}/protocols/saved/${encodeURIComponent(userId)}?limit=${limit}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Get saved protocols failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function deleteSavedProtocol(userId: string, protocolId: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/protocols/saved/${encodeURIComponent(userId)}/${encodeURIComponent(protocolId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Delete protocol failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function isProtocolSaved(userId: string, protocolId: string): Promise<{ success: boolean; is_saved: boolean }> {
  const res = await fetch(`${API_BASE}/protocols/saved/${encodeURIComponent(userId)}/${encodeURIComponent(protocolId)}/check`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Check protocol saved failed: ${res.status} ${text}`);
  }
  return res.json();
}
