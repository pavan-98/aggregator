#!/usr/bin/env node
// Fetches every topic in config/topics.json (Google News RSS + publisher feeds),
// in English and Telugu, and writes small JSON files the static site reads.
//
//   node scripts/fetch-news.mjs [outDir]      (default: _site/data)

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchText, parseFeed, mergeItems, pool } from './lib/feed.mjs';
import { googleNewsUrl } from '../site/assets/gnews.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[2] || path.join(root, '_site/data'));
const LANGS = ['en', 'te'];

const { topics } = JSON.parse(await readFile(path.join(root, 'config/topics.json'), 'utf8'));

// One news topic per city in config/cities.json: Google News searches for the
// city's names, plus its region's feeds filtered to stories that mention it.
const citiesCfg = JSON.parse(await readFile(path.join(root, 'config/cities.json'), 'utf8'));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const orQuery = (names) => names.map((n) => (/\s/.test(n) ? `"${n}"` : n)).join(' OR ');
for (const c of citiesCfg.cities) {
  const en = c.aliases?.en?.length ? c.aliases.en : [c.name.en];
  const te = c.aliases?.te?.length ? c.aliases.te : [c.name.te];
  const match = [...en, ...te].map(esc).join('|');
  const region = citiesCfg.regionFeeds?.[c.region] || {};
  const feeds = {};
  for (const lang of LANGS) {
    const list = [...(region[lang] || []).map((f) => ({ ...f, match: f.match || match })), ...(c.feeds?.[lang] || [])];
    if (list.length) feeds[lang] = list;
  }
  topics.push({
    id: `city-${c.id}`, icon: '⌂', city: c.id, name: c.name, feeds,
    google: { en: { q: orQuery(en), when: '2d' }, te: { q: orQuery(te), when: '2d' } },
  });
}

// Build the job list: one job per (topic, lang, source).
const jobs = [];
for (const topic of topics) {
  for (const lang of LANGS) {
    const g = topic.google?.[lang];
    if (g) jobs.push({ topic: topic.id, lang, name: 'Google News', url: googleNewsUrl(g, lang), google: true });
    for (const f of topic.feeds?.[lang] || [])
      jobs.push({ topic: topic.id, lang, name: f.name, url: f.url, match: f.match ? new RegExp(f.match, 'iu') : null, max: f.max });
  }
}

// Same URL may be used by several topics: fetch once.
const cache = new Map();
const status = [];
const maxFor = (url) => Math.max(150, ...jobs.filter((j) => j.url === url).map((j) => j.max || 0));
await pool([...new Set(jobs.map((j) => j.url))], 8, async (url) => {
  const t0 = Date.now();
  try {
    const xml = await fetchText(url, { timeout: 30000, retries: 1 });
    const parsed = parseFeed(xml, { maxItems: maxFor(url) });
    cache.set(url, parsed.items);
    status.push({ url, ok: true, n: parsed.items.length, ms: Date.now() - t0 });
  } catch (e) {
    cache.set(url, []);
    status.push({ url, ok: false, error: String(e.message || e).slice(0, 200) });
    console.warn('WARN', e.message);
  }
});

await mkdir(path.join(outDir, 'news'), { recursive: true });
const now = Date.now();
const index = { updated: now, topics: [] };

for (const topic of topics) {
  const counts = {};
  for (const lang of LANGS) {
    const lists = jobs
      .filter((j) => j.topic === topic.id && j.lang === lang)
      .map((j) =>
        cache
          .get(j.url)
          .filter((it) => !j.match || j.match.test(`${it.t} ${it.d}`))
          .map((it) => ({ ...it, s: it.s || j.name }))
      );
    const items = mergeItems(lists, { max: 80 });
    counts[lang] = items.length;
    await writeFile(
      path.join(outDir, 'news', `${topic.id}.${lang}.json`),
      JSON.stringify({ topic: topic.id, lang, updated: now, items })
    );
  }
  index.topics.push({ id: topic.id, icon: topic.icon, city: topic.city, name: topic.name, google: topic.google, counts });
}

await writeFile(path.join(outDir, 'topics.json'), JSON.stringify(index));
await writeFile(path.join(outDir, 'news-status.json'), JSON.stringify({ updated: now, feeds: status }, null, 1));

const ok = status.filter((s) => s.ok).length;
console.log(`news: ${ok}/${status.length} feeds ok, ${topics.length} topics → ${outDir}`);
if (ok === 0) process.exit(1);
