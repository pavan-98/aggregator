#!/usr/bin/env node
// Gold & silver rates from free, key-less sources.
//
//   node scripts/fetch-gold.mjs [outDir] [--backfill N] [--no-retail]
//
// Writes  <outDir>/gold.json          live snapshot (spot, city retail, IBJA benchmark, silver)
//         <outDir>/gold-history.json  daily history (also kept at data/gold-history.json)
//
// Sources (all free, no API key, fetched with an honest User-Agent):
//   city retail : groww.in gold page – one request returns 24K/22K/18K for ~300
//                 Indian cities + the last 10 days (embedded Next.js JSON)
//                 fallback: goodreturns.in city pages
//   city silver : groww.in silver page – per-gram silver for ~300 cities
//   benchmark   : ibjarates.com – India Bullion & Jewellers Association rates for
//                 999/995/916/750/585 gold, silver 999, platinum (+ ~4 months history)
//   spot        : api.gold-api.com (real-time XAU/XAG, CORS) ;
//                 fallback + history: fawazahmed0/exchange-api on jsDelivr

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchJSON, fetchText, pool, cleanText, decodeEntities } from './lib/feed.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const outDir = path.resolve(args[0] && !args[0].startsWith('--') ? args[0] : path.join(root, '_site/data'));
const historyPath = path.join(root, 'data/gold-history.json');
const OZ = 31.1034768; // grams per troy ounce

const { cities } = JSON.parse(await readFile(path.join(root, 'config/cities.json'), 'utf8'));

const istDate = (t = Date.now()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);
const num = (s) => Number(String(s).replace(/[^\d.]/g, ''));
const r2 = (n) => Math.round(n * 100) / 100;
const dmyToIso = (s) => {
  const m = String(s).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
const warn = (...a) => console.warn('WARN', ...a);
const plausibleG24 = (v) => v > 1000 && v < 100000;

// ---------------------------------------------------------------- spot
async function spotFromGoldApi() {
  const base = 'https://api.gold-api.com/price';
  const [xauUsd, xauInr, xagUsd, xagInr] = await Promise.all(
    ['XAU', 'XAU/INR', 'XAG', 'XAG/INR'].map((p) => fetchJSON(`${base}/${p}`, { timeout: 15000 }))
  );
  if (!(xauUsd.price > 0 && xauInr.price > 0)) throw new Error('gold-api: bad payload');
  return {
    usdOz: r2(xauUsd.price),
    inrOz: r2(xauInr.price),
    usdInr: r2(xauInr.exchangeRate || xauInr.price / xauUsd.price),
    agUsdOz: r2(xagUsd.price),
    agInrG: r2(xagInr.price / OZ),
    at: Date.parse(xauUsd.updatedAt) || Date.now(),
    src: 'gold-api.com',
  };
}

const currencyApi = (date, cur) => [
  `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/${cur}.min.json`,
  `https://${date}.currency-api.pages.dev/v1/currencies/${cur}.min.json`,
];

async function spotFromCurrencyApi(date = 'latest') {
  const get = async (cur) => {
    let err;
    for (const u of currencyApi(date, cur)) {
      try { return await fetchJSON(u, { timeout: 15000, retries: 0 }); } catch (e) { err = e; }
    }
    throw err;
  };
  const [xau, xag] = await Promise.all([get('xau'), get('xag')]);
  return {
    date: xau.date,
    usdOz: r2(xau.xau.usd),
    inrOz: r2(xau.xau.inr),
    usdInr: r2(xau.xau.inr / xau.xau.usd),
    agUsdOz: r2(xag.xag.usd),
    agInrG: r2(xag.xag.inr / OZ),
    at: Date.parse(xau.date) || Date.now(),
    src: 'fawazahmed0/exchange-api',
  };
}

// ---------------------------------------------------------------- groww (city retail, all cities in one request)
function nextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('no __NEXT_DATA__');
  return JSON.parse(m[1]).props.pageProps;
}

