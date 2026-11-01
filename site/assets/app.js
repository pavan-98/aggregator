import { makeT } from './i18n.js';
import { googleNewsUrl } from './gnews.js';
import { renderChart } from './chart.js';

// ================================================================== state
const KEY = 'pnd.v1';
const SCHEMA = 3;
const DEFAULTS = {
  schema: SCHEMA,
  uiLang: (navigator.language || '').startsWith('te') ? 'te' : 'en',
  newsLang: 'auto', // auto | en | te | both
  theme: 'auto',
  order: [],
  hidden: [],
  custom: [], // {id, name, q}
  active: 'my-city',
  city: '', // chosen on first launch
  karat: 'k22',
  range: 30,
  goldView: 'chart',
  calc: { w: 10, k: 'k22', m: 12 },
  muted: [],
  proxy: '',
  installDismissed: 0,
  installedAt: 0,
  live: false, // Live mode, only when the user turns it on; remembered across visits // set when this browser installed the app (Android shares storage with it)
  install: { visits: 0, shown: 0, last: 0 }, // full-screen install sheet schedule
};
function load() {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch {}
  const s = { ...structuredClone(DEFAULTS), ...stored };
  if (stored.schema && stored.schema < 3) {
    // v2 → v3: the per-city 'vizag' topic became the generic 'my-city' topic.
    const swap = (id) => (id === 'vizag' ? 'my-city' : id);
    s.active = swap(s.active);
    s.order = s.order.map(swap);
    s.hidden = s.hidden.map(swap);
  }
  s.schema = SCHEMA;
  return s;
}
let state = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };
save(); // persist any migration
let t = makeT(state.uiLang);

