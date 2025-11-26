const toBool = (value: unknown, defaultValue: boolean = false) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return defaultValue;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1';
};

const trimTrailingSlash = (value: string) => value.endsWith('/') && value.length > 1
  ? value.replace(/\/+$/, '')
  : value;

const rawApiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '/api').toString();
const rawUseServerCache = (import.meta.env.VITE_USE_SERVER_CACHE ?? 'true').toString();

export const API_BASE_URL = trimTrailingSlash(rawApiBaseUrl.trim() || '/api');
export const useServerCache = toBool(rawUseServerCache, true);
