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

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

export async function searchProtocols(req: BackendSearchRequest): Promise<BackendSearchResponse> {
  const res = await fetch(`${API_BASE}/protocols/search`, {
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

export async function hybridSearchProtocols(req: BackendSearchRequest): Promise<BackendSearchResponse> {
  const res = await fetch(`${API_BASE}/protocols/hybrid-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Hybrid search failed: ${res.status} ${text}`);
  }
  return res.json();
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
