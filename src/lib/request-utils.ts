/**
 * Request Utilities
 * Handles timeouts, retries, abort logic, and request management
 */

export interface RequestOptions extends RequestInit {
  timeout?: number; // milliseconds
  retries?: number;
  retryDelay?: number; // milliseconds
  onRetry?: (attempt: number, error: Error) => void;
}

export class RequestAbortError extends Error {
  constructor(message = 'Request was aborted') {
    super(message);
    this.name = 'RequestAbortError';
  }
}

export class RequestTimeoutError extends Error {
  constructor(message = 'Request timed out') {
    super(message);
    this.name = 'RequestTimeoutError';
  }
}

/**
 * Fetch with timeout support
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestOptions = {}
): Promise<Response> {
  const {
    timeout = 30000, // 30 second default
    signal,
    ...fetchOptions
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // Combine user signal with timeout signal
  const combinedSignal = signal
    ? combineAbortSignals([signal, controller.signal])
    : controller.signal;

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: combinedSignal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      // Check if it was our timeout or user abort
      if (signal?.aborted) {
        throw new RequestAbortError('Request was cancelled by user');
      }
      throw new RequestTimeoutError(`Request timed out after ${timeout}ms`);
    }
    throw error;
  }
}

/**
 * Fetch with retry logic and exponential backoff
 */
export async function fetchWithRetry(
  url: string,
  options: RequestOptions = {}
): Promise<Response> {
  const {
    retries = 3,
    retryDelay = 1000,
    onRetry,
    ...fetchOptions
  } = options;

  let lastError: Error;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, fetchOptions);

      // Don't retry on client errors (4xx) except 408, 429
      if (response.status >= 400 && response.status < 500) {
        if (response.status !== 408 && response.status !== 429) {
          return response;
        }
      }

      // Don't retry on successful responses or non-retryable errors
      if (response.ok || response.status < 500) {
        return response;
      }

      // Server error - retry
      throw new Error(`Server error: ${response.status}`);
    } catch (error: any) {
      lastError = error;

      // Don't retry on abort or timeout (user-initiated)
      if (
        error instanceof RequestAbortError ||
        error instanceof RequestTimeoutError
      ) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === retries) {
        break;
      }

      // Calculate exponential backoff delay
      const delay = retryDelay * Math.pow(2, attempt);
      
      if (onRetry) {
        onRetry(attempt + 1, error);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  throw lastError!;
}

/**
 * Combine multiple abort signals into one
 */
function combineAbortSignals(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  return controller.signal;
}

/**
 * Sleep utility for delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Request manager for tracking and cancelling in-flight requests
 */
export class RequestManager {
  private requests = new Map<string, AbortController>();

  /**
   * Create a new request with a key
   */
  createRequest(key: string): AbortController {
    // Cancel existing request with same key
    this.cancel(key);

    const controller = new AbortController();
    this.requests.set(key, controller);
    return controller;
  }

  /**
   * Cancel a specific request
   */
  cancel(key: string): void {
    const controller = this.requests.get(key);
    if (controller) {
      controller.abort();
      this.requests.delete(key);
    }
  }

  /**
   * Cancel all requests
   */
  cancelAll(): void {
    for (const controller of this.requests.values()) {
      controller.abort();
    }
    this.requests.clear();
  }

  /**
   * Remove completed request from tracking
   */
  complete(key: string): void {
    this.requests.delete(key);
  }

  /**
   * Check if request is active
   */
  isActive(key: string): boolean {
    return this.requests.has(key);
  }
}

/**
 * Global request manager instance
 */
export const globalRequestManager = new RequestManager();