async function growwGold() {
  // Test hook: SIMULATE_GROWW_DOWN=1 node scripts/fetch-gold.mjs  → exercises the goodreturns backup.
  if (process.env.SIMULATE_GROWW_DOWN) throw new Error('simulated outage');
  const slug = cities.find((c) => c.groww)?.groww || 'hyderabad';
  const pp = nextData(await fetchText(`https://groww.in/gold-rates/gold-rate-today-in-${slug}`, { timeout: 25000 }));
  const { physicalGoldRate: now = {}, daySummary = {} } = pp.goldRateData || {};
  const pick = (p) => ({ k24: p.TWENTY_FOUR, k22: p.TWENTY_TWO, k18: p.EIGHTEEN });
  const out = {};
  for (const c of cities) {
    const cur = now[c.groww];
    if (!cur?.price || !plausibleG24(cur.price.TWENTY_FOUR)) continue;
    const days = {};
    for (const [d, v] of Object.entries(daySummary[c.groww] || {})) if (v?.price?.TWENTY_FOUR) days[d] = pick(v.price);
    const dates = Object.keys(days).sort();
    const date = cur.date || dates.at(-1) || istDate();
    const prevDate = dates.filter((d) => d < date).at(-1);
    out[c.id] = { ...pick(cur.price), prev: prevDate ? days[prevDate] : null, date, days, src: 'groww.in' };
  }
  return out;
}

async function growwSilver() {
  const slug = cities.find((c) => c.groww)?.groww || 'hyderabad';
  const pp = nextData(await fetchText(`https://groww.in/silver-rates/silver-rate-today-in-${slug}`, { timeout: 25000 }));
  const bySlug = new Map((pp.cityRates || []).map((r) => [r.slug, r]));
  const out = {};
  for (const c of cities) {
    const r = bySlug.get(c.groww);
    if (r?.todayPrice > 0) out[c.id] = { g: r.todayPrice, prev: r.yesterdayPrice || null };
  }
  const india = pp.silverItem?.spotPrice > 0 ? { kg: pp.silverItem.spotPrice, prevKg: pp.silverItem.lastDayClosePrice || null } : null;
  return { cities: out, india, date: pp.snapshotDate || null };
}

// ---------------------------------------------------------------- goodreturns (per-city fallback)
const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const isoFromLong = (s) => {
  const m = s.match(/([A-Z][a-z]{2})\w* (\d{1,2}), (\d{4})/);
  return m ? `${m[3]}-${String(MONTHS[m[1]]).padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
};

async function goodreturns(city) {
  const t = cleanText(await fetchText(`https://www.goodreturns.in/gold-rates/${city.gr}.html`, { timeout: 25000, retries: 1 }));
  const m = t.match(
    /stands at ₹\s?([\d,]+) per gram for 24 karat.*?₹\s?([\d,]+) per gram for 22 karat.*?₹\s?([\d,]+) per gram for 18 karat/
  );
  if (!m) throw new Error('goodreturns: pattern not found');
  const cur = { k24: num(m[1]), k22: num(m[2]), k18: num(m[3]) };
  const days = {};
  const tbl = t.slice(t.indexOf('Last 10 Days (1 gram)'));
  for (const r of tbl.matchAll(/([A-Z][a-z]{2} \d{1,2}, \d{4}) ₹\s?([\d,]+) \([^)]*\) ₹\s?([\d,]+)/g)) {
    const d = isoFromLong(r[1]);
    if (d && !days[d]) days[d] = { k24: num(r[2]), k22: num(r[3]) };
    if (Object.keys(days).length >= 10) break;
  }
  const dates = Object.keys(days).sort().reverse();
  const prev = dates[1] ? { ...days[dates[1]] } : null;
  return { ...cur, prev, date: dates[0] || istDate(), days, src: 'goodreturns.in' };
}

