const API_URL = import.meta.env.VITE_API_URL ?? '/api';

type ApiRequestOptions = {
  token?: string | null;
  organizationId?: string | null;
  signal?: AbortSignal;
};

type ApiWriteOptions = ApiRequestOptions & {
  method: 'POST' | 'PATCH' | 'PUT';
  body: unknown;
};

export async function apiGet<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  return apiRequest<T>(path, { ...options, method: 'GET' });
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  options: ApiRequestOptions = {},
): Promise<T> {
  return apiRequest<T>(path, { ...options, body, method: 'POST' });
}

export async function apiPatch<T>(
  path: string,
  body: unknown,
  options: ApiRequestOptions = {},
): Promise<T> {
  return apiRequest<T>(path, { ...options, body, method: 'PATCH' });
}

export async function apiPut<T>(
  path: string,
  body: unknown,
  options: ApiRequestOptions = {},
): Promise<T> {
  return apiRequest<T>(path, { ...options, body, method: 'PUT' });
}

async function apiRequest<T>(
  path: string,
  options: (ApiRequestOptions & { method: 'GET' }) | ApiWriteOptions,
): Promise<T> {
  const headers = new Headers({ Accept: 'application/json' });
  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`);
  }
  if (options.organizationId) {
    headers.set('x-organization-id', options.organizationId);
  }
  if (options.method !== 'GET') {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_URL}${path}`, {
    headers,
    method: options.method,
    signal: options.signal,
    body: options.method === 'GET' ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { message?: string | string[] }
      | null;
    const message = Array.isArray(body?.message)
      ? body.message.join(', ')
      : body?.message;
    throw new Error(message ?? `Falha na API (${response.status}).`);
  }

  return (await response.json()) as T;
}
