import { apiFetch } from "../lib/api";

export async function apiRequest<T = any>(
  endpoint: string,
  token: string | null,
  options: RequestInit = {},
): Promise<T> {
  return apiFetch<T>(endpoint, options, token);
}
