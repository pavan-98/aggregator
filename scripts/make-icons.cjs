// Dev helper: renders the PNG app icons from SVG with the pre-installed Playwright.
//   node scripts/make-icons.cjs
const { chromium } = require('playwright');
const path = require('path');
const out = path.join(__dirname, '..', 'site', 'assets', 'icons');

// Full-bleed artwork (no rounded corners: iOS/Android apply their own mask).
// `inset` shrinks the artwork toward the centre for the maskable safe zone.
const art = (inset) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a6fd6"/><stop offset="1" stop-color="#174a99"/></linearGradient></defs>
  <rect width="64" height="64" fill="url(#g)"/>
  <g transform="translate(32 32) scale(${1 - inset}) translate(-32 -32)">
    <rect x="12" y="14" width="40" height="36" rx="7" fill="none" stroke="#fff" stroke-width="4"/>
    <path d="M20 26h24M20 33h24M20 40h12" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
    <circle cx="46" cy="44" r="9" fill="#f0b429" stroke="#1d57b3" stroke-width="3"/>
  </g>
</svg>`;
const rounded = art(0).replace('<rect width="64" height="64"', '<rect width="64" height="64" rx="14"');

const jobs = [
  ['apple-touch-icon.png', 180, art(0.08)],
  ['icon-192.png', 192, rounded],
  ['icon-512.png', 512, rounded],
  ['maskable-512.png', 512, art(0.22)],
  ['favicon-32.png', 32, rounded],
];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const [name, size, svg] of jobs) {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await p.screenshot({ path: path.join(out, name), omitBackground: !name.startsWith('apple'), clip: { x: 0, y: 0, width: size, height: size } });
    console.log('wrote', name);
  }
  await b.close();
})();
