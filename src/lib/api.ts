import { fetchWithRetry, RequestOptions } from './request-utils';
import { logError } from './error-handler';

// Chat types
export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type StepThreadRequest = {
  message: string;
  step_id: number;
  step_text: string;
  step_citation?: number | null;
  protocol_title: string;
  protocol_citations: string[];
  thread_history?: ChatMessage[];
};

export type ChatResponse = {
  message: string;
  updated_protocol?: any;
};

export type ProtocolConversationRequest = {
  message: string;
  concept_title: string;
  protocol_json: any;
  citations_list: string[];
  filters_json?: any;
  conversation_history?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
};

export type FollowUpQuestion = {
  text: string;
  category?: 'dosage' | 'symptoms' | 'complications' | 'timing' | 'safety' | 'general';
};

export type ProtocolConversationResponse = {
  answer: string;
  uncertainty_note?: string;
  sources: string[];
  used_new_sources: boolean;
  follow_up_questions: FollowUpQuestion[];
  updated_protocol?: any;
};

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

// Default request options
const DEFAULT_REQUEST_OPTIONS: RequestOptions = {
  timeout: 30000, // 30 seconds
  retries: 2,
  retryDelay: 1000,
};

export async function searchProtocols(
  req: BackendSearchRequest,
  options?: {
    useHybrid?: boolean;
    enhanceQuery?: boolean;
    signal?: AbortSignal;
    userId?: string;
    searchMode?: 'mixed' | 'user_only' | 'global_only';
  }
): Promise<BackendSearchResponse> {
  // Default to hybrid search enabled for better results!
  const useHybrid = options?.useHybrid !== undefined ? options.useHybrid : true;
  const enhanceQuery = options?.enhanceQuery || false;
  const userId = options?.userId;
  const searchMode = options?.searchMode || 'mixed';

  // Build URL with query parameters
  const params = new URLSearchParams({
    use_hybrid: useHybrid.toString(),
    enhance_query: enhanceQuery.toString()
  });

  if (userId) {
    params.append('user_id', userId);
    params.append('search_mode', searchMode);
  }

  const url = `${API_BASE}/protocols/search?${params.toString()}`;
  
  try {
    const res = await fetchWithRetry(url, {
      ...DEFAULT_REQUEST_OPTIONS,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: options?.signal,
    });
    
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Search failed: ${res.status} ${text}`);
    }
    
    return res.json();
  } catch (error) {
    logError(error, { function: 'searchProtocols', req });
    throw error;
  }
}

// Backward compatibility: hybridSearchProtocols now just calls searchProtocols
export async function hybridSearchProtocols(req: BackendSearchRequest): Promise<BackendSearchResponse> {
  return searchProtocols(req, { useHybrid: true, enhanceQuery: false });
}

export async function generateProtocol(
  req: BackendGenerateRequest,
  signal?: AbortSignal
): Promise<BackendGenerateResponse> {
  try {
    const res = await fetchWithRetry(`${API_BASE}/protocols/generate`, {
      ...DEFAULT_REQUEST_OPTIONS,
      timeout: 45000, // Longer timeout for generation
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    });
    
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Generate failed: ${res.status} ${text}`);
    }
    
    return res.json();
  } catch (error) {
    logError(error, { function: 'generateProtocol', req });
    throw error;
  }
}

// Conversation API functions
export async function saveConversation(
  userId: string,
  conversation: ConversationSaveRequest,
  signal?: AbortSignal
): Promise<ConversationResponse> {
  if (!userId || !userId.trim()) {
    throw new Error('User ID is required');
  }
  
  try {
    const res = await fetchWithRetry(`${API_BASE}/conversations/save?user_id=${encodeURIComponent(userId)}`, {
      ...DEFAULT_REQUEST_OPTIONS,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(conversation),
      signal,
    });
    
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Save conversation failed: ${res.status} ${text}`);
    }
    
    return res.json();
  } catch (error) {
    logError(error, { function: 'saveConversation', userId });
    throw error;
  }
}

export async function getUserConversations(
  userId: string,
  limit: number = 20,
  signal?: AbortSignal
): Promise<ConversationListResponse> {
  if (!userId || !userId.trim()) {
    throw new Error('User ID is required');
  }
  
  try {
    const res = await fetchWithRetry(`${API_BASE}/conversations/${encodeURIComponent(userId)}?limit=${limit}`, {
      ...DEFAULT_REQUEST_OPTIONS,
      signal,
    });
    
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Get conversations failed: ${res.status} ${text}`);
    }
    
    return res.json();
  } catch (error) {
    logError(error, { function: 'getUserConversations', userId });
    throw error;
  }
}

