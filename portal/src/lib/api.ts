const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_KEY = import.meta.env.VITE_API_KEY || '';

export async function apiFetch<T>(endpoint: string, options: RequestInit = {}, token?: string | null): Promise<T> {
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
        ...(API_KEY && { 'X-API-Key': API_KEY }),
        ...options.headers,
    };

    const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error?.message || error.error || 'Request failed');
    }

    return response.json();
}
