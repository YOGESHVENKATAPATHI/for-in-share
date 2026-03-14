const rawApiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").trim();
const rawWsBaseUrl = (import.meta.env.VITE_WS_BASE_URL || "").trim();

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || /^wss?:\/\//i.test(value);
}

export const API_BASE_URL = rawApiBaseUrl ? trimTrailingSlash(rawApiBaseUrl) : "";

function deriveWsBaseFromApi(apiBase: string): string {
  if (!apiBase) return "";
  if (apiBase.startsWith("https://")) return apiBase.replace("https://", "wss://");
  if (apiBase.startsWith("http://")) return apiBase.replace("http://", "ws://");
  return "";
}

export const WS_BASE_URL = rawWsBaseUrl
  ? trimTrailingSlash(rawWsBaseUrl)
  : deriveWsBaseFromApi(API_BASE_URL);

export function apiUrl(path: string): string {
  if (!path) return path;
  if (isAbsoluteUrl(path)) return path;

  if (API_BASE_URL && path.startsWith("/api")) {
    return `${API_BASE_URL}${path}`;
  }

  return path;
}

export function wsUrl(path: string): string {
  if (isAbsoluteUrl(path)) {
    return path;
  }

  if (WS_BASE_URL) {
    return `${WS_BASE_URL}${path}`;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${path}`;
}

export function installApiFetchPatch(): void {
  if (!API_BASE_URL || typeof window === "undefined") {
    return;
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string") {
      return originalFetch(apiUrl(input), init);
    }

    if (input instanceof URL) {
      return originalFetch(input, init);
    }

    // Request object: if URL is relative /api, clone with rewritten URL.
    const requestUrl = input.url;
    if (requestUrl.startsWith("/api")) {
      const rewritten = new Request(apiUrl(requestUrl), input);
      return originalFetch(rewritten, init);
    }

    return originalFetch(input, init);
  };
}