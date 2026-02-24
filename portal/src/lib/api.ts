function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL || "http://localhost:3000";
  return configured.endsWith("/api/v1")
    ? configured
    : `${configured.replace(/\/$/, "")}/api/v1`;
}

const API_URL = getApiBaseUrl();
const API_KEY = import.meta.env.VITE_API_KEY || "";

export interface ApiEnvelope<T> {
  error: boolean;
  message: string;
  data: T;
  totalCount?: number;
}

function buildHeaders(
  options: RequestInit,
  token?: string | null,
): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
    ...(API_KEY && { "X-API-Key": API_KEY }),
    ...options.headers,
  };
}

async function requestJson(
  endpoint: string,
  options: RequestInit = {},
  token?: string | null,
) {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: buildHeaders(options, token),
  });
  const json = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      json?.message || json?.error?.message || json?.error || "Request failed";
    throw new Error(message);
  }

  return json;
}

/**
 * Generic fetch helper that unwraps the API envelope.
 * API returns { error: false, message, data } on success.
 * Legacy fallback: { success: true, data }.
 */
export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const json = await requestJson(endpoint, options, token);

  // New envelope: { error, message, data } -> data
  if (json && typeof json === "object" && "error" in json && "data" in json) {
    return json.data as T;
  }

  // Legacy envelope: { success, data } -> data
  if (json && typeof json === "object" && "success" in json && "data" in json) {
    return json.data as T;
  }

  return json as T;
}

/**
 * Fetch helper that preserves the API envelope and metadata (e.g. totalCount).
 */
export async function apiFetchEnvelope<T>(
  endpoint: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<ApiEnvelope<T>> {
  const json = await requestJson(endpoint, options, token);

  if (json && typeof json === "object" && "error" in json && "data" in json) {
    return json as ApiEnvelope<T>;
  }

  return {
    error: false,
    message: "Success",
    data: json as T,
  };
}
