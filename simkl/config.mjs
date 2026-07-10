// simkl/config.mjs — non-secret Simkl importer tunables. Secret (SIMKL_CLIENT_ID) comes from env only.
export const config = {
  baseUrl: 'https://api.simkl.com',
  appName: 'tvtime-migrate',
  appVersion: '1.0',
  userAgent: 'tvtime-migrate/1.0 (+https://github.com/95-ag/tvtime-migrate)',
  postIntervalMs: 1000, // Simkl: 1 POST/sec per token
  maxShowsPerChunk: 50, // conservative; keeps season/episode nesting intact per POST
  backoff: { baseMs: 1000, capMs: 16000, maxRetries: 5 }, // 1→2→4→8→16s on 429/5xx
  tokenFile: '.simkl-token.json',
};

export function requireClientId(env = process.env) {
  const id = env.SIMKL_CLIENT_ID;
  if (!id) throw new Error('SIMKL_CLIENT_ID is not set. Add it to the root .env (gitignored).');
  return id;
}
