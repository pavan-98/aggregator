// Dev helper: renders the promotional screenshots shown in the install dialog
// (manifest "screenshots") and the README, using the pre-installed Playwright.
//   node scripts/make-screens.cjs [site-url]
// Defaults to the live site so the slides show real headlines and rates.
// Telugu needs a Telugu font on the machine (e.g. Noto Sans Telugu).
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const SITE = (process.argv[2] || 'https://pavan-98.github.io/aggregator/').replace(/\/?$/, '/');
const OUT = path.join(__dirname, '..', 'site', 'assets', 'screens');
const ICON = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '..', 'site', 'assets', 'icons', 'icon-192.png')).toString('base64');
const CITY = 'hyderabad';

// ------------------------------------------------------------ slides
// bg: [from, to, glow]; ink: text colour.
const PHONE = [
  {
    file: 'city.jpg', label: 'Your city’s news and today’s gold rate',
    shot: { hash: '#/home' },
    title: 'Your city.<br>Your news.', sub: 'Local headlines and today’s gold rate. No ads.',
    bg: ['#2a6fd6', '#0f3a80', '#5b9bff'], ink: '#fff',
  },
  {
    file: 'gold.jpg', label: 'Gold rates for every karat',
    shot: { hash: '#/gold', scrollTo: ['.card-title', /All karats/] },
    title: 'Gold rate,<br>every karat', sub: '24K to 9K for your city, per gram and per 10 g.',
    bg: ['#f6cf6b', '#c4860f', '#fff1c2'], ink: '#2f1f00',
  },
  {
    file: 'telugu.jpg', label: 'News in Telugu and English',
    shot: { hash: '#/news', uiLang: 'te', newsLang: 'te', active: 'top' },
    title: '<span lang="te">తెలుగు</span> &amp;<br>English', sub: 'Read in either language, or both together.',
    bg: ['#6b3fd4', '#2e1a6e', '#a585ff'], ink: '#fff',
  },
  {
    file: 'trends.jpg', label: 'Price trends and jewellery bill calculator',
    shot: { hash: '#/gold', theme: 'dark', scrollTo: ['.card-title', /Price trend/] },
    title: '<em>Trends</em> &amp;<br>bill calculator', sub: 'A year of prices, making charges and GST.',
    bg: ['#2a2723', '#0b0a09', '#c58b14'], ink: '#fff', accent: '#f3c24f',
  },
  {
    file: 'topics.jpg', label: '12 topics, no ads, works offline',
    shot: { hash: '#/news', active: 'cricket' },
    title: 'Zero ads.<br>Zero tracking.', sub: '12 topics, offline reading, free forever.',
    bg: ['#11907f', '#064e45', '#4fe0c6'], ink: '#fff',
  },
];
const WIDE = {
  file: 'desktop.jpg', label: 'Taaza on a computer',
  shot: { hash: '#/home' },
  title: 'Ad-free news<br>&amp; gold rates', sub: 'English and తెలుగు, for your city. Free and open source.',
  bg: ['#2a6fd6', '#0f3a80', '#5b9bff'], ink: '#fff',
};

// ------------------------------------------------------------ raw app captures
const PHONE_VP = { width: 412, height: 852 }; // + 40 px status bar = 412×892 screen
const STATUS_H = 40;
const GEST_H = 22; // gesture-bar strip under the app, like a real phone

async function capture(browser, shot, device) {
  const ctx = await browser.newContext(device);
  const seed = {
    schema: 3, city: CITY, uiLang: shot.uiLang || 'en', newsLang: shot.newsLang || 'auto',
    theme: shot.theme || 'light', active: shot.active || 'my-city',
    installDismissed: Date.now(), install: { visits: 1, shown: 9, last: Date.now() },
  };
  await ctx.addInitScript((s) => {
    localStorage.setItem('pnd.v1', JSON.stringify(s));
    sessionStorage.setItem('pnd.visit', '1');
  }, seed);
  const p = await ctx.newPage();
  await p.goto(SITE + shot.hash, { waitUntil: 'networkidle' });
  await p.addStyleTag({ content: '::-webkit-scrollbar{display:none} *{scrollbar-width:none} .toast{display:none!important}' });
  await p.waitForTimeout(1500);
  if (shot.scrollTo) {
    const [sel, re] = shot.scrollTo;
    await p.evaluate(([sel, src]) => {
      const re = new RegExp(src);
      const el = [...document.querySelectorAll(sel)].find((e) => re.test(e.textContent));
      if (!el) throw new Error('not found: ' + src);
      const card = el.closest('.card') || el;
      const bar = document.querySelector('.appbar, header');
      const y = card.getBoundingClientRect().top + scrollY - (bar ? bar.getBoundingClientRect().height : 0) - 12;
      (document.scrollingElement || document.documentElement).scrollTop = y;
    }, [sel, re.source]);
    await p.waitForTimeout(400);
  }
  const buf = await p.screenshot({ type: 'png' });
  await ctx.close();
  return 'data:image/png;base64,' + buf.toString('base64');
}