// ================================================================== helpers
const $ = (s, r = document) => r.querySelector(s);
const h = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k in n && typeof v !== 'string') n[k] = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
  return n;
};
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : null);
const svg = (paths, { sw = 2 } = {}) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = paths
    .split('|')
    .map((d) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`)
    .join('');
  return s;
};
const ICON = {
  up: 'm6 15 6-6 6 6',
  down: 'm6 9 6 6 6-6',
  x: 'M6 6l12 12M18 6 6 18',
  right: 'm9 6 6 6-6 6',
  home: 'M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z',
  news: 'M5 4h11a2 2 0 0 1 2 2v13a2 2 0 0 0 2-2V8|M5 4a1 1 0 0 0-1 1v13a2 2 0 0 0 2 2h14|M8 8h6M8 12h6M8 16h4',
  gold: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z|M14.8 9.2c-.5-.8-1.5-1.2-2.8-1.2-1.7 0-2.8.8-2.8 2s1 1.7 2.8 2 2.8.8 2.8 2-1.1 2-2.8 2c-1.3 0-2.4-.5-2.9-1.3M12 6.5V8M12 16v1.5',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  share: 'M12 3v12|m8 7 4-4 4 4|M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1',
  plusSq: 'M4 4h16v16H4z|M12 8v8M8 12h8',
};

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2600);
}

// ================================================================== formatting
const locale = () => (state.uiLang === 'te' ? 'te-IN' : 'en-IN');
const inr = (v, frac = 0) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: frac, minimumFractionDigits: frac }).format(v);
const usd = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v);
const num = (v, frac = 0) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: frac }).format(v);
const shortInr = (v) => (v >= 1e5 ? `${num(v / 1e5, 2)}L` : v >= 1e3 ? `${num(v / 1e3, 1)}k` : num(v));

function rel(ts) {
  if (!ts) return '';
  const s = Math.round((ts - Date.now()) / 1000);
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  try {
    const f = new Intl.RelativeTimeFormat(state.uiLang, { numeric: 'auto', style: 'short' });
    for (const [u, sec] of units) if (Math.abs(s) >= sec) return f.format(Math.round(s / sec), u);
    return f.format(0, 'minute');
  } catch {
    return new Date(ts).toLocaleString();
  }
}
const fmtDate = (iso, short) =>
  new Intl.DateTimeFormat(locale(), short ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(`${iso}T12:00:00`));

// ================================================================== data
const DATA = './data';
let index = { topics: [], updated: 0 };
let gold = null;
let goldHist = null;
let liveSpot = null;
let offline = false;
let booted = false;

async function getJSON(url) {
  const u = `${url}${url.includes('?') ? '&' : '?'}v=${Math.floor(Date.now() / 60000)}`;
  const r = await fetch(u, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  offline = r.headers.get('x-offline') === '1';
  return r.json();
}

// ---- cities ----
const cityMeta = (id) => gold?.cityMeta?.find((c) => c.id === id);
const cityName = (id) => cityMeta(id)?.name?.[state.uiLang] || cityMeta(id)?.name?.en || id;
const cityShort = (id) => cityMeta(id)?.short?.[state.uiLang] || cityName(id);
function goldCity() {
  if (!gold) return null;
  const ids = Object.keys(gold.cities || {});
  const id = ids.includes(state.city) ? state.city : ids[0]; // before a city is picked: first city
  return id ? { id, ...gold.cities[id] } : null;
}

// ---- topics ----
// The user's city news appears as one stable topic, 'my-city', whatever the city is.
function myCityTopic() {
  const pre = index.topics.find((x) => x.city === state.city);
  const name = { en: cityMeta(state.city)?.name?.en || state.city, te: cityMeta(state.city)?.name?.te || state.city };
  if (pre) return { ...pre, id: 'my-city', file: pre.id, icon: '⌂', name, custom: false };
  if (!state.city) return null;
  // City not pre-built (e.g. removed from config): fetch it live.
  return { id: 'my-city', icon: '⌂', custom: true, name, google: { en: { q: name.en, when: '2d' }, te: { q: name.te, when: '2d' } } };
}
function allTopics() {
  const built = index.topics.filter((x) => !x.city).map((x) => ({ ...x, custom: false }));
  const mine = myCityTopic();
  if (mine) built.unshift(mine);
  const custom = state.custom.map((c) => ({
    id: c.id, icon: '#', custom: true, name: { en: c.name, te: c.name },
    google: { en: { q: c.q, when: '7d' }, te: { q: c.q, when: '7d' } },
  }));
  const list = [...built, ...custom];
  const pos = new Map(state.order.map((id, i) => [id, i]));
  return list
    .map((x, i) => ({ x, k: pos.has(x.id) ? pos.get(x.id) : 1000 + i }))
    .sort((a, b) => a.k - b.k)
    .map((o) => o.x);
}
const visibleTopics = () => allTopics().filter((x) => !state.hidden.includes(x.id));
const topicName = (x) => x.name?.[state.uiLang] || x.name?.en || x.id;
const newsLangs = () => (state.newsLang === 'both' ? ['en', 'te'] : [state.newsLang === 'auto' ? state.uiLang : state.newsLang]);
const homeTopic = myCityTopic;

// ================================================================== live fetching (CORS proxies)
const PROXIES = [
  { id: 'own', url: (u) => {
      const p = state.proxy.trim();
      if (!p) return null;
      return p.includes('{url}') ? p.replace('{url}', encodeURIComponent(u)) : `${p}${p.includes('?') ? '&' : '?'}url=${encodeURIComponent(u)}`;
    } },
  { id: 'allorigins', url: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` },
  { id: 'codetabs', url: (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}` },
  { id: 'rss2json', json: true, url: (u) => `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(u)}` },
];

function parseRssXml(text) {
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('bad xml');
  const nodes = [...doc.querySelectorAll('item, entry')];
  if (!nodes.length && !doc.querySelector('rss, feed, channel')) throw new Error('not a feed');
  return nodes.map((n) => {
    const get = (sel) => n.getElementsByTagName(sel)[0]?.textContent?.trim() || '';
    const source = get('source');
    let title = get('title');
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    const linkEl = n.getElementsByTagName('link')[0];
    const link = linkEl?.textContent?.trim() || linkEl?.getAttribute('href') || '';
    const ts = Date.parse(get('pubDate') || get('published') || get('updated')) || 0;
    return { t: title, l: link, s: source, d: '', img: '', ts };
  });
}
function parseRss2Json(j) {
  if (j.status !== 'ok') throw new Error(j.message || 'rss2json error');
  return j.items.map((i) => {
    let title = i.title || '';
    const m = title.match(/ - ([^-]+)$/);
    const source = m ? m[1].trim() : j.feed?.title || '';
    if (m) title = title.slice(0, -m[0].length);
    return { t: title, l: i.link, s: source, d: '', img: i.thumbnail || '', ts: Date.parse(`${(i.pubDate || '').replace(' ', 'T')}Z`) || 0 };
  });
}
async function tryProxy(p, feedUrl, outer) {
  const u = p.url(feedUrl);
  if (!u) throw new Error(`${p.id}: off`);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  const onOuter = () => ctrl.abort();
  outer?.addEventListener('abort', onOuter);
  try {
    const r = await fetch(u, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`${p.id} HTTP ${r.status}`);
    const items = p.json ? parseRss2Json(await r.json()) : parseRssXml(await r.text());
    if (!items.length) throw new Error(`${p.id}: empty`);
    return items;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onOuter);
  }
}
// Your own proxy (if set) goes first; otherwise public proxies race and the first valid feed wins.
async function fetchViaProxies(feedUrl) {
  const own = PROXIES[0];
  if (state.proxy.trim()) {
    try { return await tryProxy(own, feedUrl); } catch {}
  }
  const outer = new AbortController();
  const items = await Promise.any(PROXIES.slice(1).map((p) => tryProxy(p, feedUrl, outer.signal)));
  outer.abort();
  return items;
}
// Live results are kept on the device (last 8 topic/language pairs, 40 stories each), so a
// reload or a return to the app shows them instantly while a fresh fetch runs.
const LIVE_KEY = 'pnd.live';
const LIVE_TTL = 2 * 60e3; // at most one fetch per topic every 2 minutes
const liveId = (topic, lang) => `${topic.file || topic.id}.${lang}`;
function liveCacheAll() { try { return JSON.parse(localStorage.getItem(LIVE_KEY) || '{}') || {}; } catch { return {}; } }
const liveCacheGet = (topic, lang) => liveCacheAll()[liveId(topic, lang)] || null;
function liveCachePut(topic, lang, items) {
  const all = liveCacheAll();
  all[liveId(topic, lang)] = { at: Date.now(), items: items.slice(0, 40) };
  const keep = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, 8);
  try { localStorage.setItem(LIVE_KEY, JSON.stringify(Object.fromEntries(keep))); } catch {}
}
// If every proxy fails twice in a row, pause Live for 10 minutes and use the scheduled data.
let liveFailStreak = 0;
let livePausedUntil = 0;
const livePaused = () => Date.now() < livePausedUntil;
async function fetchLive(topic, lang) {
  const spec = topic.google?.[lang];
  if (!spec) return { items: [], at: Date.now() };
  if (livePaused()) throw new Error('live paused');
  if (!navigator.onLine) throw new Error('offline');
  try {
    const items = await fetchViaProxies(googleNewsUrl(spec, lang));
    liveFailStreak = 0;
    liveCachePut(topic, lang, items);
    return { items, at: Date.now() };
  } catch (e) {
    if (++liveFailStreak >= 2) { liveFailStreak = 0; livePausedUntil = Date.now() + 10 * 60e3; }
    throw e;
  }
}

// ================================================================== feeds (home + news view share this)
// Some feeds carry items whose "headline" is just the site's name ("RegNews").
const isJunkTitle = (title) => title.trim().length < 20 && title.trim().split(/\s+/).length < 3;
function mergeItems(lists) {
  const seen = new Set();
  const out = [];
  const norm = (s) => s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '').slice(0, 70);
  for (const it of lists.flat()) {
    const k = norm(it.t);
    if (!it.t || !safeUrl(it.l) || seen.has(k) || seen.has(it.l) || isJunkTitle(it.t)) continue;
    seen.add(k); seen.add(it.l);
    out.push(it);
  }
  return out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

// Coloured initial badge per publisher (desktop cards).
const graphemes = (str) => (typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter().segment(str)].map((x) => x.segment) : [...str]);
const srcHue = (str) => [...str].reduce((a, c) => (a * 31 + c.codePointAt(0)) % 360, 7);
const srcAva = (src) => h('span', { class: 'src-ava', 'aria-hidden': 'true', style: `--hue:${srcHue(src)}`, text: (graphemes(src.trim())[0] || '•').toUpperCase() });

let feeds = [];
function storyEl(i, both) {
  const img = safeUrl(i.img);
  return h('li', { class: 'story' },
    h('div', { class: 'story-body' },
      h('h3', { class: 'story-title', lang: i.lang }, h('a', { href: i.l, target: '_blank', rel: 'noopener noreferrer', text: i.t })),
      i.d ? h('p', { class: 'story-desc', lang: i.lang, text: i.d }) : null,
      h('div', { class: 'story-meta' },
        i.s ? srcAva(i.s) : null,
        i.s ? h('span', { class: 'src', text: i.s }) : null,
        i.s && i.ts ? h('span', { 'aria-hidden': 'true', text: '·' }) : null,
        i.ts ? h('time', { datetime: new Date(i.ts).toISOString(), text: rel(i.ts) }) : null,
        both ? h('span', { class: 'lang-tag', text: i.lang === 'te' ? 'తె' : 'EN' }) : null)),
    img ? h('img', { class: 'story-thumb', src: img, alt: '', loading: 'lazy', decoding: 'async', width: 84, height: 64,
      referrerPolicy: 'no-referrer', onerror: (e) => e.target.remove() }) : null,
    i.s ? h('button', { type: 'button', class: 'story-mute', title: `${t('mute')}: ${i.s}`, 'aria-label': `${t('mute')}: ${i.s}`, text: '⊘',
      onclick: (e) => {
        e.stopPropagation();
        state.muted = [...new Set([...state.muted, i.s])];
        save();
        feeds.forEach((f) => f.render());
        toast(`${t('mute')}: ${i.s}`);
      } }) : null);
}

function createFeed(root) {
  const listEl = root.querySelector('.feed');
  const statusEl = root.querySelector('.news-status');
  const titleEl = root.querySelector('.feed-title');
  const filterEl = root.querySelector('input[type=search]');
  const liveBtn = root.querySelector('.btn-live');
  const moreBtn = root.querySelector('.btn-more');
  const st = { topic: null, items: [], updated: 0, limit: 40, req: 0, done: 0, pending: null };

  function render() {
    root.querySelector('.empty')?.remove();
    if (st.topic && titleEl.dataset.fixed !== '1') titleEl.textContent = topicName(st.topic);
    const q = (filterEl?.value || '').trim().toLowerCase();
    const muted = new Set(state.muted.map((m) => m.toLowerCase()));
    const both = newsLangs().length > 1;
    const items = st.items.filter(
      (i) => !muted.has((i.s || '').toLowerCase()) && (!q || i.t.toLowerCase().includes(q) || (i.s || '').toLowerCase().includes(q))
    );
    if (!items.length) {
      listEl.replaceChildren();
      moreBtn.hidden = true;
      if (st.done) listEl.after(h('div', { class: 'empty', text: st.items.length ? t('noNews') : t('loadFail') }));
      return;
    }
    // Desktop shows the first card as a large lead: pick a recent story with a real headline.
    if (isWide() && !q) {
      const lead = items.slice(0, 8).findIndex((i) => i.d && i.t.length >= 40);
      const pick = lead > 0 ? lead : lead === 0 ? 0 : items.slice(0, 8).findIndex((i) => i.t.length >= 45);
      if (pick > 0) items.unshift(...items.splice(pick, 1));
    }
    listEl.replaceChildren(...items.slice(0, st.limit).map((i) => storyEl(i, both)));
    moreBtn.hidden = items.length <= st.limit;
    moreBtn.textContent = `${t('showMore')} (${items.length - st.limit})`;
  }
  function skeleton() {
    root.querySelector('.empty')?.remove();
    listEl.replaceChildren(...Array.from({ length: 6 }, () =>
      h('li', { class: 'story skeleton', 'aria-hidden': 'true' },
        h('div', { class: 'story-body' }, h('div', { class: 'sk', style: 'width:92%' }), h('div', { class: 'sk', style: 'width:64%' }),
          h('div', { class: 'sk', style: 'width:30%;height:10px;margin-top:10px' })))));
  }
  // New stories that arrive while the reader is scrolled into the list wait behind a
  // "↑ N new stories" pill instead of pushing what they're reading down the page.
  const pill = h('button', { type: 'button', class: 'new-pill', hidden: true, onclick: () => { applyPending(); root.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
  root.append(pill);
  const readingBelowTop = () => !root.closest('.view')?.hidden && listEl.getBoundingClientRect().top < 0;
  function applyPending() {
    if (!st.pending) return;
    st.items = st.pending;
    st.pending = null;
    pill.hidden = true;
    render();
  }
  function update(items, { quiet }) {
    const shown = new Set(st.items.map((i) => i.l));
    const fresh = items.filter((i) => !shown.has(i.l)).length;
    if (quiet && st.items.length && fresh && readingBelowTop()) {
      st.pending = items;
      pill.textContent = `↑ ${t('newStories', { n: fresh })}`;
      pill.hidden = false;
      return;
    }
    st.items = items;
    st.pending = null;
    pill.hidden = true;
    render();
  }
  let sf = 0;
  window.addEventListener('scroll', () => {
    if (!st.pending || sf) return;
    sf = requestAnimationFrame(() => { sf = 0; if (st.pending && !readingBelowTop()) applyPending(); });
  }, { passive: true });

  function setStatus({ wantLive, liveAt, liveFailed, updated }) {
    let msg = '';
    if (wantLive && liveAt && !liveFailed) msg = `${t('liveUpdated')} ${rel(liveAt)}`;
    else if (wantLive && liveFailed) msg = st.topic?.custom ? t('loadFail') : livePaused() ? t('livePaused') : t('liveFail');
    if (!msg && updated) msg = `${t('updated')} ${rel(updated)}${offline ? ` · ${t('offline')}` : ''}`;
    statusEl.textContent = msg;
    st.updated = wantLive && liveAt && !liveFailed ? liveAt : updated;
    updateTopbarTime();
  }

  async function load(topic, { quiet = false } = {}) {
    if (!topic) return;
    const changed = (st.topic?.file || st.topic?.id) !== (topic.file || topic.id);
    st.topic = topic;
    if (changed) { st.items = []; st.pending = null; pill.hidden = true; st.limit = 40; st.done = 0; if (filterEl) filterEl.value = ''; }
    const my = ++st.req;
    const langs = newsLangs();
    const wantLive = state.live || !!topic.custom;
    if (titleEl.dataset.fixed !== '1') titleEl.textContent = topicName(topic);
    liveBtn.classList.toggle('on', wantLive);
    liveBtn.classList.remove('busy');
    if (!quiet && !st.items.length) { statusEl.textContent = t('loading'); skeleton(); }

    // 1) Instant: the scheduled snapshot plus the last live results kept on this device.
    const scheduled = await Promise.all(langs.map(async (lang) => {
      if (topic.custom) return { items: [], updated: 0 };
      try {
        const j = await getJSON(`${DATA}/news/${topic.file || topic.id}.${lang}.json`);
        return { items: j.items.map((i) => ({ ...i, lang })), updated: j.updated || 0 };
      } catch { return { items: [], updated: 0 }; }
    }));
    if (my !== st.req) return;
    const updated = Math.max(0, ...scheduled.map((x) => x.updated));
    const cached = langs.map((lang) => (wantLive ? liveCacheGet(topic, lang) : null));
    const withLang = (list, k) => (list || []).map((i) => ({ ...i, lang: langs[k] }));
    const combine = (liveLists) => mergeItems([...liveLists, ...scheduled.map((x) => x.items)]);
    const first = combine(cached.map((c, k) => withLang(c?.items, k)));
    let liveAt = Math.max(0, ...cached.map((c) => c?.at || 0));
    if (first.length) { update(first, { quiet: quiet || !changed }); st.done = 1; }
    setStatus({ wantLive, liveAt, liveFailed: false, updated });

    // 2) Live on: refresh in the background when the device copy is older than 2 minutes.
    const stale = wantLive && !document.hidden && cached.some((c, k) => topic.google?.[langs[k]] && (!c || Date.now() - c.at > LIVE_TTL));
    if (!stale) {
      if (!first.length) { st.done = 1; update([], { quiet: false }); }
      return;
    }
    liveBtn.classList.add('busy');
    const fresh = await Promise.all(langs.map(async (lang, k) => {
      try { return await fetchLive(topic, lang); } catch { return null; }
    }));
    if (my !== st.req) return;
    liveBtn.classList.remove('busy');
    const liveFailed = fresh.every((f) => !f) && !cached.some(Boolean);
    liveAt = Math.max(liveAt, ...fresh.map((f) => f?.at || 0));
    update(combine(fresh.map((f, k) => withLang(f ? f.items : cached[k]?.items, k))), { quiet: first.length > 0 });
    st.done = 1;
    if (!st.items.length) render();
    setStatus({ wantLive, liveAt, liveFailed: liveFailed || (fresh.every((f) => !f) && !liveAt), updated });
  }
  liveBtn.addEventListener('click', () => {
    state.live = !state.live; // remembered: stays on across reloads until turned off
    save();
    feeds.forEach((f) => f.syncLive());
    if (state.live) { liveFailStreak = 0; livePausedUntil = 0; } // a deliberate tap retries straight away
    load(st.topic);
  });
  const syncLive = () => liveBtn.classList.toggle('on', state.live || !!st.topic?.custom);
  moreBtn.addEventListener('click', () => { st.limit += 40; render(); });
  let ft;
  filterEl?.addEventListener('input', () => { clearTimeout(ft); ft = setTimeout(render, 120); });
  return { load, render, st, syncLive };
}

let homeFeed;
let newsFeed;

function updateTopbarTime() {
  const ts = Math.max(newsFeed?.st.updated || 0, homeFeed?.st.updated || 0, index.updated || 0);
  $('#updated').textContent = ts ? `${t('updated')} ${rel(ts)}` : '';
}

// ================================================================== router / views
const VIEWS = ['home', 'news', 'gold', 'settings'];
let view = 'home';
const isWide = () => window.matchMedia('(min-width: 900px)').matches;

function parseHash() {
  const raw = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [v, sub] = raw.split('/');
  if (VIEWS.includes(v)) return { v, sub };
  if (raw && !raw.includes('/')) return { v: 'news', sub: raw }; // v1 links (#topic)
  return { v: 'home' };
}

function renderNav() {
  const items = [
    ['home', gold && state.city ? cityShort(state.city) : t('navHome'), ICON.home],
    ['news', t('navNews'), ICON.news],
    ['gold', t('navGold'), ICON.gold],
    ['settings', t('navSettings'), ICON.settings],
  ];
  const mk = () => items.map(([v, label, ic]) =>
    h('a', { href: `#/${v}`, 'aria-current': v === view ? 'page' : null },
      h('span', { class: 'tab-ico' }, svg(ic)), h('span', { class: 'tab-label', text: label })));
  $('#tabbar').replaceChildren(...mk());
  $('.tabs-top').replaceChildren(...mk());
}

