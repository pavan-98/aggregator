import { makeT } from './i18n.js';
import { googleNewsUrl } from './gnews.js';
import { renderChart } from './chart.js';

// ------------------------------------------------------------------ state
const KEY = 'pnd.v1';
const DEFAULTS = {
  uiLang: (navigator.language || '').startsWith('te') ? 'te' : 'en',
  newsLang: 'auto', // auto | en | te | both
  theme: 'auto',
  order: [],
  hidden: [],
  custom: [], // {id, name, q}
  active: 'top',
  city: 'hyderabad',
  karat: 'k22',
  range: 30,
  goldView: 'chart',
  goldCollapsed: window.matchMedia('(max-width: 900px)').matches,
  muted: [],
  proxy: '',
};
const load = () => {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
};
let state = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };
let t = makeT(state.uiLang);

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
const icon = (d) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = `<path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  return s;
};
const ICON = { up: 'm6 15 6-6 6 6', down: 'm6 9 6 6 6-6', x: 'M6 6l12 12M18 6 6 18', chevron: 'm6 9 6 6 6-6' };

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2600);
}

// ------------------------------------------------------------------ formatting
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

// ------------------------------------------------------------------ data
const DATA = './data';
let index = { topics: [], updated: 0 };
let gold = null;
let goldHist = null;
let liveSpot = null;

async function getJSON(url, { bust = true } = {}) {
  const u = bust ? `${url}${url.includes('?') ? '&' : '?'}v=${Math.floor(Date.now() / 60000)}` : url;
  const r = await fetch(u, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function allTopics() {
  const built = index.topics.map((x) => ({ ...x, custom: false }));
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

// ------------------------------------------------------------------ live fetching (CORS proxies)
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

// Your own proxy (if configured) is tried first; otherwise the public proxies
// race in parallel and the first valid feed wins.
async function fetchViaProxies(feedUrl) {
  const own = PROXIES.find((p) => p.id === 'own');
  if (state.proxy.trim()) {
    try { return await tryProxy(own, feedUrl); } catch {}
  }
  const outer = new AbortController();
  const items = await Promise.any(
    PROXIES.filter((p) => p !== own).map((p) => tryProxy(p, feedUrl, outer.signal))
  );
  outer.abort();
  return items;
}

async function fetchLive(topic, lang) {
  const spec = topic.google?.[lang];
  if (!spec) return [];
  const cacheKey = `pnd.live.${topic.id}.${lang}`;
  try {
    const c = JSON.parse(sessionStorage.getItem(cacheKey) || 'null');
    if (c && Date.now() - c.at < 90e3) return c.items;
  } catch {}
  const items = await fetchViaProxies(googleNewsUrl(spec, lang));
  try { sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), items })); } catch {}
  return items;
}

// ------------------------------------------------------------------ news
let reqId = 0;
let current = { items: [], updated: 0, live: false };
let liveMode = false;

function merge(lists) {
  const seen = new Set();
  const out = [];
  const norm = (s) => s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '').slice(0, 70);
  for (const it of lists.flat()) {
    const k = norm(it.t);
    if (!it.t || !safeUrl(it.l) || seen.has(k) || seen.has(it.l)) continue;
    seen.add(k); seen.add(it.l);
    out.push(it);
  }
  return out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

async function loadNews({ live = liveMode, quiet = false } = {}) {
  const topic = visibleTopics().find((x) => x.id === state.active) || visibleTopics()[0];
  if (!topic) return;
  state.active = topic.id;
  const my = ++reqId;
  const langs = newsLangs();
  const status = $('#news-status');
  const btnLive = $('#btn-live');
  if (!quiet) {
    status.textContent = t('loading');
    if (!current.items.length || current.topic !== topic.id) renderSkeleton();
  }
  const wantLive = live || topic.custom;
  btnLive.classList.toggle('busy', wantLive);

  let updated = 0;
  let liveOk = false;
  let liveErr = false;
  const lists = await Promise.all(
    langs.map(async (lang) => {
      const parts = [];
      if (!topic.custom) {
        try {
          const j = await getJSON(`${DATA}/news/${topic.id}.${lang}.json`);
          updated = Math.max(updated, j.updated || 0);
          parts.push(j.items.map((i) => ({ ...i, lang })));
        } catch {}
      }
      if (wantLive) {
        try {
          parts.unshift((await fetchLive(topic, lang)).map((i) => ({ ...i, lang })));
          liveOk = true;
        } catch {
          liveErr = true;
        }
      }
      return parts.flat();
    })
  );
  if (my !== reqId) return;
  btnLive.classList.remove('busy');
  btnLive.classList.toggle('on', liveMode || topic.custom);
  const items = merge(lists);
  current = { topic: topic.id, items, updated: liveOk ? Date.now() : updated, live: liveOk };
  renderNews();
  let msg = '';
  if (liveOk) msg = t('liveOn');
  else if (wantLive && liveErr) msg = topic.custom ? t('loadFail') : t('liveFail');
  if (!msg && updated) msg = `${t('updated')} ${rel(updated)}`;
  status.textContent = msg;
  updateTopbarTime();
}

function renderSkeleton() {
  const feed = $('#feed');
  feed.replaceChildren(
    ...Array.from({ length: 6 }, () =>
      h('li', { class: 'story skeleton', 'aria-hidden': 'true' }, h('div', { class: 'story-body' }, h('div', { class: 'story-title' }), h('div', { class: 'story-meta' })))
    )
  );
}

function renderNews() {
  const feed = $('#feed');
  const q = $('#filter').value.trim().toLowerCase();
  const muted = new Set(state.muted.map((m) => m.toLowerCase()));
  const both = newsLangs().length > 1;
  const items = current.items.filter(
    (i) => !muted.has((i.s || '').toLowerCase()) && (!q || i.t.toLowerCase().includes(q) || (i.s || '').toLowerCase().includes(q))
  );
  const old = feed.nextElementSibling?.classList.contains('empty') ? feed.nextElementSibling : null;
  old?.remove();
  if (!items.length) {
    feed.replaceChildren();
    feed.after(h('div', { class: 'empty', text: current.items.length ? t('noNews') : t('loadFail') }));
    return;
  }
  feed.replaceChildren(
    ...items.slice(0, 120).map((i) => {
      const img = safeUrl(i.img);
      return h(
        'li',
        { class: 'story' },
        h(
          'div',
          { class: 'story-body' },
          h('h3', { class: 'story-title', lang: i.lang }, h('a', { href: i.l, target: '_blank', rel: 'noopener noreferrer', text: i.t })),
          i.d ? h('p', { class: 'story-desc', lang: i.lang, text: i.d }) : null,
          h(
            'div',
            { class: 'story-meta' },
            i.s ? h('span', { class: 'src', text: i.s }) : null,
            i.s && i.ts ? h('span', { 'aria-hidden': 'true', text: '·' }) : null,
            i.ts ? h('time', { datetime: new Date(i.ts).toISOString(), title: new Date(i.ts).toLocaleString(locale()), text: rel(i.ts) }) : null,
            both ? h('span', { class: 'lang-tag', text: i.lang === 'te' ? 'తె' : 'EN' }) : null
          )
        ),
        img
          ? h('img', {
              class: 'story-thumb', src: img, alt: '', loading: 'lazy', decoding: 'async', referrerPolicy: 'no-referrer',
              onerror: (e) => e.target.remove(),
            })
          : null,
        i.s
          ? h('button', {
              type: 'button', class: 'story-mute', title: `${t('mute')}: ${i.s}`, text: '⊘',
              'aria-label': `${t('mute')}: ${i.s}`,
              onclick: () => { state.muted = [...new Set([...state.muted, i.s])]; save(); renderNews(); toast(`${t('mute')}: ${i.s}`); },
            })
          : null
      );
    })
  );
}

function updateTopbarTime() {
  const ts = Math.max(current.updated || 0, index.updated || 0);
  $('#updated').textContent = ts ? `${t('updated')} ${rel(ts)}` : '';
}

// ------------------------------------------------------------------ topics UI
function renderTopics() {
  const bar = $('#topics');
  const list = visibleTopics();
  if (!list.find((x) => x.id === state.active) && list[0]) state.active = list[0].id;
  bar.replaceChildren(
    ...list.map((x) =>
      h(
        'button',
        {
          type: 'button', class: 'chip', role: 'tab', 'aria-selected': String(x.id === state.active), 'data-id': x.id,
          onclick: () => switchTopic(x.id),
        },
        h('span', { class: 'chip-icon', 'aria-hidden': 'true', text: x.icon || '•' }),
        h('span', { text: topicName(x) })
      )
    )
  );
  const cur = list.find((x) => x.id === state.active);
  $('#news-title').textContent = cur ? topicName(cur) : '';
  bar.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function switchTopic(id) {
  if (id === state.active) return;
  state.active = id;
  save();
  history.replaceState(null, '', `#${encodeURIComponent(id)}`);
  $('#filter').value = '';
  current = { items: [], updated: 0 };
  renderTopics();
  loadNews();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function stepTopic(d) {
  const list = visibleTopics();
  const i = list.findIndex((x) => x.id === state.active);
  const n = list[(i + d + list.length) % list.length];
  if (n) switchTopic(n.id);
}

