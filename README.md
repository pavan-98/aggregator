# My News · నా వార్తలు

A personal, ad-free **news + gold-rate app** for phones. It works in **English and Telugu**, and **Visakhapatnam** is its home city.
It is a free static site on GitHub Pages and installs on iPhone and Android like a normal app. You need no API keys, no server and no paid plan.

| Tab | What's there |
|---|---|
| **Vizag** (home) | Today's Vizag gold rates (24K / 22K / 18K with change since yesterday), the silver rate, and Visakhapatnam news in English and Telugu |
| **News** | 14 topics: Visakhapatnam, Top stories, Telangana & AP, Hyderabad, India, World, Business, Gold & markets, Tech, Cricket, Sports, Cinema, Science, Health. Swipe left/right to switch topics. Hide or reorder topics, and add your own from keywords. |
| **Gold** | Rates for **every karat in Vizag** (24K, 23K, 22K, 20K, 18K, 14K, 9K) per gram and per 10 g. Also: 30-day, 90-day and 1-year trend, a jewellery bill calculator (making % + 3% GST), Vizag silver, the official **IBJA** benchmark (999/995/916/750/585 and platinum), live international spot price, and 13 cities to compare. |
| **Settings** | Install button, my city, app language, news language (English, Telugu or both), theme, hidden sources, backup/restore |

## Install on your phone

Open the site (`https://pavan-98.github.io/aggregator/`) once, then:

- **Android (Chrome, Edge, Samsung Internet):** tap the **Install app** banner. You can also use the ⋮ menu → *Install app* / *Add to Home screen*. It installs as a real app with its own icon, a splash screen, and long-press shortcuts to *Gold* and *News*.
- **iPhone / iPad:** open the link in **Safari** → tap **Share** → **Add to Home Screen**. (iOS only allows installing from Safari; the app shows these steps when needed.)

Once installed, it opens full screen and supports pull-to-refresh. It also **works offline**, showing the last news and rates it downloaded.

## One-time setup (about 5 minutes)

1. **Keep the repo private or make it public.** On **GitHub Pro**, Pages works from private repos. The *site* is still reachable by anyone who has the URL; only Enterprise Cloud can restrict that. The repo contains no secrets.
2. **Turn on Pages from Actions**: *Settings → Pages → Build and deployment → Source: **GitHub Actions***.
3. **Merge this branch into `main`.** Scheduled workflows only run from the default branch.
4. Run it once: *Actions → "Update news & gold, deploy to Pages" → Run workflow*.

## Why this stack: what GitHub Pages supports (checked Oct 2026)

| GitHub Pages fact | How the app handles it |
|---|---|
| **Static hosting only** (HTML/CSS/JS; no server code, no database) | All data is fetched ahead of time by a GitHub Actions job and published as small JSON files. The page is plain HTML/JS with no framework. |
| **Private repos need Pro/Team/Enterprise** (you have Pro ✓). The published site is public either way. | Works as-is from the private repo. |
| **Actions minutes:** public repos are free. Private repos on Pro include **$18/month of usage, about 3,000 Linux minutes** at $0.006/min, and partial minutes round up per job. | Update and deploy run as **one job**. The default schedule is every **30 min** in the Indian daytime and hourly overnight: 43 runs/day, about **1,300 min/month** (≤ 2,600 even if a run takes 2 min). If the Actions tab shows runs under 60 s, switch to every 15 min by changing `7,37` to `7,22,37,52` in the workflow (about 2,400 min/month). Check usage under *Settings → Billing*. |
| **Custom Actions workflows are exempt from the 10-builds/hour limit** | The workflow deploys at most 2–4 times an hour. |
| **Scheduled workflows: at most every 5 min, may be delayed under load, default branch only; in public repos, disabled after 60 days without activity** | Runs every 30 min by day (15 if you choose). A daily gold-history commit keeps the repo active in any case. |
| **Site ≤ 1 GB, deploy ≤ 10 min, ~100 GB/month bandwidth (soft)** | The site is about 2 MB; one build takes under a minute. |
| **HTTPS on `*.github.io`**, `.webmanifest` served as `application/manifest+json` | Required for installing (service worker + manifest), and both work. |
| **No custom HTTP headers; every file gets `Cache-Control: max-age=600`** | Data requests add a per-minute cache-buster. The service worker controls offline caching. Security policies are set with `<meta>` tags. |
| **No server-side proxy** | Browsers can't read Google News directly (CORS). The Live button uses public CORS proxies, or your own free Cloudflare Worker (below). |