function route() {
  const { v, sub } = parseHash();
  if (v === 'news' && sub && sub !== state.active) { state.active = sub; save(); }
  const changed = v !== view;
  view = v;
  document.querySelectorAll('.view').forEach((s) => (s.hidden = s.dataset.view !== v));
  renderNav();
  const titles = { home: t('appTitle'), news: t('navNews'), gold: t('goldRate'), settings: t('navSettings') };
  $('#appbar-title').textContent = isWide() ? t('appTitle') : titles[v];
  renderView(v);
  if (changed) window.scrollTo(0, 0);
  pollSpot();
}
// Desktop page header: greeting/date on Home, a title on the other views (hidden on phones).
function renderPageHead() {
  const el = $('#page-head');
  if (!el) return;
  const now = new Date();
  const hr = now.getHours();
  const city = gold && state.city ? cityName(state.city) : '';
  const today = new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  const gc = gold && goldCity();
  const heads = {
    home: [t(hr < 12 ? 'greetMorning' : hr < 17 ? 'greetAfternoon' : 'greetEvening'), [today, city].filter(Boolean).join(' · ')],
    news: [t('navNews'), t('newsSub')],
    gold: [t('goldRate'), [gc ? cityName(gc.id) : '', gc ? fmtDate(gc.date) : ''].filter(Boolean).join(' · ')],
    settings: [t('navSettings'), t('settingsSub')],
  };
  const [title, sub] = heads[view] || heads.home;
  el.replaceChildren(h('p', { class: 'ph-kicker', text: sub }), h('h1', { class: 'ph-title', text: title }));
}

function renderView(v, opts = {}) {
  renderPageHead();
  if (v === 'home') renderHome(opts);
  else if (v === 'news') renderNews(opts);
  else if (v === 'gold') renderGoldPage();
  else if (v === 'settings') renderSettings();
}

// ================================================================== HOME
function renderHome({ quiet } = {}) {
  renderInstallBanner();
  $('#home-gold').replaceChildren(...[goldSummaryCard(), homeTrendCard()].filter(Boolean));
  const title = $('#home-feed .feed-title');
  title.dataset.fixed = '1';
  title.textContent = t('cityNews', { city: gold ? cityName(state.city) : '' });
  homeFeed.load(homeTopic(), { quiet });
}

// ================================================================== NEWS
// Chips are rebuilt only when the topic list changes, and the bar scrolls only when the
// active topic changes and is off screen — so background refreshes never yank the bar
// away from where the user scrolled it.
let chipsKey = '';
let chipsActive = '';
function renderTopicChips() {
  const bar = $('#topics');
  const list = visibleTopics();
  if (!list.find((x) => x.id === state.active) && list[0]) state.active = list[0].id;
  const key = list.map((x) => `${x.id}:${x.icon || ''}:${topicName(x)}`).join('|');
  if (key !== chipsKey) {
    chipsKey = key;
    bar.replaceChildren(...list.map((x) =>
      h('button', { type: 'button', class: 'chip', role: 'tab', 'data-id': x.id, onclick: () => switchTopic(x.id) },
        h('span', { class: 'chip-icon', 'aria-hidden': 'true', text: x.icon || '•' }),
        h('span', { text: topicName(x) }))));
  }
  bar.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-selected', String(c.dataset.id === state.active)));
  if (chipsActive === state.active) return;
  const first = !chipsActive;
  chipsActive = state.active;
  const sel = bar.querySelector('[aria-selected="true"]');
  if (!sel) return;
  const cr = sel.getBoundingClientRect();
  const br = bar.getBoundingClientRect();
  if (cr.left < br.left || cr.right > br.right - 24) bar.scrollBy({ left: cr.left - br.left - 40, behavior: first ? 'auto' : 'smooth' });
}
function renderNews({ quiet } = {}) {
  renderTopicChips();
  newsFeed.load(visibleTopics().find((x) => x.id === state.active), { quiet });
}
function switchTopic(id) {
  if (id === state.active) return;
  state.active = id;
  save();
  history.replaceState(null, '', `#/news/${encodeURIComponent(id)}`);
  renderNews();
  window.scrollTo({ top: 0 });
}
function stepTopic(d) {
  const list = visibleTopics();
  const i = list.findIndex((x) => x.id === state.active);
  const n = list[(i + d + list.length) % list.length];
  if (n) switchTopic(n.id);
}