export async function getConversation(
  userId: string,
  conversationId: string,
  signal?: AbortSignal
): Promise<any> {
  if (!userId || !userId.trim() || !conversationId || !conversationId.trim()) {
    throw new Error('User ID and Conversation ID are required');
  }
  
  try {
    const res = await fetchWithRetry(
      `${API_BASE}/conversations/${encodeURIComponent(userId)}/${encodeURIComponent(conversationId)}`,
      { ...DEFAULT_REQUEST_OPTIONS, signal }
    );
    
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Get conversation failed: ${res.status} ${text}`);
    }
    
    return res.json();
  } catch (error) {
    logError(error, { function: 'getConversation', userId, conversationId });
    throw error;
  }
}

export async function deleteConversation(
  userId: string,
  conversationId: string,
  signal?: AbortSignal
): Promise<{ success: boolean; message: string }> {
  if (!userId || !userId.trim() || !conversationId || !conversationId.trim()) {
    throw new Error('User ID and Conversation ID are required');
  }
  
  try {
    const res = await fetchWithRetry(
      `${API_BASE}/conversations/${encodeURIComponent(userId)}/${encodeURIComponent(conversationId)}`,
      {
        ...DEFAULT_REQUEST_OPTIONS,
        method: 'DELETE',
        signal,
      }
    );
    
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Delete conversation failed: ${res.status} ${text}`);
    }
    
    return res.json();
  } catch (error) {
    logError(error, { function: 'deleteConversation', userId, conversationId });
    throw error;
  }
}

export async function updateConversationTitle(
  userId: string,
  conversationId: string,
  newTitle: string,
  signal?: AbortSignal
): Promise<{ success: boolean; message: string }> {
  if (!userId || !userId.trim() || !conversationId || !conversationId.trim()) {
    throw new Error('User ID and Conversation ID are required');
  }
  if (!newTitle || !newTitle.trim()) {
    throw new Error('Title is required');
  }
  
  try {
    const res = await fetchWithRetry(
      `${API_BASE}/conversations/${encodeURIComponent(userId)}/${encodeURIComponent(conversationId)}/title`,
      {
        ...DEFAULT_REQUEST_OPTIONS,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
        signal,
      }
    );
    
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Update conversation title failed: ${res.status} ${text}`);
    }
    
    return res.json();
  } catch (error) {
    logError(error, { function: 'updateConversationTitle', userId, conversationId });
    throw error;
  }
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

export async function saveProtocol(
  userId: string,
  protocolData: any,
  signal?: AbortSignal
): Promise<{ success: boolean; protocol_id: string; document_id: string }> {
  if (!userId || !userId.trim()) {
    throw new Error('User ID is required');
  }
  
  try {
    const res = await fetchWithRetry(`${API_BASE}/protocols/save?user_id=${encodeURIComponent(userId)}`, {
      ...DEFAULT_REQUEST_OPTIONS,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(protocolData),
      signal,
    });
    
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Save protocol failed: ${res.status} ${text}`);
    }
    
    return res.json();
  } catch (error) {
    logError(error, { function: 'saveProtocol', userId });
    throw error;
  }
}

export async function getSavedProtocols(
  userId: string,
  limit: number = 20,
  signal?: AbortSignal
): Promise<SavedProtocolsResponse> {
  if (!userId || !userId.trim()) {
    throw new Error('User ID is required');
  }
  
  try {
    const res = await fetchWithRetry(
      `${API_BASE}/protocols/saved/${encodeURIComponent(userId)}?limit=${limit}`,
      { ...DEFAULT_REQUEST_OPTIONS, signal }
    );
    
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Get saved protocols failed: ${res.status} ${text}`);
    }
    
    return res.json();
  } catch (error) {
    logError(error, { function: 'getSavedProtocols', userId });
    throw error;
  }
}

export async function getSavedProtocol(
  userId: string,
  protocolId: string,
  signal?: AbortSignal
): Promise<{ success: boolean; protocol?: SavedProtocol; error?: string }> {
  if (!userId || !userId.trim() || !protocolId || !protocolId.trim()) {
    throw new Error('User ID and Protocol ID are required');
  }
  
  try {
    const res = await fetchWithRetry(
      `${API_BASE}/protocols/saved/${encodeURIComponent(userId)}/${encodeURIComponent(protocolId)}`,
      { ...DEFAULT_REQUEST_OPTIONS, signal }
    );
    
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Get saved protocol failed: ${res.status} ${text}`);
    }
    
    return res.json();
  } catch (error) {
    logError(error, { function: 'getSavedProtocol', userId, protocolId });
    throw error;
  }
}

