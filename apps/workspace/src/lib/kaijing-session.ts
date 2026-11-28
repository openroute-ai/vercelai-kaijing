export type KaijingPlan = {
  id: string;
  name: string;
  credits: string;
  priceLabel: string;
  description: string;
};

export type KaijingSession = {
  user: { id: string; email: string; name: string };
  balance: string;
  welcomeGrant?: { amount: string; note: string };
  costs?: { episodeText: string; characterImage: string; shotVideo: string };
  plans?: KaijingPlan[];
};

export async function requestCloud<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'include',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) {
    throw new Error(data.message || `请求失败（${response.status}）`);
  }
  return data;
}

export async function fetchCloudSession() {
  try {
    const data = await requestCloud<{ session: KaijingSession | null }>(
      '/cloud-api/api/v1/cloud/session'
    );
    return { session: data.session ?? null, offline: false };
  } catch {
    return { session: null, offline: true };
  }
}

export function balanceNumber(balance: string | null | undefined) {
  const value = Number(balance);
  return Number.isFinite(value) ? value : 0;
}

export function formatCredits(balance: string | number) {
  const value = typeof balance === 'number' ? balance : Number(balance);
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