// ------------------------------------------------------------ slide templates
const css = `
  *{box-sizing:border-box;margin:0}
  body{width:var(--w);height:var(--h);overflow:hidden;font-family:'Inter Display','Inter','Noto Sans Telugu',system-ui,sans-serif;color:var(--ink);
    background:radial-gradient(1100px 900px at 85% 8%,color-mix(in srgb,var(--glow) 55%,transparent),transparent 60%),
               radial-gradient(900px 700px at 0% 100%,color-mix(in srgb,var(--glow) 30%,transparent),transparent 60%),
               linear-gradient(160deg,var(--c1),var(--c2));position:relative}
  [lang=te]{font-family:'Noto Sans Telugu',sans-serif}
  .dots{position:absolute;inset:0;background-image:radial-gradient(color-mix(in srgb,var(--ink) 14%,transparent) 1.6px,transparent 1.8px);background-size:34px 34px;
    -webkit-mask-image:linear-gradient(180deg,#000,transparent 55%);mask-image:linear-gradient(180deg,#000,transparent 55%)}
  .halo{position:absolute;border-radius:50%;background:radial-gradient(closest-side,color-mix(in srgb,var(--glow) 55%,transparent),transparent);pointer-events:none}
  .slide{position:relative;height:100%;display:flex;flex-direction:column;padding:92px 84px 0}
  .brand{display:inline-flex;align-items:center;gap:16px;padding:10px 26px 10px 10px;border-radius:999px;font-size:34px;font-weight:700;letter-spacing:-.01em;
    background:color-mix(in srgb,var(--ink) 12%,transparent);border:2px solid color-mix(in srgb,var(--ink) 18%,transparent)}
  .brand img{width:56px;height:56px;border-radius:14px;box-shadow:0 4px 12px rgb(0 0 0/.2)}
  .brand span{line-height:1}
  .brand b{opacity:.6;margin:0 -4px}
  .brand span[lang=te]{font-weight:700;opacity:.9;position:relative;top:3px}
  h1{font-weight:800;letter-spacing:-.035em;line-height:1.02}
  h1 [lang=te]{letter-spacing:0;font-weight:800;font-size:.86em;display:inline-block;line-height:1;vertical-align:-.04em}
  h1 em{font-style:normal;color:var(--accent)}
  p.sub{font-weight:500;opacity:.88;letter-spacing:-.01em;line-height:1.3}
  .phone{position:absolute;border-radius:86px;padding:16px;background:linear-gradient(145deg,#3a3a3e,#0c0c0e 40%,#1c1c1f);
    box-shadow:0 0 0 3px rgb(255 255 255/.08) inset,0 60px 120px -20px rgb(0 0 0/.55),0 30px 60px -30px rgb(0 0 0/.5)}
  .screen{position:relative;border-radius:70px;overflow:hidden;background:#000}
  .screen img.app{display:block;width:100%}
  .status{display:flex;align-items:center;justify-content:space-between;padding:0 46px;font:600 30px/1 Inter,sans-serif}
  .status .icons{display:flex;gap:10px;align-items:center}
  .gesture{display:flex;align-items:center;justify-content:center}
  .gesture i{width:34%;height:9px;border-radius:9px;background:currentColor;opacity:.75}
  .cam{position:absolute;top:22px;left:50%;width:30px;height:30px;margin-left:-15px;border-radius:50%;background:#050506;box-shadow:0 0 0 3px #1a1a1d}
  .browser{position:absolute;border-radius:22px;overflow:hidden;background:#fff;box-shadow:0 60px 120px -20px rgb(0 0 0/.55),0 0 0 2px rgb(255 255 255/.15)}
  .browser .bar{height:52px;background:#e9e7e2;display:flex;align-items:center;gap:12px;padding:0 20px}
  .browser .bar i{width:15px;height:15px;border-radius:50%;background:#d0ccc4;display:block}
  .browser .bar i:nth-child(1){background:#ff5f57}.browser .bar i:nth-child(2){background:#febc2e}.browser .bar i:nth-child(3){background:#28c840}
  .browser .url{margin-left:18px;flex:1;max-width:560px;height:32px;border-radius:999px;background:#fff;font:500 18px/32px Inter,sans-serif;color:#555;padding:0 18px}
  .browser img{display:block;width:100%}
`;
const statusIcons = (c) => `<span class="icons">
  <svg width="34" height="26" viewBox="0 0 17 13"><path d="M1 12h2V9H1zm4 0h2V7H5zm4 0h2V4H9zm4 0h2V1h-2z" fill="${c}"/></svg>
  <svg width="34" height="26" viewBox="0 0 17 13"><path d="M8.5 12.5 1 4.6a10.6 10.6 0 0 1 15 0z" fill="${c}"/></svg>
  <svg width="50" height="26" viewBox="0 0 25 13"><rect x=".7" y=".7" width="20.6" height="11.6" rx="3.3" fill="none" stroke="${c}" stroke-width="1.4" opacity=".5"/><rect x="2.5" y="2.5" width="14" height="8" rx="1.8" fill="${c}"/><path d="M23 4.5v4c.9-.3 1.4-1.1 1.4-2s-.5-1.7-1.4-2z" fill="${c}" opacity=".5"/></svg>
</span>`;

