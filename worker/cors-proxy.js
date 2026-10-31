// Optional: your own free CORS proxy on Cloudflare Workers (free plan: 100k requests/day).
// Makes the dashboard's "Live" button and custom topics fast and reliable,
// instead of depending on public proxies.
//
// Deploy (no install needed):
//   1. https://dash.cloudflare.com → Workers & Pages → Create → "Hello World" worker
//   2. Replace its code with this file → Deploy
//   3. Copy the URL (https://<name>.<you>.workers.dev) into the dashboard's
//      Settings → "Own CORS proxy".
//
// Only hosts in ALLOW can be fetched, so it can't be abused as an open proxy.

const ALLOW = ['news.google.com', 'api.gold-api.com', 'cdn.jsdelivr.net'];
// Lock to your Pages site (and local testing). Use ['*'] to allow any origin.
const ORIGINS = ['https://pavan-98.github.io', 'http://localhost:8080'];

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('origin') || '';
    const allowOrigin = ORIGINS.includes('*') ? '*' : ORIGINS.includes(origin) ? origin : ORIGINS[0];
    const cors = {
      'access-control-allow-origin': allowOrigin,
      'access-control-allow-methods': 'GET, OPTIONS',
      vary: 'origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors });

    const target = new URL(request.url).searchParams.get('url');
    let url;
    try { url = new URL(target); } catch { return new Response('Missing or bad ?url=', { status: 400, headers: cors }); }
    if (url.protocol !== 'https:' || !ALLOW.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`))) {
      return new Response('Host not allowed', { status: 403, headers: cors });
    }

    // Cache at the edge for 2 minutes so repeated clicks don't refetch.
    const cache = caches.default;
    const key = new Request(url.toString());
    let res = await cache.match(key);
    if (!res) {
      const upstream = await fetch(url.toString(), { headers: { 'user-agent': 'personal-news-dashboard/1.0' } });
      res = new Response(upstream.body, upstream);
      res.headers.set('cache-control', 'public, max-age=120');
      if (upstream.ok) ctx.waitUntil(cache.put(key, res.clone()));
    }
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  },
};
