#!/usr/bin/env node
// Local/CI build: copies site/ to _site/ and generates fresh data into _site/data.
//   node scripts/build.mjs            → then serve _site/ (e.g. python3 -m http.server -d _site)
import { cp, rm, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '_site');
await rm(out, { recursive: true, force: true });
await cp(path.join(root, 'site'), out, { recursive: true });
await mkdir(path.join(out, 'data'), { recursive: true });

const run = (script, ...args) => {
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', script), path.join(out, 'data'), ...args], { stdio: 'inherit' });
  return r.status === 0;
};
const newsOk = run('fetch-news.mjs');
const goldOk = run('fetch-gold.mjs');
console.log(`build: news ${newsOk ? 'ok' : 'FAILED'}, gold ${goldOk ? 'ok' : 'FAILED'} → ${out}`);
if (!newsOk && !goldOk) process.exit(1);
