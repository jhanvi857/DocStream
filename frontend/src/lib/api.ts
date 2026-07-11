// REST API URL config
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
export const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080";

export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface AuthResponse {
  user: User;
  access_token: string;
  refresh_token: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

export interface Document {
  id: string;
  title: string;
  content: string; // JSON string of CRDT characters or raw content
  owner_id: string;
  snapshot_version: number;
  public_sharing_enabled: boolean;
  public_sharing_role: string;
  user_role?: string;
  created_at: string;
  updated_at: string;
}

export interface HistoryOp {
  opType: string;
  char: string;
  position: number;
  userID: string;
  userName: string;
  createdAt: string;
}

export interface Suggestion {
  word: string;
  frequency: number;
}

// Token helper getters
export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  const val = localStorage.getItem("docstream_access_token");
  if (!val || val === "null" || val === "undefined") return null;
  return val;
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  const val = localStorage.getItem("docstream_refresh_token");
  if (!val || val === "null" || val === "undefined") return null;
  return val;
}

export function getUserID(): string | null {
  if (typeof window === "undefined") return null;
  const val = localStorage.getItem("docstream_user_id");
  if (!val || val === "null" || val === "undefined") return null;
  return val;
}

export function getEmail(): string | null {
  if (typeof window === "undefined") return null;
  const val = localStorage.getItem("docstream_email");
  if (!val || val === "null" || val === "undefined") return null;
  return val;
}

export function setSession(data: AuthResponse | null) {
  if (typeof window === "undefined") return;
  if (data) {
    localStorage.setItem("docstream_access_token", data.access_token);
    localStorage.setItem("docstream_refresh_token", data.refresh_token);
    localStorage.setItem("docstream_user_id", data.user.id);
    localStorage.setItem("docstream_email", data.user.email);
  } else {
    localStorage.removeItem("docstream_access_token");
    localStorage.removeItem("docstream_refresh_token");
    localStorage.removeItem("docstream_user_id");
    localStorage.removeItem("docstream_email");
  }
}

// Global flag to prevent infinite loops during token refresh failures
let isRefreshing = false;

// Custom wrapper around native fetch that handles JWT attachment, 401 intercepting, and token refresh
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAPI<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const headers = new Headers(options.headers || {});

  // 1. Attach authorization token if present
  const token = getAccessToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // Ensure Content-Type is set to JSON if sending a body and not already set
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const mergedOptions: RequestInit = {
    ...options,
    headers,
  };

  let response = await fetch(url, mergedOptions);

  // 2. Handle unauthorized error (Token expired)
  if (response.status === 401 && !isRefreshing) {
    const isDocSession = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("doc");
    const refreshToken = getRefreshToken();
    
    if (refreshToken) {
      isRefreshing = true;
      try {
        // Try to obtain a new access/refresh pair
        const refreshRes = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (refreshRes.ok) {
          const newTokens: TokenPair = await refreshRes.json();
          localStorage.setItem("docstream_access_token", newTokens.access_token);
          localStorage.setItem("docstream_refresh_token", newTokens.refresh_token);

          // Retry the original request with new access token
          headers.set("Authorization", `Bearer ${newTokens.access_token}`);
          response = await fetch(url, {
            ...options,
            headers,
          });
        } else {
          // Refresh token is expired or invalid
          setSession(null);
          if (isDocSession) {
            headers.delete("Authorization");
            response = await fetch(url, {
              ...options,
              headers,
            });
          } else {
            if (typeof window !== "undefined") {
              window.location.href = "/login";
            }
          }
        }
      } catch (err) {
        console.error("Token refresh failed", err);
      } finally {
        isRefreshing = false;
      }
    } else {
      // No refresh token available
      setSession(null);
      if (isDocSession) {
        headers.delete("Authorization");
        response = await fetch(url, {
          ...options,
          headers,
        });
      } else {
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
      }
    }
  }

  // 3. Handle errors returned by the server (e.g., custom structured error formats)
  if (!response.ok) {
    let errMsg = "An unexpected error occurred";
    try {
      const errBody = await response.json();
      if (errBody && errBody.error && errBody.error.message) {
        errMsg = errBody.error.message;
      } else if (errBody && errBody.message) {
        errMsg = errBody.message;
      }
    } catch {
      errMsg = `HTTP Error ${response.status}: ${response.statusText}`;
    }
    throw new Error(errMsg);
  }

  // Handle empty responses
  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

// API Auth operations
export async function register(email: string, password: string): Promise<AuthResponse> {
  const data = await fetchAPI<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setSession(data);
  return data;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const data = await fetchAPI<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setSession(data);
  return data;
}

export function logout() {
  setSession(null);
}

// API Document Operations
export async function getDocuments(): Promise<Document[]> {
  return fetchAPI<Document[]>("/documents", {
    method: "GET",
  });
}

export async function createDocument(title: string): Promise<Document> {
  return fetchAPI<Document>("/documents", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export async function getDocument(id: string): Promise<Document> {
  return fetchAPI<Document>(`/documents/${id}`, {
    method: "GET",
  });
}

export async function updateDocumentTitle(id: string, title: string): Promise<{ message: string }> {
  return fetchAPI<{ message: string }>(`/documents/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export async function deleteDocument(id: string): Promise<{ message: string }> {
  return fetchAPI<{ message: string }>(`/documents/${id}`, {
    method: "DELETE",
  });
}

export async function shareDocument(id: string, email: string, role: "editor" | "viewer"): Promise<{ message: string }> {
  return fetchAPI<{ message: string }>(`/documents/${id}/share`, {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
}

export async function shareDocumentPublic(id: string, enabled: boolean, role: "editor" | "viewer"): Promise<{ message: string }> {
  return fetchAPI<{ message: string }>(`/documents/${id}/share/public`, {
    method: "POST",
    body: JSON.stringify({ enabled, role }),
  });
}

export async function getDocumentHistory(id: string, from = 0, limit = 50): Promise<HistoryOp[]> {
  return fetchAPI<HistoryOp[]>(`/documents/${id}/history?from=${from}&limit=${limit}`, {
    method: "GET",
  });
}

export async function getWordSuggestions(id: string, q: string, limit = 5): Promise<Suggestion[]> {
  return fetchAPI<Suggestion[]>(`/documents/${id}/suggest?q=${encodeURIComponent(q)}&limit=${limit}`, {
    method: "GET",
  });
}