// ------------------------------------------------------------------ gold
const KARATS = ['k24', 'k22', 'k18'];
function goldCity() {
  if (!gold) return null;
  const ids = Object.keys(gold.cities || {});
  const id = ids.includes(state.city) ? state.city : ids.includes('hyderabad') ? 'hyderabad' : ids[0];
  return id ? { id, ...gold.cities[id] } : null;
}
const cityName = (id) => {
  const m = gold?.cityMeta?.find((c) => c.id === id);
  return m?.name?.[state.uiLang] || m?.name?.en || id;
};

function chgEl(cur, prev) {
  if (!prev) return h('span', { class: 'chg flat', text: '' });
  const d = cur - prev;
  if (!d) return h('span', { class: 'chg flat', text: `• ${t('noChange')}` });
  return h('span', { class: `chg ${d > 0 ? 'up' : 'down'}`, title: t('vsYesterday'), text: `${d > 0 ? '▲' : '▼'} ${num(Math.abs(d))}` });
}

function goldSeries(city) {
  if (!goldHist?.days) return [];
  const idx = KARATS.indexOf(state.karat);
  const ratio = city && city.k24 ? city[state.karat] / city.k24 : [1, 0.916, 0.75][idx];
  const days = Object.keys(goldHist.days).sort();
  const rows = days.map((d) => ({ d, spot: goldHist.days[d].inrG, real: city && goldHist.days[d].c?.[city.id]?.[idx] }));
  // Days without a published city rate are estimated from the international spot
  // price × the local premium observed on the nearest day that has a real rate.
  const anchors = rows.map((r, i) => (r.real && r.spot ? i : -1)).filter((i) => i >= 0);
  const premAt = (i) => {
    if (!anchors.length) return gold?.premium ? gold.premium * ratio : null;
    const j = anchors.reduce((a, b) => (Math.abs(b - i) < Math.abs(a - i) ? b : a));
    return rows[j].real / rows[j].spot;
  };
  const from = new Date(Date.now() - state.range * 864e5).toISOString().slice(0, 10);
  const pts = [];
  rows.forEach((r, i) => {
    if (r.d < from) return;
    if (r.real) pts.push({ d: r.d, v: r.real });
    else if (r.spot && premAt(i)) pts.push({ d: r.d, v: Math.round(r.spot * premAt(i)), est: true });
  });
  return pts;
}

