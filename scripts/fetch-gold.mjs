#!/usr/bin/env node
// Gold & silver rates from free, key-less sources.
//
//   node scripts/fetch-gold.mjs [outDir] [--backfill N] [--no-retail]
//
// Writes  <outDir>/gold.json          live snapshot (spot + city retail rates)
//         <outDir>/gold-history.json  daily history (also kept at data/gold-history.json)
//
// Sources (all free, no API key):
//   spot:   api.gold-api.com (real-time XAU/XAG, CORS-enabled)
//           fallback + history: fawazahmed0/exchange-api on jsDelivr (daily, back to 2024)
//   retail: goodreturns.in city pages (22K/24K/18K per gram, + 10-day table)
//           fallback: policybazaar.com city pages

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchJSON, fetchText, pool, cleanText } from './lib/feed.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const outDir = path.resolve(args[0] && !args[0].startsWith('--') ? args[0] : path.join(root, '_site/data'));
const historyPath = path.join(root, 'data/gold-history.json');
const OZ = 31.1034768; // grams per troy ounce

const { cities } = JSON.parse(await readFile(path.join(root, 'config/gold.json'), 'utf8'));

const istDate = (t = Date.now()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);
const num = (s) => Number(String(s).replace(/[^\d.]/g, ''));
const r2 = (n) => Math.round(n * 100) / 100;

// ---------- spot ----------
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

// ---------- retail (per city) ----------
const pageText = (html) => cleanText(html);

const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const isoFromLong = (s) => {
  const m = s.match(/([A-Z][a-z]{2})\w* (\d{1,2}), (\d{4})/);
  return m ? `${m[3]}-${String(MONTHS[m[1]]).padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
};

async function retailGoodreturns(city) {
  const t = pageText(await fetchText(`https://www.goodreturns.in/gold-rates/${city.gr}.html`, { timeout: 25000 }));
  const m = t.match(
    /stands at ₹\s?([\d,]+) per gram for 24 karat.*?₹\s?([\d,]+) per gram for 22 karat.*?₹\s?([\d,]+) per gram for 18 karat/
  );
  if (!m) throw new Error('goodreturns: pattern not found');
  const cur = { k24: num(m[1]), k22: num(m[2]), k18: num(m[3]) };
  // "Gold Rate in X for Last 10 Days (1 gram) Date 24K 22K Oct 31, 2026 ₹13,888 (-338) ₹12,730 (-310) ..."
  const days = {};
  const tbl = t.slice(t.indexOf('Last 10 Days (1 gram)'));
  for (const r of tbl.matchAll(/([A-Z][a-z]{2} \d{1,2}, \d{4}) ₹\s?([\d,]+) \([^)]*\) ₹\s?([\d,]+)/g)) {
    const d = isoFromLong(r[1]);
    if (d && !days[d]) days[d] = { k24: num(r[2]), k22: num(r[3]) };
    if (Object.keys(days).length >= 10) break;
  }
  const dates = Object.keys(days).sort().reverse();
  let prev = dates[1] ? { ...days[dates[1]] } : null;
  const ch18 = t.match(/18K Gold\s*\/g\s*₹\s?[\d,]+\s*([+-])\s*([\d,]+)/);
  if (prev && ch18) prev.k18 = cur.k18 - (ch18[1] === '-' ? -1 : 1) * num(ch18[2]);
  return { ...cur, prev, date: dates[0] || istDate(), days, src: 'goodreturns.in' };
}

async function retailPolicybazaar(city) {
  const t = pageText(await fetchText(`https://www.policybazaar.com/gold-rate-${city.pb}/`, { timeout: 25000 }));
  const rows = [...t.matchAll(/1 Gram ₹\s?([\d,]+) ₹\s?([\d,]+)/g)];
  if (rows.length < 2) throw new Error('policybazaar: pattern not found');
  const [k24, k24y] = [num(rows[0][1]), num(rows[0][2])];
  const [k22, k22y] = [num(rows[1][1]), num(rows[1][2])];
  if (!(k24 > k22 && k22 > 0)) throw new Error('policybazaar: implausible values');
  return {
    k24, k22, k18: Math.round(k24 * 0.75), k18est: true,
    prev: { k24: k24y, k22: k22y, k18: Math.round(k24y * 0.75) },
    date: istDate(), days: {}, src: 'policybazaar.com',
  };
}

