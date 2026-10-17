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

/**
 * API kök adresi.
 *
 * Web'de istekler göreli (`/api/...`) gider. Masaüstünde (Electron, `file://`)
 * göreli adresler dosya sistemine çözüleceği için gömülü sunucunun MUTLAK
 * adresi kullanılır (preload: `window.otoDesktop.apiBase`).
 */
function resolveApiBase(): string {
  try {
    const bridge = (window as any).otoDesktop;
    if (bridge?.apiBase) return String(bridge.apiBase);
    if (window.location.protocol === 'file:') return 'http://localhost:3001';
  } catch {}
  return '';
}

const API_BASE = resolveApiBase();

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

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

/**
 * Sunucudan 401 (oturum geçersiz veya süresi dolmuş) yanıtı geldiğinde
 * çağrılacak "güvenli çıkış" işleyicisini kaydeder. Böylece oturum süresi
 * bittiğinde kullanıcı anında dışarı atılır ve bellekteki hassas veriler
 * (Kasa/Gider/Müşteri) temizlenir.
 */
export function setUnauthorizedHandler(fn: UnauthorizedHandler | null) {
  unauthorizedHandler = fn;
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

  // İsteğin gerçekten bir oturum belirteciyle gönderilip gönderilmediği.
  // Giriş öncesi (belirteç yokken) gelen 401'ler "oturum süresi doldu" SAYILMAZ;
  // aksi halde giriş anında yarış durumunda oturum yanlışlıkla kapatılır.
  const hadToken = Boolean(authToken);

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}/api${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include'
    });

    const data = await response.json().catch(() => null);

    // Oturum geçersiz/süresi dolmuş (401): istemciyi anında ve güvenli şekilde
    // dışarı at. Yalnızca istek bir belirteçle gönderildiyse ve /auth/* değilse.
    if (response.status === 401 && hadToken && !endpoint.startsWith('/auth/')) {
      try {
        unauthorizedHandler?.();
      } catch {}
    }

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