function renderGold() {
  const root = $('#gold');
  if (!gold) {
    root.replaceChildren(h('div', { class: 'card gold-card' }, h('div', { class: 'gold-foot', text: t('goldUnavailable') })));
    return;
  }
  const city = goldCity();
  const spot = liveSpot || gold.spot;
  const card = h('div', { class: `card gold-card${state.goldCollapsed ? ' collapsed' : ''}` });

  const sel = h(
    'select',
    { 'aria-label': t('city'), onchange: (e) => { state.city = e.target.value; save(); renderGold(); } },
    ...(gold.cityMeta || []).filter((c) => gold.cities[c.id]).map((c) => h('option', { value: c.id, selected: city?.id === c.id, text: cityName(c.id) }))
  );
  const collapseBtn = h(
    'button',
    {
      type: 'button', class: 'gold-collapse', 'aria-expanded': String(!state.goldCollapsed),
      title: state.goldCollapsed ? t('expand') : t('collapse'),
      onclick: () => { state.goldCollapsed = !state.goldCollapsed; save(); renderGold(); },
    },
    icon(ICON.chevron)
  );
  card.append(
    h('div', { class: 'gold-head' },
      h('h2', { class: 'gold-title', id: 'gold-title' }, h('span', { class: 'gold-coin', 'aria-hidden': 'true' }), h('span', { text: t('goldRate') })),
      h('div', { class: 'row' }, sel, collapseBtn))
  );

  if (city) {
    card.append(
      h('div', { class: 'rates', role: 'group', 'aria-label': t('perGram') },
        ...KARATS.map((k) =>
          h('button', {
              type: 'button', class: 'rate', 'aria-pressed': String(state.karat === k),
              onclick: () => { state.karat = k; save(); renderGold(); },
            },
            h('div', { class: 'rate-k' }, t(k), k === 'k18' && city.k18est ? h('span', { class: 'tag-est', text: t('estimated') }) : null),
            h('div', { class: 'rate-v', text: inr(city[k]) }),
            h('div', { class: 'rate-sub', text: `${t('perGram')}` }),
            chgEl(city[k], city.prev?.[k]),
            h('div', { class: 'rate-sub', text: `${inr(city[k] * 10)} / 10g` })
          )
        )
      )
    );
  }

  const more = h('div', { class: 'gold-more' });
  // chart
  const pts = goldSeries(city);
  const chartBox = h('div', { class: 'chart' });
  const rangeSeg = h('div', { class: 'seg small', role: 'group' },
    ...[[30, 'days30'], [90, 'days90'], [365, 'days365']].map(([r, k]) =>
      h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(state.range === r), text: t(k),
        onclick: () => { state.range = r; save(); renderGold(); } })
    ),
    h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(state.goldView === 'table'), text: t('table'),
      onclick: () => { state.goldView = state.goldView === 'table' ? 'chart' : 'table'; save(); renderGold(); } })
  );
  const wrap = h('div', { class: 'gold-chart-wrap' },
    h('div', { class: 'gold-chart-bar' }, h('span', { class: 'gold-chart-title', text: `${t(state.karat)} · ${city ? cityName(city.id) : ''}` }), rangeSeg)
  );
  if (pts.length > 1) {
    const vals = pts.map((p) => p.v);
    wrap.append(h('div', { class: 'chart-hl' },
      h('span', {}, `${t('high')} `, h('b', { text: inr(Math.max(...vals)) })),
      h('span', {}, `${t('low')} `, h('b', { text: inr(Math.min(...vals)) })),
      pts.some((p) => p.est) ? h('span', { text: `┄ ${t('estimated')}` }) : null));
    if (state.goldView === 'table') {
      wrap.append(h('div', { class: 'gold-table' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', { text: t('date') }), h('th', { text: `${t(state.karat)} / g` }))),
        h('tbody', {}, ...[...pts].reverse().map((p) => h('tr', {}, h('td', { text: fmtDate(p.d) }),
          h('td', {}, inr(p.v), p.est ? h('span', { class: 'tag-est', text: t('estimated') }) : null)))))));
    } else {
      wrap.append(chartBox);
    }
  }
  more.append(wrap);

  // facts
  const factor = city && city.k24 ? city[state.karat] / city.k24 : 1;
  const est = gold.premium && spot?.inrG24 ? spot.inrG24 * gold.premium * factor : null;
  more.append(h('div', { class: 'gold-facts' },
    est ? h('div', { class: 'fact wide', title: t('liveEstimateHint') },
      h('div', { class: 'fact-k', text: `${t('liveEstimate')} · ${t(state.karat)}` }),
      h('div', { class: 'fact-v' }, inr(est), ' ', h('small', { text: `${t('perGram')} · ${t('estimated')}` }))) : null,
    h('div', { class: 'fact' }, h('div', { class: 'fact-k', text: `${t('spot')} (XAU)` }),
      h('div', { class: 'fact-v' }, usd(spot.usdOz), h('small', { text: ' /oz' }))),
    h('div', { class: 'fact' }, h('div', { class: 'fact-k', text: `${t('spot')} 24K` }),
      h('div', { class: 'fact-v' }, inr(spot.inrG24), h('small', { text: ' /g' }))),
    spot.agInrG ? h('div', { class: 'fact' }, h('div', { class: 'fact-k', text: `${t('silver')} (${t('spot')})` }),
      h('div', { class: 'fact-v' }, inr(spot.agInrG * 1000), h('small', { text: ` ${t('perKg')}` }))) : null,
    spot.usdInr ? h('div', { class: 'fact' }, h('div', { class: 'fact-k', text: t('usdInr') }),
      h('div', { class: 'fact-v', text: `₹${num(spot.usdInr, 2)}` })) : null
  ));
  more.append(h('div', { class: 'gold-foot' },
    h('div', { text: t('goldNote') }),
    h('div', {}, `${t('sources')}: `,
      h('a', { href: 'https://gold-api.com', target: '_blank', rel: 'noopener', text: 'gold-api.com' }), ', ',
      h('a', { href: 'https://github.com/fawazahmed0/exchange-api', target: '_blank', rel: 'noopener', text: 'exchange-api' }),
      city ? [', ', h('a', { href: `https://www.${city.src}`, target: '_blank', rel: 'noopener', text: city.src })] : null,
      ` · ${t('updated')} ${rel(liveSpot?.at || gold.updated)}`)
  ));
  card.append(more);
  root.replaceChildren(card);

  if (pts.length > 1 && state.goldView !== 'table') {
    requestAnimationFrame(() =>
      renderChart(chartBox, pts, {
        fmtV: (v) => inr(v),
        fmtVShort: (v) => `₹${shortInr(v)}`,
        fmtD: fmtDate,
        estLabel: t('estimated'),
      })
    );
  }
}