Sources: [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits), [What is GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [Events that trigger workflows → schedule](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#schedule), [GitHub plans and Pages availability](https://docs.github.com/en/get-started/learning-about-github/githubs-plans), [no custom headers (GitHub community)](https://github.com/orgs/community/discussions/60087). The `max-age=600` header and the manifest MIME type were checked directly on live `*.github.io` sites.

## How it works

```
GitHub Actions (every 30 min by day, hourly at night)                                GitHub Pages
 ├─ scripts/fetch-news.mjs → data/news/<topic>.<en|te>.json ─┐
 ├─ scripts/fetch-gold.mjs → data/gold.json                  ├─► index.html + assets/*.js  (installable PWA)
 │                         → data/gold-history.json (committed daily)  │   ├─ sw.js: offline cache
 └─ actions/deploy-pages                                     ┘   ├─ Live news: Google News via CORS proxy
                                                                     └─ Live spot: api.gold-api.com every 60 s (Gold tab)
```

- The code has no dependencies: Node 20+ scripts and plain JS. There is no `npm install` and no bundler.
- News data is rebuilt on each run and is **not** committed. Only `data/gold-history.json` is committed, once a day, so the gold chart keeps growing.
- The service worker is stamped with a hash of the app files. Phones download a new app version only when the app itself changes, not on every scheduled data refresh.
- Every source is optional. If one fails, the others still work, and city gold rates fall back to a second site.

### Run locally

```bash
node scripts/build.mjs                       # fetch everything into _site/
python3 -m http.server 8080 -d _site         # open http://localhost:8080
node scripts/fetch-gold.mjs --backfill 365   # (re)fill a year of spot-price history
node scripts/make-icons.cjs                  # regenerate PNG app icons (needs Playwright)
```

### Customize

- **Topics and feeds**: edit [`config/topics.json`](config/topics.json).
  - Google News spec per language: `{ "top": true }`, `{ "section": "WORLD" }` or `{ "q": "words", "when": "2d" }`.
  - Publisher RSS feeds can take `"match"`, a regex that keeps only matching stories. This is how statewide Telugu feeds are filtered down to Visakhapatnam stories. `"max"` sets how many items to read from a feed.
  - A topic with `"city"` becomes the Home feed for that city.
- **Gold cities**: edit [`config/gold.json`](config/gold.json). It accepts any of the ~300 Groww city slugs. The first city is the default.
- **Custom topics** added in the app are stored on the phone and fetched live.

### Optional: your own CORS proxy (faster, more reliable Live button)

1. Create a free Cloudflare account and open *Workers & Pages → Create → Worker*.
2. Paste in [`worker/cors-proxy.js`](worker/cors-proxy.js) and deploy. It only allows Google News and the gold APIs.
3. Paste the worker URL into *Settings → Own CORS proxy*.

The free plan allows 100,000 requests per day.

## Data sources (all free, no keys, tested Oct 2026)

### Gold & silver

| Source | Used for | Notes |
|---|---|---|
| **groww.in** gold page | **Primary city rates**: 24K / 22K / 18K for ~300 Indian cities, including Visakhapatnam, plus 10 days of history | One request returns every city, read from the page's embedded JSON. |
| **groww.in** silver page | Silver per gram, per city | |
| **ibjarates.com** (India Bullion & Jewellers Association) | Official national benchmark: **999 / 995 / 916 / 750 / 585** gold, silver 999, platinum; morning and evening sessions, plus ~4 months of history | The reference rate used across the Indian bullion trade. |
| **api.gold-api.com** | Real-time international XAU / XAG in USD and INR | CORS-enabled, so the app also polls it live. |
| **fawazahmed0/exchange-api** (jsDelivr) | Spot fallback, plus daily spot history back to 2024 | |
| **goodreturns.in** | **Backup city rates** (24K/22K/18K plus a 10-day table) | Used automatically when Groww fails, misses a city, or returns a stale date. It sometimes throttles a machine that fetches repeatedly, so it isn't the primary source. Test the fallback with `SIMULATE_GROWW_DOWN=1 node scripts/fetch-gold.mjs`. |

**All karats.** Cities publish 24K, 22K and 18K. **23K, 20K, 14K and 9K** (the other BIS hallmark grades) are calculated as 24K × karat/24, which is how jewellers' rate cards derive them. They are marked *calc.* in the app. All rates exclude GST (3%), TCS and making charges; use the calculator in the app for an estimated bill.

**Estimated chart points.** Retail history only goes back as far as the sources publish it. For older days, the chart estimates from the international price × the local premium on the nearest real day, and draws those points dashed.

### News

| Source | Used for |
|---|---|
| **Google News RSS**, English (`hl=en-IN`) and Telugu (`hl=te&ceid=IN:te`) | The backbone of every topic. For Visakhapatnam it searches *Visakhapatnam OR Vizag* and *విశాఖపట్నం OR విశాఖ OR వైజాగ్*, which brings in Eenadu, Sakshi, Andhra Jyothy, The Hindu, TOI, Hans India, Yo Vizag, Hello Vizag and more. |
| Andhra Jyothy, TV9 Telugu (AP), NTV Telugu (AP), Asianet Telugu (AP) | Vizag topic, filtered to Visakhapatnam stories |
| Vizag Vision | Vizag topic (local English) |
| TV9 Telugu, NTV, V6 Velugu, 10TV, Oneindia Telugu, Asianet Telugu | Telangana & AP |
| Telangana Today, Deccan Chronicle, NDTV | English topics |
| rss2json.com, allorigins.win, codetabs.com | In-browser Live fetch (public CORS proxies, raced in parallel) |

Evaluated and **not used**:

- **NewsAPI.org**: browser use is blocked on the free plan.
- **GNews, NewsData.io, Mediastack, Currents, TheNewsAPI**: each needs a key and has a tiny quota, and a key would leak in a public site.
- **GDELT**: limited to one request every 5 seconds, with no CORS.
- **goldapi.io, metals.dev, metalpriceapi**: each needs a key and allows about 100 requests a month.
- **The Hindu, BBC Telugu, Sakshi and Mint direct RSS feeds**: they block automated fetchers. Their stories still arrive through Google News.

## Etiquette

This is a personal reader. The fetchers identify themselves honestly in their User-Agent, run at most every 15 minutes, and never try to get around a site that blocks them. Headlines link to the original publishers. Gold figures are indicative; confirm with your jeweller before buying.
