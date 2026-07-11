// trakt/config.mjs — Trakt importer tunables. Secrets come from env only.
export const config = {
  baseUrl: 'https://api.trakt.tv',
  apiVersion: '2',
  appName: 'tvtime-migrate',
  userAgent: 'tvtime-migrate/1.0 (+https://github.com/95-ag/tvtime-migrate)',
  postIntervalMs: 1000,
  maxShowsPerChunk: 50,
  backoff: { baseMs: 1000, capMs: 16000, maxRetries: 5 },
  tokenFile: '.trakt-token.json',
};

export function requireEnv(name, env = process.env) {
  const v = env[name];
  if (!v) throw new Error(`${name} is not set. Add it to the root .env (gitignored).`);
  return v;
}

export function buildAuthHeaders(clientId, token) {
  const h = {
    'Content-Type': 'application/json',
    'trakt-api-key': clientId,
    'trakt-api-version': config.apiVersion,
    'User-Agent': config.userAgent,
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}