const OZ = 31.1034768;
async function pollSpot() {
  if (document.hidden || !gold) return;
  try {
    const base = 'https://api.gold-api.com/price';
    const [usdR, inrR, agR] = await Promise.all(['XAU', 'XAU/INR', 'XAG/INR'].map((p) => fetch(`${base}/${p}`).then((r) => r.json())));
    if (!(usdR.price > 0 && inrR.price > 0)) return;
    liveSpot = {
      usdOz: usdR.price, inrG24: inrR.price / OZ, usdInr: inrR.exchangeRate, agInrG: agR.price / OZ,
      at: Date.parse(usdR.updatedAt) || Date.now(),
    };
    renderGold();
  } catch {}
}

// ------------------------------------------------------------------ dialogs
function sheet(dlg, title, body) {
  dlg.replaceChildren(
    h('div', { class: 'sheet-head' },
      h('h2', { id: `${dlg.id}-title`, text: title }),
      h('button', { type: 'button', class: 'icon-btn', title: t('close'), 'aria-label': t('close'), onclick: () => dlg.close() }, icon(ICON.x))),
    h('div', { class: 'sheet-body' }, body)
  );
}

function openTopics() {
  const dlg = $('#dlg-topics');
  const draw = () => {
    const list = allTopics();
    const move = (i, d) => {
      const ids = list.map((x) => x.id);
      [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
      state.order = ids;
      save(); renderTopics(); draw();
    };
    const nameIn = h('input', { required: true, maxLength: 40, autocomplete: 'off' });
    const qIn = h('input', { required: true, maxLength: 200, autocomplete: 'off' });
    const form = h('form', {
      onsubmit: (e) => {
        e.preventDefault();
        const name = nameIn.value.trim();
        const q = qIn.value.trim();
        if (!name || !q) return;
        const id = `c-${Date.now().toString(36)}`;
        state.custom.push({ id, name, q });
        state.order = [...allTopics().map((x) => x.id)];
        save(); renderTopics(); draw();
        toast(`${t('addTopic')}: ${name}`);
      },
    },
      h('label', { class: 'field' }, h('span', { text: t('topicName') }), nameIn),
      h('label', { class: 'field' }, h('span', { text: t('keywords') }), qIn, h('small', { text: t('keywordsHint') })),
      h('div', { class: 'row' }, h('button', { type: 'submit', class: 'btn btn-primary', text: t('addTopic') }), h('small', { class: 'muted', text: t('customHint') }))
    );
    sheet(dlg, t('editTopics'), [
      h('section', {},
        h('ul', { class: 'topic-list' },
          ...list.map((x, i) =>
            h('li', { class: 'topic-row' },
              h('label', {},
                h('input', {
                  type: 'checkbox', checked: !state.hidden.includes(x.id),
                  onchange: (e) => {
                    state.hidden = e.target.checked ? state.hidden.filter((id) => id !== x.id) : [...state.hidden, x.id];
                    save(); renderTopics();
                    if (!state.hidden.includes(state.active)) return;
                    loadNews();
                  },
                }),
                h('span', { class: 'name', text: `${x.icon || '•'}  ${topicName(x)}` }),
                x.custom ? h('span', { class: 'badge', text: t('custom') }) : null),
              h('button', { type: 'button', class: 'mini', title: t('up'), 'aria-label': t('up'), disabled: i === 0, onclick: () => move(i, -1) }, icon(ICON.up)),
              h('button', { type: 'button', class: 'mini', title: t('down'), 'aria-label': t('down'), disabled: i === list.length - 1, onclick: () => move(i, 1) }, icon(ICON.down)),
              x.custom
                ? h('button', { type: 'button', class: 'mini', title: t('delete'), 'aria-label': t('delete'),
                    onclick: () => { state.custom = state.custom.filter((c) => c.id !== x.id); save(); renderTopics(); draw(); if (state.active === x.id) loadNews(); } }, icon(ICON.x))
                : h('span', { class: 'mini', style: 'visibility:hidden' })
            )
          )
        )
      ),
      h('section', {}, h('h3', { text: t('addTopic') }), form),
    ]);
  };
  draw();
  dlg.showModal();
}

function openSettings() {
  const dlg = $('#dlg-settings');
  const select = (label, value, opts, onchange) =>
    h('label', { class: 'field' }, h('span', { text: label }),
      h('select', { onchange: (e) => onchange(e.target.value) }, ...opts.map(([v, l]) => h('option', { value: v, selected: v === value, text: l }))));
  const draw = () => {
    const proxyIn = h('input', { type: 'url', value: state.proxy, placeholder: 'https://my-proxy.workers.dev/', autocomplete: 'off',
      onchange: (e) => { state.proxy = e.target.value.trim(); save(); toast(t('save') + ' ✓'); } });
    const fileIn = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: importSettings });
    sheet(dlg, t('settings'), [
      h('section', {}, h('h3', { text: t('language') }),
        select(t('uiLanguage'), state.uiLang, [['en', 'English'], ['te', 'తెలుగు']], (v) => { setLang(v); draw(); }),
        select(t('newsLanguage'), state.newsLang, [['auto', t('sameAsUi')], ['en', 'English'], ['te', 'తెలుగు'], ['both', `${t('both')} (EN + తె)`]],
          (v) => { state.newsLang = v; save(); loadNews(); })),
      h('section', {}, h('h3', { text: t('theme') }),
        select(t('theme'), state.theme, [['auto', t('themeAuto')], ['light', t('themeLight')], ['dark', t('themeDark')]], (v) => { state.theme = v; save(); applyTheme(); })),
      h('section', {}, h('h3', { text: t('goldRate') }),
        select(t('city'), state.city, (gold?.cityMeta || []).map((c) => [c.id, cityName(c.id)]), (v) => { state.city = v; save(); renderGold(); })),
      h('section', {}, h('h3', { text: t('muted') }),
        state.muted.length
          ? h('div', { class: 'mute-list' }, ...state.muted.map((m) => h('span', { class: 'chip' }, h('span', { text: m }),
              h('button', { type: 'button', text: t('unmute'), onclick: () => { state.muted = state.muted.filter((x) => x !== m); save(); renderNews(); draw(); } }))))
          : h('p', { class: 'muted', text: t('noneMuted') })),
      h('section', {}, h('h3', { text: 'CORS' }),
        h('label', { class: 'field' }, h('span', { text: t('proxy') }), proxyIn, h('small', { text: t('proxyHint') }))),
      h('section', {}, h('h3', { text: t('backup') }),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn', text: t('exportSettings'), onclick: exportSettings }),
          h('button', { type: 'button', class: 'btn', text: t('importSettings'), onclick: () => fileIn.click() }),
          fileIn,
          h('button', { type: 'button', class: 'btn btn-danger', text: t('reset'),
            onclick: () => { if (confirm(t('resetConfirm'))) { localStorage.removeItem(KEY); location.reload(); } } }))),
    ]);
  };
  draw();
  dlg.showModal();
}