// ---------------------------------------------------------------- IBJA benchmark (all purities)
async function ibja() {
  const html = await fetchText('https://ibjarates.com/', { timeout: 25000 });
  const rate = (p) => num(html.match(new RegExp(`id="GoldRatesCompare${p}">\\s*([\\d,.]+)`))?.[1] || 0);
  const rates = { 999: rate(999), 995: rate(995), 916: rate(916), 750: rate(750), 585: rate(585) };
  if (!plausibleG24(rates[999])) throw new Error('ibja: no 999 rate');

  // Session tables: rows of  date | 999 | 995 | 916 | 750 | 585 | silver 999 (kg) | platinum 999  (gold per 10 g)
  const sessions = {};
  for (const tab of ['am', 'pm']) {
    const start = html.indexOf(`id="tab-${tab}"`);
    if (start < 0) continue;
    const seg = html.slice(start, html.indexOf('</table>', start));
    const row = seg.match(/<strong>(\d{2}\/\d{2}\/\d{4})<\/strong>([\s\S]*?)<\/tr>/);
    if (!row) continue;
    const vals = [...row[2].matchAll(/>\s*([\d,.]+)\s*</g)].map((m) => num(m[1]));
    if (vals.length >= 7) {
      sessions[tab] = {
        date: dmyToIso(row[1]),
        g: { 999: vals[0] / 10, 995: vals[1] / 10, 916: vals[2] / 10, 750: vals[3] / 10, 585: vals[4] / 10 },
        silverKg: vals[5],
        platinumG: vals[6] / 10,
      };
    }
  }
  // ~4 months of daily 999/916 (per 10 g) and silver (per kg) used by IBJA's own charts
  const series = (id) => {
    const m = html.match(new RegExp(`id="${id}" value="([^"]*)"`));
    if (!m) return null;
    try { return JSON.parse(decodeEntities(m[1])); } catch { return null; }
  };
  const hist = {};
  const g = series('HdnGold');
  g?.labels?.forEach((l, i) => {
    const d = dmyToIso(l);
    if (d && g.purity999?.[i]) (hist[d] ||= {}).g999 = g.purity999[i] / 10;
  });
  const s = series('HdnSilver');
  s?.labels?.forEach((l, i) => {
    const d = dmyToIso(l);
    if (d && s.silverRate?.[i]) (hist[d] ||= {}).agKg = s.silverRate[i];
  });
  const latest = sessions.pm && sessions.am ? (sessions.pm.date >= sessions.am.date ? sessions.pm : sessions.am) : sessions.pm || sessions.am;
  return { rates, silverKg: latest?.silverKg || null, platinumG: latest?.platinumG || null, sessions, hist, src: 'ibjarates.com' };
}

// ---------------------------------------------------------------- main
let history = { days: {} };
try { history = JSON.parse(await readFile(historyPath, 'utf8')); } catch {}
history.days ||= {};
const upsert = (d, patch) => {
  const row = (history.days[d] ||= {});
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) row[k] = { ...(row[k] || {}), ...v };
    else row[k] = v;
  }
};

let spot;
try {
  spot = await spotFromGoldApi();
} catch (e) {
  warn('gold-api failed, falling back:', e.message);
  spot = await spotFromCurrencyApi('latest');
}
spot.inrG24 = r2(spot.inrOz / OZ);

let cityRates = {};
let silver = { cities: {}, india: null };
let bench = null;
if (!flag('--no-retail')) {
  const [gr, sv, ib] = await Promise.allSettled([growwGold(), growwSilver(), ibja()]);
  if (gr.status === 'fulfilled') cityRates = gr.value;
  else warn('groww gold:', gr.reason?.message);
  if (sv.status === 'fulfilled') silver = sv.value;
  else warn('groww silver:', sv.reason?.message);
  if (ib.status === 'fulfilled') bench = ib.value;
  else warn('ibja:', ib.reason?.message);

  // goodreturns.in backup: used for any city Groww didn't return, or returned
  // with a stale date (older than yesterday). Whichever source is newer wins.
  const yesterday = istDate(Date.now() - 864e5);
  const backup = cities.filter((c) => c.gr && (!cityRates[c.id] || cityRates[c.id].date < yesterday));
  if (backup.length) {
    console.log(`goodreturns backup for: ${backup.map((c) => c.id).join(', ')}`);
    await pool(backup, 2, async (c) => {
      try {
        const r = await goodreturns(c);
        const cur = cityRates[c.id];
        if (!cur || r.date >= cur.date) cityRates[c.id] = cur ? { ...r, days: { ...cur.days, ...r.days } } : r;
      } catch (e) {
        warn(`goodreturns ${c.id}:`, e.message);
      }
    });
  }
}
const bySource = {};
for (const [id, r] of Object.entries(cityRates)) (bySource[r.src] ||= []).push(id);
for (const [src, ids] of Object.entries(bySource)) console.log(`city rates from ${src}: ${ids.join(', ')}`);

