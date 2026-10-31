// Minimal, dependency-free RSS 2.0 / Atom parser + HTTP helpers.
// Good enough for news feeds; tolerant of CDATA, entities and namespaces.

// Honest User-Agent. In GitHub Actions it points at the repository running the build.
const REPO = process.env.GITHUB_REPOSITORY ? `https://github.com/${process.env.GITHUB_REPOSITORY}` : 'local build';
const UA = `taaza-news-reader/1.0 (+${REPO}; RSS reader)`;

export async function fetchText(url, { timeout = 20000, retries = 1, headers = {} } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': UA, accept: '*/*', ...headers },
        redirect: 'follow',
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`${url}: ${lastErr?.message || lastErr}`);
}

export async function fetchJSON(url, opts) {
  return JSON.parse(await fetchText(url, opts));
}

/** Run async fn over items with limited concurrency. */
export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', rupee: '₹', percnt: '%',
};

export function decodeEntities(s = '') {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(cp); } catch { return m; }
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

function unCDATA(s = '') {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

export function stripTags(s = '') {
  return s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
}

export function cleanText(s = '') {
  // Decode twice: many feeds double-escape (&amp;#39;).
  return decodeEntities(decodeEntities(stripTags(decodeEntities(unCDATA(s)))))
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block, name) {
  // name may include namespace prefix; match <name ...>...</name>
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i');
  const m = block.match(re);
  return m ? m[1] : '';
}

function attr(block, name, attrName) {
  const re = new RegExp(`<${name}\\b[^>]*?\\b${attrName}\\s*=\\s*["']([^"']+)["'][^>]*>`, 'i');
  const m = block.match(re);
  return m ? decodeEntities(m[1]) : '';
}

function findImage(block) {
  const cands = [
    attr(block, 'media:content', 'url'),
    attr(block, 'media:thumbnail', 'url'),
    /<enclosure\b[^>]*type=["']image/i.test(block) ? attr(block, 'enclosure', 'url') : '',
  ];
  const html = unCDATA(tag(block, 'content:encoded') + tag(block, 'description') + tag(block, 'content'));
  const decoded = decodeEntities(html);
  const img = decoded.match(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i);
  if (img) cands.push(img[1]);
  const url = cands.find((u) => u && /^https?:\/\//.test(u) && !/feedburner|pixel|tracking|1x1/i.test(u));
  return url || '';
}

function parseDate(s) {
  if (!s) return 0;
  const t = Date.parse(cleanText(s));
  return Number.isFinite(t) ? t : 0;
}

/**
 * Parse an RSS/Atom document into normalized items.
 * @returns {{title:string, items:Array<{t:string,l:string,s:string,d:string,img:string,ts:number}>}}
 */
export function parseFeed(xml, { maxItems = 120 } = {}) {
  const channelTitle = cleanText(tag(xml.split(/<item\b|<entry\b/i)[0], 'title'));
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/gi) || [];
  const items = [];
  for (const b of blocks.slice(0, maxItems)) {
    let link = cleanText(tag(b, 'link'));
    if (!link || !/^https?:/.test(link)) {
      link = attr(b, 'link[^>]*rel=["\']alternate["\']', 'href') || attr(b, 'link', 'href') || cleanText(tag(b, 'guid'));
    }
    let title = cleanText(tag(b, 'title'));
    const source = cleanText(tag(b, 'source'));
    // Google News appends " - Publisher" to titles; strip when it matches <source>.
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3)).trim();
    let desc = cleanText(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content'));
    if (desc.length > 260) desc = desc.slice(0, 257).replace(/\s+\S*$/, '') + '…';
    if (desc && title && desc.startsWith(title)) desc = '';
    const ts = parseDate(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date'));
    if (!title || !link) continue;
    items.push({ t: title, l: link, s: source, d: desc, img: findImage(b), ts });
  }
  return { title: channelTitle, items };
}

export function normTitle(t) {
  return t.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '').slice(0, 70);
}

/** Merge item lists: dedupe by link + normalized title, newest first. */
export function mergeItems(lists, { max = 80, maxAgeHours = 72, minFresh = 25 } = {}) {
  const seenL = new Set();
  const seenT = new Set();
  const all = [];
  for (const it of lists.flat()) {
    const nt = normTitle(it.t);
    if (seenL.has(it.l) || seenT.has(nt)) continue;
    seenL.add(it.l);
    seenT.add(nt);
    all.push(it);
  }
  all.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const cutoff = Date.now() - maxAgeHours * 3600e3;
  const fresh = all.filter((i) => i.ts >= cutoff || !i.ts);
  const pick = fresh.length >= minFresh ? fresh : all;
  return pick.slice(0, max);
}
