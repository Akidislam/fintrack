import type { Account, AccountType, Category, TransactionType } from '../types';

export class ApiError extends Error {
  public status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Resolves the backend API base URL from Vite environment variable
 * with fallback to the local development server at http://localhost:5000/api
 */
function cleanBaseUrl(url?: string): string {
  if (!url) return '';
  let trimmed = url.trim();
  while (trimmed.endsWith('/')) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
}

export const API_BASE_URL: string =
  cleanBaseUrl(import.meta.env.VITE_API_URL as string | undefined) ||
  'http://localhost:5000/api';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  count?: number;
  message?: string;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (options.body && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(url, {
      credentials: 'include',
      ...options,
      headers,
    });
  } catch {
    throw new ApiError(
      `Cannot connect to FinTrack backend at ${API_BASE_URL}. Ensure the server is running.`,
      0
    );
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? ((await response.json()) as ApiResponse<T>) : null;

  if (!response.ok) {
    const errorMessage =
      payload && typeof payload === 'object' && typeof payload.message === 'string'
        ? payload.message
        : `Request failed with status ${response.status} (${response.statusText})`;
    throw new ApiError(errorMessage, response.status);
  }

  if (payload && typeof payload === 'object' && 'data' in payload) {
    return payload.data;
  }

  return payload as unknown as T;
}

export interface CreateAccountInput {
  name: string;
  type: AccountType;
  openingBalance?: number;
  currency?: string;
  note?: string;
}

export interface UpdateAccountInput {
  name?: string;
  type?: AccountType;
  openingBalance?: number;
  currency?: string;
  note?: string | null;
  isArchived?: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  currency: string;
  createdAt: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  currency?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export const api = {
  getBaseUrl(): string {
    return API_BASE_URL;
  },

  /**
   * Health check against backend
   */
  async checkHealth(signal?: AbortSignal): Promise<{ success: boolean; message: string }> {
    const url = `${API_BASE_URL}/health`;
    const res = await fetch(url, { signal, credentials: 'include' });
    if (!res.ok) {
      throw new ApiError(`Backend health check failed with status ${res.status}`, res.status);
    }
    return res.json();
  },

  /**
   * Register a new user
   */
  async register(input: RegisterInput): Promise<User> {
    return request<User>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  /**
   * Log in with credentials and obtain HttpOnly cookie
   */
  async login(input: LoginInput): Promise<User> {
    return request<User>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  /**
   * Log out and clear HttpOnly cookie
   */
  async logout(): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>('/auth/logout', {
      method: 'POST',
    });
  },

  /**
   * Get current authenticated user profile
   */
  async getMe(signal?: AbortSignal): Promise<User> {
    return request<User>('/auth/me', { signal });
  },

  /**
   * Fetch all accounts with aggregated live balances
   */
  async getAccounts(includeArchived = false, signal?: AbortSignal): Promise<Account[]> {
    const query = includeArchived ? '?includeArchived=true' : '';
    return request<Account[]>(`/accounts${query}`, { signal });
  },

  /**
   * Fetch a single account by UUID
   */
  async getAccountById(id: string, signal?: AbortSignal): Promise<Account> {
    return request<Account>(`/accounts/${id}`, { signal });
  },

  /**
   * Create a new account in PostgreSQL
   */
  async createAccount(input: CreateAccountInput): Promise<Account> {
    return request<Account>('/accounts', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  /**
   * Update an existing account
   */
  async updateAccount(id: string, input: UpdateAccountInput): Promise<Account> {
    return request<Account>(`/accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  /**
   * Delete an account safely
   */
  async deleteAccount(id: string): Promise<{ success: boolean; message: string }> {
    const url = `${API_BASE_URL}/accounts/${id}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'DELETE',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
    } catch {
      throw new ApiError(`Cannot connect to FinTrack backend at ${API_BASE_URL}`, 0);
    }

    const isJson = res.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await res.json() : null;

    if (!res.ok) {
      const msg = data?.message || `Failed to delete account (${res.status})`;
      throw new ApiError(msg, res.status);
    }

    return data;
  },

  /**
   * Fetch categories from backend
   */
  async getCategories(type?: TransactionType, signal?: AbortSignal): Promise<Category[]> {
    const query = type ? `?type=${type}` : '';
    return request<Category[]>(`/categories${query}`, { signal });
  },
};
