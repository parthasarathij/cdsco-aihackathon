let cachedApiOrigin: string | null = null;

function normalizeOrigin(value: string | undefined | null): string {
  return (value || '').trim().replace(/\/+$/, '');
}

export function setApiOrigin(origin: string): void {
  cachedApiOrigin = normalizeOrigin(origin);
}

export function getApiOrigin(): string {
  const configured = normalizeOrigin(import.meta.env.VITE_API_BASE_URL as string | undefined);
  if (configured) return configured;
  if (cachedApiOrigin) return cachedApiOrigin;
  return 'http://127.0.0.1:8000';
}