// ================================================================== GOLD
// BIS hallmark grades. 24/22/18K are published for each city; the others are
// derived from 24K by karat/24 – the same way retail rate cards compute them.
const KARATS = [
  { k: 24, p: 999, key: 'k24' },
  { k: 23, p: 958 },
  { k: 22, p: 916, key: 'k22' },
  { k: 20, p: 833 },
  { k: 18, p: 750, key: 'k18' },
  { k: 14, p: 585 },
  { k: 9, p: 375 },
];
const karatVal = (rates, row) =>
  rates ? (row.key && rates[row.key] ? rates[row.key] : rates.k24 ? Math.round((rates.k24 * row.k) / 24) : null) : null;
const KEY_IDX = { k24: 0, k22: 1, k18: 2 };

function chgEl(cur, prev) {
  if (!prev || !cur) return h('span', { class: 'chg flat', text: '' });
  const d = cur - prev;
  if (!d) return h('span', { class: 'chg flat', text: `• ${t('noChange')}` });
  return h('span', { class: `chg ${d > 0 ? 'up' : 'down'}`, title: t('vsYesterday'), text: `${d > 0 ? '▲' : '▼'} ${num(Math.abs(d))}` });
}

function setCity(id) {
  state.city = id;
  save();
  renderNav();
  if (view === 'home') renderHome();
  if (view === 'gold') renderGoldPage();
  if (view === 'settings') renderSettings();
}
function citySelect() {
  return h('select', { class: 'pill', 'aria-label': t('city'), onchange: (e) => setCity(e.target.value) },
    ...(gold?.cityMeta || []).filter((c) => gold.cities[c.id]).map((c) => h('option', { value: c.id, selected: c.id === goldCity()?.id, text: cityName(c.id) })));
}

function ratesRow(city, { pressable = true } = {}) {
  return h('div', { class: 'rates', role: 'group' },
    ...KARATS.filter((r) => r.key).map((r) =>
      h(pressable ? 'button' : 'div', {
        type: pressable ? 'button' : null, class: 'rate', 'aria-pressed': pressable ? String(state.karat === r.key) : null,
        onclick: pressable ? () => { state.karat = r.key; save(); renderGoldPage(); } : null,
      },
        h('div', { class: 'rate-k', text: t(r.key) }),
        h('div', { class: 'rate-v', text: inr(city[r.key]) }),
        h('div', { class: 'rate-sub', text: t('perGram') }),
        chgEl(city[r.key], city.prev?.[r.key]))));
}

function goldSummaryCard() {
  const city = goldCity();
  if (!gold || !city) return h('div', { class: 'card' }, h('div', { class: 'card-sub', style: 'padding:16px', text: gold || booted ? t('goldUnavailable') : t('loading') }));
  const sv = city.silver;
  return h('div', { class: 'card gold-card' },
    h('div', { class: 'gold-head' },
      h('h2', { class: 'gold-title' }, h('span', { class: 'coin', 'aria-hidden': 'true' }), h('span', { text: `${t('goldToday')} · ${cityShort(city.id)}` })),
      h('span', { class: 'gold-date', text: fmtDate(city.date, true) })),
    ratesRow(city, { pressable: false }),
    sv ? h('div', { class: 'mini-row' }, h('span', { class: 'coin silver', 'aria-hidden': 'true' }),
      h('span', { class: 'grow', text: `${t('silver')} · ${t('perGram')}` }), h('strong', { text: inr(sv.g) }), chgEl(sv.g, sv.prev)) : null,
    h('a', { class: 'mini-link', href: '#/gold' }, h('span', { text: t('seeAll') }), svg(ICON.right)));
}

function goldSeries(city, karatKey, range = state.range) {
  if (!goldHist?.days) return [];
  const idx = KEY_IDX[karatKey];
  const ratio = city?.k24 ? city[karatKey] / city.k24 : [1, 0.916, 0.75][idx];
  const days = Object.keys(goldHist.days).sort();
  const rows = days.map((d) => ({ d, spot: goldHist.days[d].inrG, real: city && goldHist.days[d].c?.[city.id]?.[idx] }));
  // Days without a published city rate: spot × the premium seen on the nearest day that has one.
  const anchors = rows.map((r, i) => (r.real && r.spot ? i : -1)).filter((i) => i >= 0);
  const premAt = (i) => {
    if (!anchors.length) return gold?.premium ? gold.premium * ratio : null;
    const j = anchors.reduce((a, b) => (Math.abs(b - i) < Math.abs(a - i) ? b : a));
    return rows[j].real / rows[j].spot;
  };
  const from = new Date(Date.now() - range * 864e5).toISOString().slice(0, 10);
  const pts = [];
  rows.forEach((r, i) => {
    if (r.d < from) return;
    if (r.real) pts.push({ d: r.d, v: r.real });
    else if (r.spot && premAt(i)) pts.push({ d: r.d, v: Math.round(r.spot * premAt(i)), est: true });
  });
  return pts;
}

// Desktop Home: 30-day 22K sparkline next to today's rates.
function homeTrendCard() {
  const city = goldCity();
  if (!isWide() || !city) return null;
  const pts = goldSeries(city, 'k22', 30);
  if (pts.length < 2) return null;
  const first = pts[0].v;
  const last = pts.at(-1).v;
  const pct = ((last - first) / first) * 100;
  const box = h('div', { class: 'chart chart-sm' });
  requestAnimationFrame(() => renderChart(box, pts, { fmtV: (v) => inr(v), fmtVShort: (v) => `₹${shortInr(v)}`, fmtD: fmtDate, estLabel: t('estimated') }));
  return h('a', { class: 'card trend-card', href: '#/gold' },
    h('div', { class: 'card-head' },
      h('h3', { class: 'card-title', text: `${t('trend')} · 22K` }),
      h('span', { class: `chg ${pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat'}`, text: `${pct > 0 ? '▲' : pct < 0 ? '▼' : '•'} ${num(Math.abs(pct), 1)}% · ${t('days30')}` })),
    h('div', { class: 'chart-wrap' }, box));
}