async function retail(city) {
  const errors = [];
  for (const fn of [retailGoodreturns, retailPolicybazaar]) {
    try {
      const r = await fn(city);
      // sanity: per-gram 24K rate should be within a broad plausible band
      if (r.k24 < 1000 || r.k24 > 100000) throw new Error(`implausible 24K ${r.k24}`);
      return r;
    } catch (e) {
      errors.push(e.message);
    }
  }
  console.warn(`WARN retail ${city.id}: ${errors.join(' | ')}`);
  return null;
}

// ---------- main ----------
let history = { days: {} };
try { history = JSON.parse(await readFile(historyPath, 'utf8')); } catch {}
history.days ||= {};

let spot;
try {
  spot = await spotFromGoldApi();
} catch (e) {
  console.warn('WARN gold-api failed, falling back:', e.message);
  spot = await spotFromCurrencyApi('latest');
}
spot.inrG24 = r2(spot.inrOz / OZ);

const cityRates = {};
if (!flag('--no-retail')) {
  await pool(cities, 3, async (c) => {
    const r = await retail(c);
    if (r) cityRates[c.id] = r;
  });
}

// premium of local retail (excl. GST) over international spot – used by the
// browser to estimate live retail prices between scheduled updates.
const prem = Object.values(cityRates).map((r) => r.k24 / spot.inrG24).filter((p) => p > 0.9 && p < 1.5).sort();
const premium = prem.length ? r2(prem[Math.floor(prem.length / 2)] * 1e4) / 1e4 : null;

// ---- history: today's row + whatever the 10-day tables give us ----
const today = istDate();
const upsert = (d, patch) => {
  const row = (history.days[d] ||= {});
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'c') row.c = { ...(row.c || {}), ...v };
    else row[k] = v;
  }
};
upsert(today, { usdOz: spot.usdOz, inrG: spot.inrG24, usdInr: spot.usdInr, agG: spot.agInrG });
for (const [id, r] of Object.entries(cityRates)) {
  // The 10-day table holds each day's final published rate: let it correct
  // earlier snapshots (keeping an 18K value only if 24K is unchanged).
  for (const [d, v] of Object.entries(r.days)) {
    const ex = history.days[d]?.c?.[id];
    upsert(d, { c: { [id]: ex && ex[0] === v.k24 && ex[2] ? [v.k24, v.k22, ex[2]] : [v.k24, v.k22] } });
  }
  upsert(r.date, { c: { [id]: [r.k24, r.k22, r.k18] } });
}

// ---- optional spot backfill from the date-tagged currency API ----
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
      console.warn('WARN backfill', d, e.message);
    }
  });
}

// keep ~3 years, sorted
const keys = Object.keys(history.days).sort().slice(-1100);
history = { updated: Date.now(), days: Object.fromEntries(keys.map((k) => [k, history.days[k]])) };

const snapshot = {
  updated: Date.now(),
  date: today,
  spot,
  premium,
  cities: Object.fromEntries(
    Object.entries(cityRates).map(([id, { days, ...r }]) => [id, r])
  ),
  cityMeta: cities.map(({ id, name }) => ({ id, name })),
};

await mkdir(outDir, { recursive: true });
await mkdir(path.dirname(historyPath), { recursive: true });
await writeFile(path.join(outDir, 'gold.json'), JSON.stringify(snapshot));
const histJson = JSON.stringify(history).replace(/\},"/g, '},\n"'); // one day per line → small git diffs
await writeFile(historyPath, histJson + '\n');
await writeFile(path.join(outDir, 'gold-history.json'), histJson);

console.log(
  `gold: spot $${spot.usdOz}/oz ₹${spot.inrG24}/g (${spot.src}); retail ${Object.keys(cityRates).length}/${cities.length} cities; premium ${premium}; history ${keys.length} days`
);