// Premium of local retail (excl. GST) over international spot – lets the browser
// estimate live retail prices between scheduled updates.
const prem = Object.values(cityRates).map((r) => r.k24 / spot.inrG24).filter((p) => p > 0.9 && p < 1.5).sort();
const premium = prem.length ? Math.round(prem[Math.floor(prem.length / 2)] * 1e4) / 1e4 : null;

// ---- history ----
const today = istDate();
upsert(today, { usdOz: spot.usdOz, inrG: spot.inrG24, usdInr: spot.usdInr, agG: spot.agInrG });
for (const [id, r] of Object.entries(cityRates)) {
  // The 10-day table holds each day's final published rate: let it correct earlier snapshots.
  for (const [d, v] of Object.entries(r.days)) upsert(d, { c: { [id]: v.k18 ? [v.k24, v.k22, v.k18] : [v.k24, v.k22] } });
  upsert(r.date, { c: { [id]: [r.k24, r.k22, r.k18] } });
}
for (const [id, s] of Object.entries(silver.cities)) upsert(today, { s: { [id]: s.g } });
if (bench) {
  for (const [d, v] of Object.entries(bench.hist)) upsert(d, { ibja: v });
  for (const ses of Object.values(bench.sessions)) upsert(ses.date, { ibja: { g999: ses.g[999], g916: ses.g[916], agKg: ses.silverKg } });
}

const backfill = Number(opt('--backfill', 0));
if (backfill > 0) {
  const want = [];
  for (let i = 1; i <= backfill; i++) {
    const d = istDate(Date.now() - i * 864e5);
    if (!history.days[d]?.inrG) want.push(d);
  }
  console.log(`backfilling spot for ${want.length} days…`);
  await pool(want, 6, async (d) => {
    try {
      const s = await spotFromCurrencyApi(d);
      upsert(d, { usdOz: s.usdOz, inrG: r2(s.inrOz / OZ), usdInr: s.usdInr, agG: s.agInrG });
    } catch (e) {
      warn('backfill', d, e.message);
    }
  });
}

const keys = Object.keys(history.days).sort().slice(-1100); // ~3 years
history = { updated: Date.now(), days: Object.fromEntries(keys.map((k) => [k, history.days[k]])) };

const snapshot = {
  updated: Date.now(),
  date: today,
  spot,
  premium,
  cities: Object.fromEntries(
    Object.entries(cityRates).map(([id, { days, ...r }]) => [id, { ...r, silver: silver.cities[id] || null }])
  ),
  silverIndia: silver.india,
  ibja: bench && { rates: bench.rates, silverKg: bench.silverKg, platinumG: bench.platinumG, sessions: bench.sessions, src: bench.src },
  cityMeta: cities.map(({ id, name, short }) => ({ id, name, short })),
};

await mkdir(outDir, { recursive: true });
await mkdir(path.dirname(historyPath), { recursive: true });
await writeFile(path.join(outDir, 'gold.json'), JSON.stringify(snapshot));
const histJson = `{"updated":${history.updated},"days":{\n${keys.map((k) => `${JSON.stringify(k)}:${JSON.stringify(history.days[k])}`).join(',\n')}\n}}`;
await writeFile(historyPath, histJson + '\n');
await writeFile(path.join(outDir, 'gold-history.json'), histJson);

console.log(
  `gold: spot $${spot.usdOz}/oz ₹${spot.inrG24}/g (${spot.src}); retail ${Object.keys(cityRates).length}/${cities.length} cities` +
    ` [${[...new Set(Object.values(cityRates).map((r) => r.src))].join(', ')}]; silver ${Object.keys(silver.cities).length} cities;` +
    ` IBJA ${bench ? `999=₹${bench.rates[999]}/g` : 'n/a'}; premium ${premium}; history ${keys.length} days`
);
