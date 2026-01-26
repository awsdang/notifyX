const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export async function apiRequest(endpoint: string, token: string | null, options: RequestInit = {}) {
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
        ...options.headers,
    };

    const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error?.message || error.error || 'Request failed');
    }

    return response.json();
}
