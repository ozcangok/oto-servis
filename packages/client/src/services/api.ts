/**
 * Client API HTTP Client
 */

export class ApiError extends Error {
  code?: string;
  statusCode: number;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

let authToken: string | null = localStorage.getItem('auth_token');

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem('auth_token', token);
  } else {
    localStorage.removeItem('auth_token');
  }
}

export function getAuthToken(): string | null {
  return authToken;
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});

  // Content-Type yalnızca gövde varsa gönderilir; aksi halde sunucu
  // boş gövdeli JSON isteğini reddeder ("Body cannot be empty...")
  if (options.body !== undefined && !(options.body instanceof FormData)) {
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
  }

  if (authToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }

  const url = endpoint.startsWith('http') ? endpoint : `/api${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include'
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg = data?.error || `İşlem başarısız oldu (${response.status})`;
      throw new ApiError(errorMsg, response.status, data?.code);
    }

    return data as T;
  } catch (err: any) {
    if (err instanceof ApiError) {
      throw err;
    }
    // Network / Offline error
    throw new ApiError(
      navigator.onLine
        ? 'Sunucuya bağlanılamadı. Lütfen sunucunun açık olduğundan emin olun.'
        : 'İnternet veya ağ bağlantısı yok. Çevrimdışı moddasınız.',
      0,
      'NETWORK_ERROR'
    );
  }
}
