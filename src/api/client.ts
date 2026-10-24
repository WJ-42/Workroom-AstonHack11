const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

let authToken: string | null = null;

export function setToken(token: string | null) {
  authToken = token;
}

export function getToken(): string | null {
  return authToken;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> ?? {}),
  };

  // Don't set Content-Type for FormData — the browser sets it automatically
  // with the correct multipart boundary. For everything else use JSON.
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const text = await response.text();
    let message = `Request failed with status ${response.status}`;
    if (text) {
      try {
        const json = JSON.parse(text);
        message = json.error || json.message || text;
      } catch {
        message = text;
      }
    }
    throw new Error(message);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export const api = {
  post: <T>(path: string, body: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  postFile: <T>(path: string, formData: FormData) =>
    request<T>(path, {
      method: 'POST',
      body: formData,
    }),

  get: <T>(path: string) =>
    request<T>(path, { method: 'GET' }),

  delete: <T>(path: string) =>
    request<T>(path, { method: 'DELETE' }),
};