function exportSettings() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `my-news-settings-${new Date().toISOString().slice(0, 10)}.json` });
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
    state = { ...DEFAULTS, ...clean };
    save();
    toast(t('importDone'));
    setTimeout(() => location.reload(), 600);
  } catch {
    toast(t('importFail'));
  }
}

// ------------------------------------------------------------------ language / theme
function applyI18n() {
  document.documentElement.lang = state.uiLang;
  t = makeT(state.uiLang);
  document.querySelectorAll('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
  document.querySelectorAll('[data-t-title]').forEach((n) => (n.title = t(n.dataset.tTitle)));
  document.querySelectorAll('.seg-btn[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === state.uiLang)));
  $('#filter').placeholder = t('searchTopic');
  $('#btn-live').title = t('liveHint');
  document.title = `${t('appTitle')} · ${state.uiLang === 'te' ? 'My News' : 'నా వార్తలు'}`;
}
function setLang(lang) {
  if (lang === state.uiLang) return;
  state.uiLang = lang;
  save();
  applyI18n();
  renderTopics();
  renderGold();
  current.items = [];
  loadNews();
}
function applyTheme() {
  if (state.theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = state.theme;
}

// ------------------------------------------------------------------ boot
async function refreshAll({ quiet = false } = {}) {
  const btn = $('#btn-refresh');
  btn.classList.add('spinning');
  const [idx, g, gh] = await Promise.allSettled([getJSON(`${DATA}/topics.json`), getJSON(`${DATA}/gold.json`), getJSON(`${DATA}/gold-history.json`)]);
  if (idx.status === 'fulfilled') index = idx.value;
  if (g.status === 'fulfilled') gold = g.value;
  if (gh.status === 'fulfilled') goldHist = gh.value;
  renderTopics();
  renderGold();
  await loadNews({ quiet });
  btn.classList.remove('spinning');
}

function wire() {
  document.querySelectorAll('.seg-btn[data-lang]').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));
  $('#btn-refresh').addEventListener('click', () => { sessionStorage.clear(); refreshAll(); });
  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-edit-topics').addEventListener('click', openTopics);
  $('#btn-live').addEventListener('click', () => {
    liveMode = !liveMode;
    $('#btn-live').classList.toggle('on', liveMode);
    loadNews({ live: liveMode });
  });
  let ft;
  $('#filter').addEventListener('input', () => { clearTimeout(ft); ft = setTimeout(renderNews, 120); });
  document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select, [contenteditable], dialog[open]') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowRight') stepTopic(1);
    else if (e.key === 'ArrowLeft') stepTopic(-1);
    else if (e.key === 'r' || e.key === 'R') refreshAll();
    else if (e.key === '/') { e.preventDefault(); $('#filter').focus(); }
  });
  let lastLoad = Date.now();
  const tick = () => {
    if (document.hidden) return;
    if (Date.now() - lastLoad > 5 * 60e3) { lastLoad = Date.now(); refreshAll({ quiet: true }); }
    updateTopbarTime();
  };
  setInterval(tick, 30e3);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); pollSpot(); } });
  setInterval(pollSpot, 60e3);
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(renderGold, 150); });
}

(async function main() {
  applyTheme();
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash) state.active = hash;
  applyI18n();
  wire();
  await refreshAll();
  pollSpot();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