function renderGoldPage() {
  const root = $('#view-gold');
  const city = goldCity();
  if (!gold || !city) { root.replaceChildren(h('div', { class: 'empty', text: gold || booted ? t('goldUnavailable') : t('loading') })); return; }
  const spot = liveSpot || gold.spot;
  const pickK = (k) => () => { state.karat = k; save(); renderGoldPage(); };

  // hero: city + the three published karats
  const hero = h('div', { class: 'card gold-card' },
    h('div', { class: 'gold-head' },
      h('h2', { class: 'gold-title' }, h('span', { class: 'coin', 'aria-hidden': 'true' }), h('span', { text: t('goldRate') })),
      citySelect()),
    ratesRow(city));

  // all karats
  const allK = h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', { class: 'card-title', text: `${t('allKarats')} · ${cityShort(city.id)}` }),
      h('span', { class: 'gold-date', text: fmtDate(city.date) })),
    h('table', { class: 'kt' },
      h('thead', {}, h('tr', {}, h('th', { text: t('karat') }), h('th', { text: t('perGram') }), h('th', { text: t('per10g') }),
        h('th', { class: 'hide-xs', text: t('vsYesterday') }))),
      h('tbody', {}, ...KARATS.map((r) => {
        const v = karatVal(city, r);
        const pv = karatVal(city.prev, r);
        return h('tr', { class: [r.key ? 'pick' : '', r.key === state.karat ? 'sel' : ''].join(' ').trim() || null, onclick: r.key ? pickK(r.key) : null },
          h('td', { class: 'k' }, `${r.k}K`, r.key ? null : h('span', { class: 'tag-calc', text: t('calcNote') }), h('small', { text: `${t('purity')} ${r.p}` })),
          h('td', { class: 'v', text: v ? inr(v) : '—' }),
          h('td', { text: v ? inr(v * 10) : '—' }),
          h('td', { class: 'hide-xs' }, chgEl(v, pv)));
      }))),
    h('div', { class: 'foot-note' }, h('div', { text: t('goldNote') }), h('div', { text: t('calcNoteLong') })));

  // trend chart / table
  const pts = goldSeries(city, state.karat);
  const chartBox = h('div', { class: 'chart' });
  const segBtn = (label, pressed, onclick) => h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(pressed), text: label, onclick });
  const trend = h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', { class: 'card-title', text: `${t('trend')} · ${cityShort(city.id)}` })),
    h('div', { class: 'chart-wrap' },
      h('div', { class: 'chart-bar' },
        h('div', { class: 'seg small', role: 'group' }, ...['k24', 'k22', 'k18'].map((k) => segBtn(`${k.slice(1)}K`, state.karat === k, pickK(k)))),
        h('div', { class: 'seg small', role: 'group' },
          ...[[30, 'days30'], [90, 'days90'], [365, 'days365']].map(([r, k]) => segBtn(t(k), state.range === r, () => { state.range = r; save(); renderGoldPage(); })),
          segBtn(t('table'), state.goldView === 'table', () => { state.goldView = state.goldView === 'table' ? 'chart' : 'table'; save(); renderGoldPage(); }))),
      pts.length > 1 ? h('div', { class: 'chart-hl' },
        h('span', {}, `${t('high')} `, h('b', { text: inr(Math.max(...pts.map((p) => p.v))) })),
        h('span', {}, `${t('low')} `, h('b', { text: inr(Math.min(...pts.map((p) => p.v))) })),
        pts.some((p) => p.est) ? h('span', { text: `┄ ${t('estimated')}` }) : null) : null,
      pts.length > 1
        ? state.goldView === 'table'
          ? h('div', { class: 'hist-table' }, h('table', {},
              h('thead', {}, h('tr', {}, h('th', { text: t('date') }), h('th', { text: `${t(state.karat)} / g` }))),
              h('tbody', {}, ...[...pts].reverse().map((p) => h('tr', {}, h('td', { text: fmtDate(p.d) }),
                h('td', {}, inr(p.v), p.est ? h('span', { class: 'tag-est', text: t('estimated') }) : null))))))
          : chartBox
        : null));

  // jewellery bill calculator
  const calcOut = h('div', { class: 'calc-out' });
  const c = state.calc;
  const updCalc = () => {
    const row = KARATS.find((r) => `k${r.k}` === c.k) || KARATS[2];
    const rate = karatVal(city, row) || 0;
    const gv = rate * (Number(c.w) || 0);
    const mk = (gv * (Number(c.m) || 0)) / 100;
    const gst = (gv + mk) * 0.03;
    calcOut.replaceChildren(
      h('div', {}, h('span', { text: `${t('goldValue')} (${inr(rate)}/g)` }), h('span', { text: inr(gv) })),
      h('div', {}, h('span', { text: t('makingAmt') }), h('span', { text: inr(mk) })),
      h('div', {}, h('span', { text: t('gst') }), h('span', { text: inr(gst) })),
      h('div', { class: 'total' }, h('span', { text: t('total') }), h('span', { text: inr(gv + mk + gst) })));
    save();
  };
  const calcCard = h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', { class: 'card-title', text: t('calculator') })),
    h('div', { class: 'calc' },
      h('div', { class: 'calc-in' },
        h('label', {}, t('weight'), h('input', { type: 'number', inputmode: 'decimal', min: '0', step: '0.01', value: String(c.w), oninput: (e) => { c.w = e.target.value; updCalc(); } })),
        h('label', {}, t('karat'), h('select', { onchange: (e) => { c.k = e.target.value; updCalc(); } },
          ...KARATS.map((r) => h('option', { value: `k${r.k}`, selected: c.k === `k${r.k}`, text: `${r.k}K` })))),
        h('label', {}, t('making'), h('input', { type: 'number', inputmode: 'decimal', min: '0', max: '60', step: '0.5', value: String(c.m), oninput: (e) => { c.m = e.target.value; updCalc(); } }))),
      calcOut,
      h('small', { text: t('calcDisclaimer') })));
  updCalc();

  // silver
  const sv = city.silver;
  const silverCard = h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', { class: 'card-title' }, h('span', { class: 'coin silver', 'aria-hidden': 'true' }), h('span', { text: `${t('silverRate')} · ${cityShort(city.id)}` }))),
    h('div', { class: 'facts' },
      sv ? h('div', { class: 'fact' }, h('div', { class: 'fact-k', text: t('perGram') }), h('div', { class: 'fact-v' }, inr(sv.g), ' ', chgEl(sv.g, sv.prev))) : null,
      sv ? h('div', { class: 'fact' }, h('div', { class: 'fact-k', text: t('perKg') }), h('div', { class: 'fact-v', text: inr(sv.g * 1000) })) : null,
      gold.ibja?.silverKg ? h('div', { class: 'fact' }, h('div', { class: 'fact-k', text: `IBJA 999 · ${t('perKg')}` }), h('div', { class: 'fact-v', text: inr(gold.ibja.silverKg) })) : null,
      spot.agInrG ? h('div', { class: 'fact' }, h('div', { class: 'fact-k', text: `${t('spot')} · ${t('perKg')}` }), h('div', { class: 'fact-v', text: inr(spot.agInrG * 1000) })) : null));

  // IBJA benchmark — every purity it publishes
  const ib = gold.ibja;
  const ses = ib?.sessions && (ib.sessions.pm || ib.sessions.am)
    ? (ib.sessions.pm && (!ib.sessions.am || ib.sessions.pm.date >= ib.sessions.am.date) ? ['pm', ib.sessions.pm] : ['am', ib.sessions.am])
    : null;
  const ibCard = ib ? h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', { class: 'card-title', text: t('ibja') }),
      ses ? h('span', { class: 'gold-date', text: `${fmtDate(ses[1].date, true)} · ${t(ses[0])}` }) : null),
    h('table', { class: 'kt' },
      h('thead', {}, h('tr', {}, h('th', { text: t('purity') }), h('th', { text: t('perGram') }), h('th', { text: t('per10g') }))),
      h('tbody', {},
        ...[['999', '24K'], ['995', '24K'], ['916', '22K'], ['750', '18K'], ['585', '14K']].map(([p, k]) =>
          ib.rates[p] ? h('tr', {}, h('td', { class: 'k' }, p, h('small', { text: k })), h('td', { class: 'v', text: inr(ib.rates[p]) }), h('td', { text: inr(ib.rates[p] * 10) })) : null),
        ib.platinumG ? h('tr', {}, h('td', { class: 'k' }, t('platinum'), h('small', { text: '999' })), h('td', { class: 'v', text: inr(ib.platinumG) }), h('td', { text: inr(ib.platinumG * 10) })) : null)),
    h('div', { class: 'foot-note', text: t('ibjaNote') })) : null;

  // spot + live estimate
  const factor = city.k24 ? city[state.karat] / city.k24 : 1;
  const est = gold.premium && spot?.inrG24 ? spot.inrG24 * gold.premium * factor : null;
  const spotCard = h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', { class: 'card-title', text: t('spot') }), h('span', { class: 'gold-date', text: rel(liveSpot?.at || gold.spot.at || gold.updated) })),
    h('div', { class: 'facts' },
      est ? h('div', { class: 'fact wide', title: t('liveEstimateHint') },
        h('div', { class: 'fact-k', text: `${t('liveEstimate')} · ${t(state.karat)} · ${cityShort(city.id)}` }),
        h('div', { class: 'fact-v' }, inr(est), ' ', h('small', { text: `${t('perGram')} · ${t('estimated')}` }))) : null,
      h('div', { class: 'fact' }, h('div', { class: 'fact-k', text: 'XAU' }), h('div', { class: 'fact-v' }, usd(spot.usdOz), h('small', { text: ' /oz' }))),
      h('div', { class: 'fact' }, h('div', { class: 'fact-k', text: '24K' }), h('div', { class: 'fact-v' }, inr(spot.inrG24), h('small', { text: ' /g' }))),
      spot.agUsdOz ? h('div', { class: 'fact' }, h('div', { class: 'fact-k', text: 'XAG' }), h('div', { class: 'fact-v' }, usd(spot.agUsdOz), h('small', { text: ' /oz' }))) : null,
      spot.usdInr ? h('div', { class: 'fact' }, h('div', { class: 'fact-k', text: t('usdInr') }), h('div', { class: 'fact-v', text: `₹${num(spot.usdInr, 2)}` })) : null));

  // other cities
  const others = h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', { class: 'card-title', text: t('otherCities') }), h('span', { class: 'gold-date', text: '22K · 24K' })),
    h('ul', { class: 'city-list' }, ...(gold.cityMeta || []).filter((m) => gold.cities[m.id]).map((m) => {
      const r = gold.cities[m.id];
      return h('li', {}, h('button', { type: 'button', class: m.id === city.id ? 'cur' : null, onclick: () => { setCity(m.id); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
        h('span', { class: 'cn', text: cityName(m.id) }), h('span', { class: 'cv' }, h('b', { text: inr(r.k22) })), h('span', { class: 'cv', text: inr(r.k24) })));
    })));

  const sources = h('div', { class: 'card foot-note' },
    `${t('sources')}: `,
    ...[[city.src || 'groww.in', `https://${city.src === 'goodreturns.in' ? 'www.goodreturns.in/gold-rates/' : 'groww.in/gold-rates'}`], ['ibjarates.com', 'https://ibjarates.com'], ['gold-api.com', 'https://gold-api.com'], ['exchange-api', 'https://github.com/fawazahmed0/exchange-api']]
      .flatMap(([n, u], i) => [i ? ', ' : '', h('a', { href: u, target: '_blank', rel: 'noopener', text: n })]),
    ` · ${t('updated')} ${rel(gold.updated)}`);

  root.replaceChildren(h('div', { class: 'gold-page' },
    h('div', { class: 'gold-col' }, hero, allK, trend, calcCard),
    h('div', { class: 'gold-col' }, silverCard, ibCard, spotCard, others, sources)));

  if (pts.length > 1 && state.goldView !== 'table') {
    requestAnimationFrame(() => renderChart(chartBox, pts, {
      fmtV: (v) => inr(v), fmtVShort: (v) => `₹${shortInr(v)}`, fmtD: fmtDate, estLabel: t('estimated'),
    }));
  }
}