export async function deleteSavedProtocol(
  userId: string,
  protocolId: string,
  signal?: AbortSignal
): Promise<{ success: boolean; message: string }> {
  if (!userId || !userId.trim() || !protocolId || !protocolId.trim()) {
    throw new Error('User ID and Protocol ID are required');
  }
  
  try {
    const res = await fetchWithRetry(
      `${API_BASE}/protocols/saved/${encodeURIComponent(userId)}/${encodeURIComponent(protocolId)}`,
      {
        ...DEFAULT_REQUEST_OPTIONS,
        method: 'DELETE',
        signal,
      }
    );
    
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Delete protocol failed: ${res.status} ${text}`);
    }
    
    return res.json();
  } catch (error) {
    logError(error, { function: 'deleteSavedProtocol', userId, protocolId });
    throw error;
  }
}

export async function updateSavedProtocolTitle(
  userId: string,
  protocolId: string,
  newTitle: string,
  signal?: AbortSignal
): Promise<{ success: boolean; message: string }> {
  if (!userId || !userId.trim() || !protocolId || !protocolId.trim()) {
    throw new Error('User ID and Protocol ID are required');
  }
  if (!newTitle || !newTitle.trim()) {
    throw new Error('Title is required');
  }
  
  try {
    const res = await fetchWithRetry(
      `${API_BASE}/protocols/saved/${encodeURIComponent(userId)}/${encodeURIComponent(protocolId)}/title`,
      {
        ...DEFAULT_REQUEST_OPTIONS,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
        signal,
      }
    );
    
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Update protocol title failed: ${res.status} ${text}`);
    }
    
    return res.json();
  } catch (error) {
    logError(error, { function: 'updateSavedProtocolTitle', userId, protocolId });
    throw error;
  }
}

export async function isProtocolSaved(
  userId: string,
  protocolId: string,
  signal?: AbortSignal
): Promise<{ success: boolean; is_saved: boolean }> {
  if (!userId || !userId.trim() || !protocolId || !protocolId.trim()) {
    throw new Error('User ID and Protocol ID are required');
  }
  
  try {
    const res = await fetchWithRetry(
      `${API_BASE}/protocols/saved/${encodeURIComponent(userId)}/${encodeURIComponent(protocolId)}/check`,
      { ...DEFAULT_REQUEST_OPTIONS, signal }
    );
    
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Check protocol saved failed: ${res.status} ${text}`);
    }
    
    return res.json();
  } catch (error) {
    logError(error, { function: 'isProtocolSaved', userId, protocolId });
    throw error;
  }
}

// Step thread chat
export async function stepThreadChat(
  request: StepThreadRequest,
  signal?: AbortSignal
): Promise<ChatResponse> {
  try {
    const res = await fetchWithRetry(`${API_BASE}/protocols/step-thread`, {
      ...DEFAULT_REQUEST_OPTIONS,
      timeout: 45000, // Longer timeout for AI responses
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });
    
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Step thread chat failed: ${res.status} ${text}`);
    }
    
    return res.json();
  } catch (error) {
    logError(error, { function: 'stepThreadChat' });
    throw error;
  }
}

// Protocol conversation chat
export async function protocolConversationChat(
  request: ProtocolConversationRequest,
  signal?: AbortSignal
): Promise<ProtocolConversationResponse> {
  try {
    const res = await fetchWithRetry(`${API_BASE}/protocols/conversation`, {
      ...DEFAULT_REQUEST_OPTIONS,
      timeout: 45000, // Longer timeout for AI responses
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });
    
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Protocol conversation failed: ${res.status} ${text}`);
    }
    
    return res.json();
  } catch (error) {
    logError(error, { function: 'protocolConversationChat' });
    throw error;
  }
}

// User management
export async function deleteUserData(
  userId: string,
  signal?: AbortSignal
): Promise<{ success: boolean; message: string; deleted_items: any }> {
  if (!userId || !userId.trim()) {
    throw new Error('User ID is required');
  }
  
  try {
    const response = await fetchWithRetry(
      `${API_BASE}/users/${encodeURIComponent(userId)}`,
      {
        ...DEFAULT_REQUEST_OPTIONS,
        method: 'DELETE',
        signal,
      }
    );

    if (!response.ok) {
      let errorMessage = `Failed to delete user data: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (typeof errorData === 'string') {
          errorMessage = errorData;
        } else if (errorData.detail) {
          errorMessage = errorData.detail;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        } else {
          errorMessage = JSON.stringify(errorData);
        }
      } catch (e) {
        // If JSON parsing fails, use the status text
        errorMessage = `Failed to delete user data: ${response.status} ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  } catch (error) {
    logError(error, { function: 'deleteUserData', userId });
    throw error;
  }
}

// Document upload functions
export async function uploadDocuments(userId: string, file: File, customPrompt?: string, signal?: AbortSignal): Promise<{
  success: boolean;
  upload_id: string;
  filename: string;
  size: number;
  status: string;
  message: string;
}> {
  const formData = new FormData();
  formData.append('file', file);

  if (customPrompt && customPrompt.trim()) {
    formData.append('custom_prompt', customPrompt.trim());
  }

  const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/upload-documents`, {
    method: 'POST',
    body: formData,
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.detail || 'Failed to upload documents');
  }

  return response.json();
}