function vars(s, w, h) {
  return `--w:${w}px;--h:${h}px;--c1:${s.bg[0]};--c2:${s.bg[1]};--glow:${s.bg[2]};--ink:${s.ink};--accent:${s.accent || s.ink}`;
}
const brand = `<div class="brand"><img src="${ICON}" alt=""><span>Taaza</span><b>·</b><span lang="te">తాజా</span></div>`;

function phoneSlide(s, img) {
  const W = 1080, H = 1920, SW = 540; // screen width inside the frame
  const k = SW / PHONE_VP.width;
  const SH = Math.round((PHONE_VP.height + STATUS_H + GEST_H) * k);
  const PW = SW + 32;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head>
  <body style="${vars(s, W, H)}">
    <div class="dots"></div>
    <div class="halo" style="width:1300px;height:1300px;left:-110px;bottom:-260px"></div>
    <div class="slide">
      <div>${brand}</div>
      <h1 style="font-size:122px;margin-top:46px">${s.title}</h1>
      <p class="sub" style="font-size:44px;margin-top:30px;max-width:900px">${s.sub}</p>
      <!-- sits at the bottom; long text pushes it down instead of overlapping -->
      <div class="phone" style="position:relative;flex:none;align-self:center;margin:56px 0 64px;margin-top:auto;width:${PW}px">
      <div class="screen" style="height:${SH}px">
        <div class="status" id="status" style="height:${STATUS_H * k}px"><span>9:41</span>${statusIcons('currentColor')}</div>
        <img class="app" id="app" src="${img}" alt="">
        <div class="gesture" id="gesture" style="height:${GEST_H * k}px"><i></i></div>
        <div class="cam"></div>
      </div>
    </div>
    </div>
  </body></html>`;
}

function wideSlide(s, img) {
  const W = 1920, H = 1080, BW = 1120;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head>
  <body style="${vars(s, W, H)}">
    <div class="dots"></div>
    <div class="halo" style="width:1400px;height:1400px;right:-300px;top:-200px"></div>
    <div style="position:absolute;left:96px;top:0;bottom:0;width:720px;display:flex;flex-direction:column;justify-content:center">
      <div>${brand}</div>
      <h1 style="font-size:100px;margin-top:44px">${s.title}</h1>
      <p class="sub" style="font-size:38px;margin-top:30px;max-width:620px">${s.sub.replace('తెలుగు', '<span lang="te">తెలుగు</span>')}</p>
    </div>
    <div class="browser" style="left:${W - BW - 72}px;top:${(H - (BW * 800) / 1280 - 52) / 2}px;width:${BW}px">
      <div class="bar"><i></i><i></i><i></i><div class="url">${SITE.replace(/^https?:\/\//, '')}</div></div>
      <img src="${img}" alt="">
    </div>
  </body></html>`;
}

// ------------------------------------------------------------ render
async function render(browser, html, w, h, file) {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.setContent(html, { waitUntil: 'load' });
  // Status bar takes the colour of the app's top bar, with contrasting text.
  await p.evaluate(() => {
    const img = document.getElementById('app'), st = document.getElementById('status');
    if (!img || !st) return;
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = 4;
    const g = c.getContext('2d');
    const paint = (el, y) => {
      g.drawImage(img, 0, -y);
      const [r, gr, b] = g.getImageData(img.naturalWidth / 2, 1, 1, 1).data;
      el.style.background = `rgb(${r},${gr},${b})`;
      el.style.color = 0.299 * r + 0.587 * gr + 0.114 * b > 140 ? '#111' : '#f5f5f5';
    };
    paint(st, 1);
    paint(document.getElementById('gesture'), img.naturalHeight - 3);
  });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 88 });
  await p.close();
  console.log('wrote', file, Math.round(fs.statSync(path.join(OUT, file)).size / 1024) + ' KB');
}

(async () => {
  const browser = await chromium.launch();
  const phone = { ...devices['Pixel 7'], viewport: PHONE_VP, deviceScaleFactor: 3 };
  for (const s of PHONE) await render(browser, phoneSlide(s, await capture(browser, s.shot, phone)), 1080, 1920, s.file);
  const desk = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 };
  await render(browser, wideSlide(WIDE, await capture(browser, WIDE.shot, desk)), 1920, 1080, WIDE.file);
  await browser.close();
  console.log('\nmanifest "screenshots":\n' + JSON.stringify([
    ...PHONE.map((s) => ({ src: `assets/screens/${s.file}`, sizes: '1080x1920', type: 'image/jpeg', form_factor: 'narrow', label: s.label })),
    { src: `assets/screens/${WIDE.file}`, sizes: '1920x1080', type: 'image/jpeg', form_factor: 'wide', label: WIDE.label },
  ], null, 2));
})();