const OZ = 31.1034768;
let spotAt = 0;
async function pollSpot() {
  if (document.hidden || !gold || view !== 'gold' || Date.now() - spotAt < 55e3) return;
  spotAt = Date.now();
  try {
    const base = 'https://api.gold-api.com/price';
    const [usdR, inrR, agR, agUsd] = await Promise.all(['XAU', 'XAU/INR', 'XAG/INR', 'XAG'].map((p) => fetch(`${base}/${p}`).then((r) => r.json())));
    if (!(usdR.price > 0 && inrR.price > 0)) return;
    liveSpot = {
      usdOz: usdR.price, inrG24: inrR.price / OZ, usdInr: inrR.exchangeRate, agInrG: agR.price / OZ, agUsdOz: agUsd.price,
      at: Date.parse(usdR.updatedAt) || Date.now(),
    };
    if (view === 'gold') {
      const y = window.scrollY;
      renderGoldPage();
      window.scrollTo(0, y);
    }
  } catch {}
}

// ================================================================== install (Android + iOS)
// Browsers never install a site by themselves: on Android Chromium we can open the
// native install dialog from a tap; everywhere else we show the exact steps.
// Phones get a full-screen "Install" sheet — first visit after picking a city, again
// around the 3rd visit, then at most every 14 days — plus a small banner on Home and a
// permanent entry in Settings. Nothing is shown inside the installed app.
let deferredPrompt = null;
let waitingForPrompt = false;
let sheetShownThisLoad = false;
let redrawInstallSheet = null;
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const ua = navigator.userAgent;
const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /android/i.test(ua);
const isMobile = isIOS || isAndroid;
// Social apps' built-in browsers can't install web apps.
const isInApp = /FBAN|FBAV|FB_IAB|Instagram|Line\/|LinkedInApp|Snapchat|Telegram|; wv\)/i.test(ua);

function installEnv() {
  if (isStandalone()) return 'installed';
  if (isInApp && isMobile) return 'inapp';
  if (deferredPrompt) return 'prompt'; // Chrome / Edge / Samsung Internet (Android or desktop)
  if (isIOS) return 'ios'; // Safari, and Chrome/Edge/Firefox on iOS 16.4+
  // Installed from this browser earlier: Chromium stops offering installation, so there is
  // nothing to ask (the flag clears itself if the browser offers installation again).
  if (state.installedAt) return 'elsewhere';
  if (isAndroid) return /firefox/i.test(ua) ? 'menu-firefox' : 'menu';
  return 'desktop';
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // keep it for our own button instead of the browser's mini-infobar
  deferredPrompt = e;
  if (state.installedAt) { state.installedAt = 0; save(); } // offered again → it was uninstalled
  redrawInstallSheet?.();
  renderInstallBanner();
  if (view === 'settings') renderSettings();
  if (waitingForPrompt) { waitingForPrompt = false; maybeAutoInstallSheet(); }
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  state.installedAt = Date.now();
  save();
  $('#dlg-install').open && $('#dlg-install').close();
  renderInstallBanner();
  if (view === 'settings') renderSettings();
  toast(t('installed'));
});

async function promptInstall() {
  if (!deferredPrompt) return;
  const p = deferredPrompt;
  deferredPrompt = null; // a prompt can be used only once
  p.prompt();
  const choice = await p.userChoice.catch(() => ({}));
  if (choice.outcome === 'accepted') $('#dlg-install').open && $('#dlg-install').close();
  else redrawInstallSheet?.();
  renderInstallBanner();
  if (view === 'settings') renderSettings();
}

async function copyLink() {
  const url = location.origin + location.pathname;
  try { await navigator.clipboard.writeText(url); toast(t('linkCopied')); } catch { window.prompt(t('copyLink'), url); }
}

function installDue() {
  const s = state.install;
  if (!s.shown) return true; // first visit after choosing a city
  if (s.shown === 1) return s.visits >= 3; // a gentle second ask
  return Date.now() - s.last >= 14 * 864e5; // then at most every two weeks
}
function maybeAutoInstallSheet() {
  if (!isMobile || !state.city || isStandalone() || sheetShownThisLoad || !installDue()) return;
  const env = installEnv();
  if (env === 'elsewhere') return;
  // Android Chrome/Edge/Samsung: only when the browser offers installation — it doesn't
  // once the app is installed, so people who already have it aren't asked again.
  if (env === 'menu') { waitingForPrompt = true; return; }
  setTimeout(() => {
    if (document.querySelector('dialog[open]') || isStandalone() || sheetShownThisLoad) return;
    openInstallSheet({ auto: true });
  }, 1200);
}

function openInstallSheet({ auto = false } = {}) {
  const dlg = $('#dlg-install');
  if (dlg.open) return;
  const step = (n, title, hint, icon) => h('li', { class: 'is-step' },
    h('span', { class: 'is-num', 'aria-hidden': 'true', text: String(n) }),
    h('div', {}, h('strong', {}, title, icon ? h('span', { class: 'is-ico', 'aria-hidden': 'true' }, icon) : null), hint ? h('small', { text: hint }) : null));
  const draw = () => {
    const env = installEnv();
    if (env === 'installed') { dlg.close(); return; }
    let action;
    if (env === 'prompt') {
      action = h('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: promptInstall }, svg(ICON.plusSq), t('installNow'));
    } else if (env === 'ios') {
      action = h('ol', { class: 'is-steps' },
        step(1, t('iosStep1'), t('iosStep1Hint'), svg(ICON.share)),
        step(2, t('iosStep2'), t('iosStep2Hint'), svg(ICON.plusSq)),
        step(3, t('iosStep3')));
    } else if (env === 'menu' || env === 'menu-firefox' || env === 'elsewhere') {
      action = h('ol', { class: 'is-steps' },
        step(1, t('menuStep1'), null, h('b', { text: '⋮' })),
        step(2, t(env === 'menu-firefox' ? 'menuStep2Firefox' : 'menuStep2'), null, svg(ICON.plusSq)));
    } else if (env === 'inapp') {
      action = [
        h('p', { class: 'is-note', text: t('inappText') }),
        h('ol', { class: 'is-steps' }, step(1, t('inappStep1'), t('inappStep1Hint')), step(2, t('inappStep2'))),
        h('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: copyLink }, t('copyLink')),
      ];
    } else {
      action = h('p', { class: 'is-note', text: t('desktopHint') });
    }
    dlg.replaceChildren(h('div', { class: 'sheet-body install-sheet', tabindex: '-1', autofocus: true },
      h('img', { class: 'is-icon', src: 'assets/icons/icon-192.png', alt: '', width: 72, height: 72 }),
      h('h2', { id: 'dlg-install-title', text: t('installTitle') }),
      h('ul', { class: 'is-why' }, ...['installWhy1', 'installWhy2', 'installWhy3'].map((k) => h('li', { text: t(k) }))),
      action,
      h('button', { type: 'button', class: 'btn btn-ghost btn-block', text: t('continueBrowser'), onclick: () => dlg.close() })));
  };
  redrawInstallSheet = draw;
  draw();
  if (auto) { state.install = { ...state.install, shown: state.install.shown + 1, last: Date.now() }; save(); }
  sheetShownThisLoad = true;
  renderInstallBanner();
  dlg.addEventListener('close', () => { redrawInstallSheet = null; }, { once: true });
  dlg.showModal();
}

function installBlock() {
  const env = installEnv();
  if (env === 'installed') return h('p', { class: 'muted', style: 'margin:0', text: t('installed') });
  if (env === 'prompt') return h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: promptInstall }, svg(ICON.plusSq), t('install')));
  if (env === 'desktop') return h('div', { class: 'ios-steps' }, svg(ICON.plusSq), h('span', { text: t('desktopHint') }));
  if (env === 'elsewhere') return h('div', { class: 'row' }, h('span', { class: 'muted', text: t('installedOpen') }),
    h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => openInstallSheet() }, t('howToInstall')));
  return h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: () => openInstallSheet() }, svg(ICON.plusSq), t('howToInstall')));
}