export async function getUserUploadedProtocols(userId: string, size: number = 20): Promise<{
  success: boolean;
  protocols: Array<{
    id: string;
    title: string;
    organization: string;
    region: string;
    year: number;
    created_at: string;
    steps_count: number;
    citations_count: number;
    source_file: string;
    protocol_data: any;
  }>;
  total: number;
  error?: string;
}> {
  try {
    const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/protocols?size=${size}`);

    if (!response.ok) {
      if (response.status === 404) {
        // Handle 404 as empty protocols list
        console.log('ℹ️ User protocols endpoint not found, returning empty list');
        return {
          success: true,
          protocols: [],
          total: 0,
          error: 'No protocols found (user index may not exist yet)'
        };
      }
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Failed to get uploaded protocols');
    }

    return response.json();
  } catch (error) {
    console.error('❌ Error in getUserUploadedProtocols:', error);
    // Return a successful empty response instead of throwing
    return {
      success: true,
      protocols: [],
      total: 0,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function getUploadStatus(userId: string, uploadId: string): Promise<{
  upload_id: string;
  status: string;
  progress: number;
  protocols_extracted: number;
  protocols_indexed: number;
  processing_time: string;
  created_at: string;
}> {
  const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/upload-status/${encodeURIComponent(uploadId)}`);

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.detail || 'Failed to get upload status');
  }

  return response.json();
}

export async function regenerateProtocol(userId: string, protocolId: string, customPrompt?: string): Promise<{
  success: boolean;
  regeneration_id: string;
  protocol_id: string;
  status: string;
  message: string;
}> {
  const formData = new FormData();

  if (customPrompt && customPrompt.trim()) {
    formData.append('custom_prompt', customPrompt.trim());
  }

  const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/protocols/${encodeURIComponent(protocolId)}/regenerate`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.detail || 'Failed to regenerate protocol');
  }

  return response.json();
}

export async function regenerateUploadProtocols(userId: string, uploadId: string, customPrompt?: string): Promise<{
  success: boolean;
  regeneration_id: string;
  upload_id: string;
  status: string;
  message: string;
}> {
  const formData = new FormData();

  if (customPrompt && customPrompt.trim()) {
    formData.append('custom_prompt', customPrompt.trim());
  }

  const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/upload-regenerate/${encodeURIComponent(uploadId)}`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.detail || 'Failed to regenerate upload protocols');
  }

  return response.json();
}

export async function deleteUserProtocol(userId: string, protocolId: string): Promise<{
  success: boolean;
  message: string;
}> {
  const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/protocols/${encodeURIComponent(protocolId)}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.detail || 'Failed to delete protocol');
  }

  return response.json();
}

export async function deleteAllUserProtocols(userId: string): Promise<{
  success: boolean;
  message: string;
  deleted_count: number;
}> {
  const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/protocols/all`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.detail || 'Failed to delete all protocols');
  }

  return response.json();
}

export async function updateUserProtocolTitle(userId: string, protocolId: string, newTitle: string): Promise<{
  success: boolean;
  message: string;
}> {
  const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/protocols/${encodeURIComponent(protocolId)}/title`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: newTitle }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.detail || 'Failed to update protocol title');
  }

  return response.json();
}

export async function getUploadPreview(userId: string, uploadId: string): Promise<{
  success: boolean;
  upload_id: string;
  protocols: any[];
  total: number;
}> {
  const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/upload-preview/${encodeURIComponent(uploadId)}`);

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.detail || 'Failed to get upload preview');
  }

  return response.json();
}

export async function approveAndIndexUpload(userId: string, uploadId: string): Promise<{
  success: boolean;
  upload_id: string;
  status: string;
  message: string;
}> {
  const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/upload-approve/${encodeURIComponent(uploadId)}`, {
    method: 'POST',
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.detail || 'Failed to approve upload');
  }

  return response.json();
}

export async function cancelUpload(userId: string, uploadId: string): Promise<{
  success: boolean;
  upload_id: string;
  message: string;
}> {
  const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/upload-cancel/${encodeURIComponent(uploadId)}`, {
    method: 'POST'
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Failed to cancel upload' }));
    throw new Error(errorData.detail || 'Failed to cancel upload');
  }

  return response.json();
}
