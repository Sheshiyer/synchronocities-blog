/**
 * Auth + CORS hardening (ISSUE-02).
 *
 * Two concerns, one module so index.ts stays thin:
 *
 * 1. ADMIN AUTH — a single shared-secret gate for operator-only routes
 *    (indexing, expansion, clustering, diagnostics). The key lives in the
 *    Worker's Secrets (`wrangler secret put ADMIN_API_KEY`) and is sent as
 *    the `X-Admin-Key` header (or `Authorization: Bearer <key>`).
 *
 *    Fail-CLOSED semantics: if ADMIN_API_KEY is not set on the Worker, every
 *    admin route returns 500 server_misconfigured — never silently open.
 *    Comparison is constant-time to avoid leaking the key via timing.
 *
 * 2. CORS — origin allowlist applied centrally by the fetch wrapper in
 *    index.ts. Only the production blog origin and localhost dev origins
 *    get Access-Control-Allow-Origin; everything else gets no CORS headers
 *    (browser blocks the response). Route handlers no longer need to think
 *    about CORS — applyCors() strips any Access-Control-* a handler set and
 *    re-applies the allowlist verdict.
 */

// ============================================================================
// ADMIN AUTH
// ============================================================================

/** Minimal env shape the auth gate needs. The full Worker Env satisfies this. */
export interface AdminAuthEnv {
  ADMIN_API_KEY?: string;
}

/**
 * Routes that require the admin key. Anything not matched here is public.
 * Method matters: POST /maps/cluster (recompute) is admin, GET (read R2
 * artifact) is public.
 */
export function isAdminRoute(method: string, path: string): boolean {
  // All diagnostics — they burn NIM tokens and expose model internals.
  if (path.startsWith('/test/')) return true;
  if (path === '/vectorize/info') return true;

  if (method !== 'POST') return false;
  return (
    path === '/embed/batch' ||
    path === '/expand' ||
    path === '/expand/section' ||
    path === '/expand/v2/section' ||
    path === '/generate/summary' ||
    path === '/maps/cluster'
  );
}

/** Extract the presented key from X-Admin-Key or Authorization: Bearer. */
export function extractAdminKey(request: Request): string | null {
  const headerKey = request.headers.get('X-Admin-Key');
  if (headerKey && headerKey.trim()) return headerKey.trim();

  const auth = request.headers.get('Authorization');
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.slice('Bearer '.length).trim();
    if (token) return token;
  }
  return null;
}

/** Constant-time string comparison (byte-wise, no early exit on mismatch). */
export function timingSafeEqual(a: string, b: string): boolean {
  const ba = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  // Fold the length difference into the accumulator so unequal-length inputs
  // still run the same loop (over the longer input).
  let diff = ba.length === bb.length ? 0 : 1;
  const len = Math.max(ba.length, bb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ba[i % Math.max(ba.length, 1)] ?? 0) ^ (bb[i % Math.max(bb.length, 1)] ?? 0);
  }
  return diff === 0;
}

/**
 * Gate an admin route. Returns null when the request is authorized, or the
 * error Response to send back:
 *   500 {error:'server_misconfigured'} — ADMIN_API_KEY unset (fail CLOSED)
 *   401 {error:'unauthorized'}         — missing or wrong key
 */
export function requireAdmin(request: Request, env: AdminAuthEnv): Response | null {
  const expected = env.ADMIN_API_KEY;
  if (!expected) {
    return Response.json(
      { error: 'server_misconfigured' },
      { status: 500 },
    );
  }
  const provided = extractAdminKey(request);
  if (!provided || !timingSafeEqual(provided, expected)) {
    return Response.json(
      { error: 'unauthorized' },
      { status: 401 },
    );
  }
  return null;
}

// ============================================================================
// CORS — origin allowlist
// ============================================================================

/** Exact-match production origins. */
const ALLOWED_ORIGINS: ReadonlySet<string> = new Set([
  'https://synchronocities.tryambakam.com',
]);

/**
 * Returns the origin to echo back in Access-Control-Allow-Origin, or null
 * when the request's origin is not on the allowlist (or absent — curl,
 * server-to-server scripts; those don't need CORS at all).
 *
 * Dev allowance: http://localhost:<any port> and http://127.0.0.1:<any port>
 * so `astro dev` (4321) and `wrangler pages dev` (8788) work without edits.
 */
export function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  try {
    const u = new URL(origin);
    if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) {
      return origin;
    }
  } catch {
    // malformed Origin header — not allowed
  }
  return null;
}

const CORS_METHODS = 'GET, POST, OPTIONS';
const CORS_REQUEST_HEADERS = 'Content-Type, Authorization, X-Admin-Key';

/**
 * Answer an OPTIONS preflight. 204 with allow headers when the origin is on
 * the allowlist; bare 204 otherwise (browser will block the real request).
 */
export function handleOptions(request: Request): Response {
  const origin = allowedOrigin(request);
  const headers = new Headers();
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', CORS_METHODS);
    headers.set('Access-Control-Allow-Headers', CORS_REQUEST_HEADERS);
    headers.set('Access-Control-Max-Age', '86400');
    headers.set('Vary', 'Origin');
  }
  return new Response(null, { status: 204, headers });
}

/**
 * Apply the CORS allowlist verdict to an outgoing response. Strips any
 * Access-Control-* the handler set (legacy '*' literals) and sets the
 * allowlist headers only when the request's origin is allowed. Streaming
 * bodies (SSE) pass through untouched.
 */
export function applyCors(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  for (const name of [...headers.keys()]) {
    if (name.toLowerCase().startsWith('access-control-')) headers.delete(name);
  }
  const origin = allowedOrigin(request);
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