function renderInstallBanner() {
  const el = $('#install-banner');
  const env = installEnv();
  const snoozed = Date.now() - (state.installDismissed || 0) < 14 * 864e5;
  // A real Install button wherever the browser offers it; "How?" steps only where installing is
  // a manual job (iPhone, Firefox, in-app browsers). Chrome on Android without an offer has
  // usually installed it already, so it gets nothing.
  const show = !snoozed && !sheetShownThisLoad && ['prompt', 'ios', 'inapp', 'menu-firefox'].includes(env);
  el.hidden = !show;
  if (!show) return;
  const msg = env === 'prompt' ? t('installHint') : env === 'inapp' ? t('inappShort') : env === 'ios' ? t('iosInstall') : t('menuShort');
  el.replaceChildren(
    h('img', { src: 'assets/icons/icon-192.png', alt: '', width: 40, height: 40 }),
    h('div', { class: 'ib-text' }, h('strong', { text: t('install') }), msg),
    h('div', { class: 'ib-actions' },
      env === 'prompt'
        ? h('button', { type: 'button', class: 'btn btn-primary', text: t('install'), onclick: promptInstall })
        : h('button', { type: 'button', class: 'btn btn-primary', text: t('howShort'), onclick: () => openInstallSheet() }),
      h('button', { type: 'button', class: 'btn btn-ghost', text: t('notNow'), onclick: () => { state.installDismissed = Date.now(); save(); renderInstallBanner(); } })));
}

// ================================================================== SETTINGS
function renderSettings() {
  const root = $('#view-settings');
  const card = (title, ...body) => h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', { class: 'card-title', text: title })), h('div', { class: 'set-body' }, ...body));
  const segRow = (value, opts, onpick) => h('div', { class: 'seg wide', role: 'group' },
    ...opts.map(([v, l]) => h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(v === value), text: l, onclick: () => onpick(v) })));
  const field = (label, ctrl, hint) => h('label', { class: 'field' }, h('span', { text: label }), ctrl, hint ? h('small', { text: hint }) : null);
  const fileIn = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: importSettings });

  root.replaceChildren(h('div', { class: 'settings' },
    card(t('install'), installBlock(), installEnv() !== 'installed' ? h('small', { text: t('installHint') }) : null),
    card(t('myCity'),
      field(t('city'), h('select', { onchange: (e) => setCity(e.target.value) },
        ...(gold?.cityMeta || [{ id: state.city }]).map((c) => h('option', { value: c.id, selected: c.id === state.city, text: cityName(c.id) }))), t('myCityHint'))),
    card(t('language'),
      h('div', { class: 'field' }, h('span', { text: t('uiLanguage') }), segRow(state.uiLang, [['en', 'English'], ['te', 'తెలుగు']], (v) => setLang(v))),
      h('div', { class: 'field' }, h('span', { text: t('newsLanguage') }),
        segRow(state.newsLang, [['auto', t('sameAsUi')], ['en', 'EN'], ['te', 'తె'], ['both', t('both')]], (v) => { state.newsLang = v; save(); renderSettings(); }))),
    card(t('theme'), segRow(state.theme, [['auto', t('themeAuto')], ['light', t('themeLight')], ['dark', t('themeDark')]], (v) => { state.theme = v; save(); applyTheme(); renderSettings(); })),
    card(t('navNews'),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', text: t('editTopics'), onclick: openTopics })),
      h('div', { class: 'field' }, h('span', { text: t('muted') }),
        state.muted.length
          ? h('div', { class: 'mute-list' }, ...state.muted.map((m) => h('span', { class: 'chip' }, h('span', { text: m }),
              h('button', { type: 'button', text: t('unmute'), onclick: () => { state.muted = state.muted.filter((x) => x !== m); save(); feeds.forEach((f) => f.render()); renderSettings(); } }))))
          : h('small', { text: t('noneMuted') })),
      field(t('proxy'), h('input', { type: 'url', value: state.proxy, placeholder: 'https://my-proxy.workers.dev/', autocomplete: 'off', inputmode: 'url',
        onchange: (e) => { state.proxy = e.target.value.trim(); save(); toast(t('saved')); } }), t('proxyHint'))),
    card(t('backup'),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn', text: t('exportSettings'), onclick: exportSettings }),
        h('button', { type: 'button', class: 'btn', text: t('importSettings'), onclick: () => fileIn.click() }), fileIn,
        h('button', { type: 'button', class: 'btn btn-danger', text: t('reset'),
          onclick: () => { if (confirm(t('resetConfirm'))) { localStorage.removeItem(KEY); location.replace('./'); } } }))),
    h('div', { class: 'card about' }, h('div', { class: 'card-head' }, h('h3', { class: 'card-title', text: t('about') })),
      h('div', { class: 'set-body' }, h('p', { text: t('aboutText') }),
        repoUrl() ? h('small', {}, h('a', { href: repoUrl(), target: '_blank', rel: 'noopener', text: repoUrl().replace('https://', '') })) : null))));
}

// On GitHub Pages (<user>.github.io/<repo>/) link back to the source repository.
function repoUrl() {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/);
  if (!m) return null;
  const repo = location.pathname.split('/').filter(Boolean)[0];
  return `https://github.com/${m[1]}/${repo || `${m[1]}.github.io`}`;
}

// First launch: pick language + city (both changeable later in Settings).
function openWelcome() {
  const dlg = $('#dlg-welcome');
  const cities = (gold?.cityMeta || []).filter((c) => gold.cities?.[c.id] || index.topics.some((x) => x.city === c.id));
  let pick = cities[0]?.id || '';
  const draw = () => {
    dlg.replaceChildren(h('div', { class: 'sheet-body welcome', tabindex: '-1', autofocus: true },
      h('img', { src: 'assets/icons/icon-192.png', alt: '', width: 56, height: 56 }),
      h('h2', { id: 'dlg-welcome-title', text: t('welcome') }),
      h('p', { class: 'muted', text: t('welcomeText') }),
      h('div', { class: 'seg wide', role: 'group', 'aria-label': t('language') },
        ...[['en', 'English'], ['te', 'తెలుగు']].map(([v, l]) => h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(state.uiLang === v), text: l,
          onclick: () => { state.uiLang = v; applyI18n(); draw(); } }))),
      h('h3', { text: t('chooseCity') }),
      h('div', { class: 'city-grid', role: 'radiogroup' }, ...cities.map((c) =>
        h('button', { type: 'button', class: 'chip', role: 'radio', 'aria-checked': String(c.id === pick), 'aria-selected': String(c.id === pick),
          text: c.name?.[state.uiLang] || c.name?.en, onclick: () => { pick = c.id; draw(); } }))),
      h('button', { type: 'button', class: 'btn btn-primary btn-block', text: t('start'), disabled: !pick,
        onclick: () => { state.city = pick; save(); dlg.close(); route(); maybeAutoInstallSheet(); } })));
  };
  draw();
  dlg.addEventListener('cancel', (e) => e.preventDefault()); // a city is required
  dlg.showModal();
}

function exportSettings() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `taaza-settings-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
async function importSettings(e) {
  try {
    const obj = JSON.parse(await e.target.files[0].text());
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw 0;
    const clean = {};
    for (const k of Object.keys(DEFAULTS)) if (k in obj && typeof obj[k] === typeof DEFAULTS[k]) clean[k] = obj[k];
    if (clean.custom) clean.custom = clean.custom.filter((c) => c && typeof c.name === 'string' && typeof c.q === 'string' && typeof c.id === 'string');
    state = { ...DEFAULTS, ...clean, schema: SCHEMA };
    save();
    toast(t('importDone'));
    setTimeout(() => location.reload(), 600);
  } catch {
    toast(t('importFail'));
  }
}

// ================================================================== topics editor (bottom sheet)
function openTopics() {
  const dlg = $('#dlg-topics');
  const draw = () => {
    const list = allTopics();
    const move = (i, d) => {
      const ids = list.map((x) => x.id);
      [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
      state.order = ids;
      save(); renderTopicChips(); draw();
    };
    const nameIn = h('input', { required: true, maxLength: 40, autocomplete: 'off' });
    const qIn = h('input', { required: true, maxLength: 200, autocomplete: 'off' });
    const form = h('form', {
      onsubmit: (e) => {
        e.preventDefault();
        const name = nameIn.value.trim();
        const q = qIn.value.trim();
        if (!name || !q) return;
        state.custom.push({ id: `c-${Date.now().toString(36)}`, name, q });
        state.order = allTopics().map((x) => x.id);
        save(); renderTopicChips(); draw();
        toast(`${t('addTopic')}: ${name}`);
      },
    },
      h('label', { class: 'field' }, h('span', { text: t('topicName') }), nameIn),
      h('label', { class: 'field', style: 'margin-top:10px' }, h('span', { text: t('keywords') }), qIn, h('small', { text: t('keywordsHint') })),
      h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { type: 'submit', class: 'btn btn-primary', text: t('addTopic') }), h('small', { class: 'muted', text: t('customHint') })));
    dlg.replaceChildren(
      h('div', { class: 'sheet-head' },
        h('h2', { id: 'dlg-topics-title', text: t('editTopics') }),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('close'), onclick: () => dlg.close() }, svg(ICON.x))),
      h('div', { class: 'sheet-body' },
        h('section', {}, h('ul', { class: 'topic-list' }, ...list.map((x, i) =>
          h('li', { class: 'topic-row' },
            h('label', {},
              h('input', { type: 'checkbox', checked: !state.hidden.includes(x.id),
                onchange: (e) => {
                  state.hidden = e.target.checked ? state.hidden.filter((id) => id !== x.id) : [...state.hidden, x.id];
                  save(); renderTopicChips();
                } }),
              h('span', { class: 'name', text: `${x.icon || '•'}  ${topicName(x)}` }),
              x.custom ? h('span', { class: 'badge', text: t('custom') }) : null),
            h('button', { type: 'button', class: 'mini', 'aria-label': t('up'), disabled: i === 0, onclick: () => move(i, -1) }, svg(ICON.up)),
            h('button', { type: 'button', class: 'mini', 'aria-label': t('down'), disabled: i === list.length - 1, onclick: () => move(i, 1) }, svg(ICON.down)),
            x.custom
              ? h('button', { type: 'button', class: 'mini', 'aria-label': t('delete'),
                  onclick: () => { state.custom = state.custom.filter((c) => c.id !== x.id); save(); renderTopicChips(); draw(); } }, svg(ICON.x))
              : h('span', { class: 'mini', style: 'visibility:hidden' }))))),
        h('section', {}, h('h3', { text: t('addTopic') }), form)));
  };
  draw();
  dlg.showModal();
  dlg.addEventListener('close', () => { if (view === 'news') renderNews({ quiet: true }); }, { once: true });
}

// ================================================================== language / theme
function applyI18n() {
  document.documentElement.lang = state.uiLang;
  t = makeT(state.uiLang);
  document.querySelectorAll('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
  document.querySelectorAll('.seg-btn[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === state.uiLang)));
  document.querySelectorAll('input[type=search]').forEach((i) => (i.placeholder = t('searchTopic')));
  document.querySelectorAll('.btn-live').forEach((b) => (b.title = t('liveHint')));
  $('#btn-refresh').title = t('refresh');
  $('#btn-edit-topics').title = t('editTopics');
  document.title = 'Taaza · తాజా';
}
function setLang(lang) {
  if (lang === state.uiLang) return;
  state.uiLang = lang;
  save();
  applyI18n();
  route();
}
function applyTheme() {
  if (state.theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = state.theme;
  const dark = state.theme === 'dark' || (state.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.content = dark ? '#121211' : '#f7f5f0'; m.removeAttribute('media'); });
}

// ================================================================== refresh, gestures, boot
let lastLoad = 0;
async function refreshAll({ quiet = false } = {}) {
  const btn = $('#btn-refresh');
  btn.classList.add('spinning');
  lastLoad = Date.now();
  const [idx, g, gh] = await Promise.allSettled([getJSON(`${DATA}/topics.json`), getJSON(`${DATA}/gold.json`), getJSON(`${DATA}/gold-history.json`)]);
  if (idx.status === 'fulfilled') index = idx.value;
  if (g.status === 'fulfilled') gold = g.value;
  if (gh.status === 'fulfilled') goldHist = gh.value;
  renderNav();
  const y = window.scrollY;
  renderView(view, { quiet });
  if (quiet) window.scrollTo(0, y);
  btn.classList.remove('spinning');
}

function setupPullToRefresh() {
  // Installed apps (esp. on iOS) have no browser pull-to-refresh, so provide one.
  if (!('ontouchstart' in window)) return;
  const ptr = $('#ptr');
  const label = ptr.querySelector('.ptr-text');
  let y0 = null;
  let dy = 0;
  window.addEventListener('touchstart', (e) => {
    if (window.scrollY > 0 || document.querySelector('dialog[open]') || e.touches.length > 1) { y0 = null; return; }
    y0 = e.touches[0].clientY; dy = 0;
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    dy = e.touches[0].clientY - y0;
    if (dy <= 0 || window.scrollY > 0) { ptr.style.opacity = 0; return; }
    const p = Math.min(dy / 90, 1);
    ptr.style.opacity = p;
    ptr.style.transform = `translate(-50%, ${-60 + p * 64}px)`;
    ptr.classList.toggle('ready', p >= 1);
    label.textContent = p >= 1 ? t('pullRefresh') : '';
  }, { passive: true });
  window.addEventListener('touchend', async () => {
    if (y0 == null) return;
    const fire = dy >= 90;
    y0 = null;
    if (fire) {
      ptr.classList.add('busy');
      label.textContent = t('loading');
      sessionStorage.clear();
      await refreshAll();
      ptr.classList.remove('busy');
    }
    ptr.classList.remove('ready');
    ptr.style.opacity = 0;
    ptr.style.transform = '';
  });
}

function setupSwipe() {
  // Swipe left/right on the stories to move between topics (News view).
  const el = $('#news-feed');
  let x0 = null;
  let y0 = 0;
  el.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 45) stepTopic(dx < 0 ? 1 : -1);
  }, { passive: true });
}

function wire() {
  document.querySelectorAll('.seg-btn[data-lang]').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));
  $('#btn-refresh').addEventListener('click', () => { sessionStorage.clear(); refreshAll(); });
  $('#btn-edit-topics').addEventListener('click', openTopics);
  document.querySelectorAll('dialog:not(#dlg-welcome)').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select, [contenteditable], dialog[open]') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (view === 'news' && e.key === 'ArrowRight') stepTopic(1);
    else if (view === 'news' && e.key === 'ArrowLeft') stepTopic(-1);
    else if (e.key === 'r' || e.key === 'R') refreshAll();
    else if (e.key === '/' && view === 'news') { e.preventDefault(); $('#news-feed input[type=search]').focus(); }
  });
  const tick = () => {
    if (document.hidden) return;
    if (Date.now() - lastLoad > 5 * 60e3) refreshAll({ quiet: true });
    updateTopbarTime();
  };
  setInterval(tick, 30e3);
  // Coming back to the app: with Live on, fetch the newest stories (throttled to every 2 min).
  const resumeLive = () => {
    if (!state.live || document.hidden) return;
    if (view === 'home') homeFeed.load(homeTopic(), { quiet: true });
    else if (view === 'news') newsFeed.load(visibleTopics().find((x) => x.id === state.active), { quiet: true });
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); pollSpot(); resumeLive(); } });
  window.addEventListener('pageshow', (e) => { if (e.persisted) resumeLive(); });
  window.addEventListener('online', resumeLive);
  setInterval(pollSpot, 60e3);
  let rt;
  let lastW = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth === lastW) return; // ignore mobile URL-bar height changes
    lastW = window.innerWidth;
    clearTimeout(rt);
    rt = setTimeout(route, 200);
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
  setupPullToRefresh();
  setupSwipe();
}

(async function main() {
  try {
    if (isStandalone() && !state.installedAt) { state.installedAt = Date.now(); save(); }
    if (!isStandalone() && !sessionStorage.getItem('pnd.visit')) {
      sessionStorage.setItem('pnd.visit', '1');
      state.install = { ...state.install, visits: (state.install?.visits || 0) + 1 };
      save();
    }
  } catch {}
  applyTheme();
  applyI18n();
  homeFeed = createFeed($('#home-feed'));
  newsFeed = createFeed($('#news-feed'));
  feeds = [homeFeed, newsFeed];
  wire();
  view = parseHash().v;
  document.querySelectorAll('.view').forEach((s) => (s.hidden = s.dataset.view !== view));
  renderNav();
  const [idx, g, gh] = await Promise.allSettled([getJSON(`${DATA}/topics.json`), getJSON(`${DATA}/gold.json`), getJSON(`${DATA}/gold-history.json`)]);
  if (idx.status === 'fulfilled') index = idx.value;
  if (g.status === 'fulfilled') gold = g.value;
  if (gh.status === 'fulfilled') goldHist = gh.value;
  lastLoad = Date.now();
  booted = true;
  route();
  if (!state.city && gold) openWelcome();
  else maybeAutoInstallSheet();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
