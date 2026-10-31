# My News · నా వార్తలు

A personal, ad-free news dashboard in **English and Telugu**, with a **gold-rate tracker**.
It runs entirely on free services: GitHub Actions fetches the data and GitHub Pages hosts the site.
You need no API keys, no server and no paid plan.

- **Topics**: Top stories, Telangana & AP, Hyderabad, India, World, Business, Gold & markets, Tech, Cricket, Sports, Cinema, Science, Health. You can switch between them with the tabs or the ← → keys. You can hide or reorder them, and add your own topics from keywords (for example `ISRO OR ఇస్రో`).
- **Languages**: the interface can be English or Telugu. The news can follow the interface language, or be English only, Telugu only, or **both mixed**.
- **News freshness**: GitHub Actions rebuilds every topic about every 15 minutes. The **Live** button fetches the newest headlines straight from Google News in your browser, right now.
- **Gold**: 24K / 22K / 18K rates per gram for Hyderabad, Vijayawada, Visakhapatnam, Chennai, Bengaluru, Mumbai and Delhi, with the change since yesterday. It has a 30-day, 90-day and 1-year chart (or table), the international spot price (refreshed every 60 s while the page is open), silver, USD/INR, and a live retail estimate.
- **Other features**: hide a source with ⊘, filter within a topic, light and dark themes, installable on your phone (PWA), and export/import of your settings to move them between devices.

## Setup (one time, about 5 minutes)

1. **Make the repository public.** GitHub Pages is only free for public repos. Public repos also get unlimited free Actions minutes; a private repo would run out of its 2,000 free minutes with the 15-minute schedule. The repo contains no secrets.
   *Settings → General → Danger zone → Change visibility → Public.*
2. **Turn on Pages from Actions**: *Settings → Pages → Build and deployment → Source: **GitHub Actions***.
3. **Merge this branch into `main`.** Scheduled workflows only run from the default branch.
4. Run it once: *Actions → "Update news & gold, deploy to Pages" → Run workflow*.
5. Open **https://pavan-98.github.io/aggregator/**. On your phone, use "Add to Home Screen" to install it like an app.

GitHub turns off scheduled workflows in repos with no activity for 60 days. The daily gold-history commit counts as activity, so the schedule stays on.

### Optional: your own CORS proxy (recommended for the Live button)

Browsers block a page from reading Google News directly (CORS). The Live button and custom topics therefore go through a proxy. By default it races several free public proxies (rss2json, allorigins, codetabs) and uses the first that answers. Public proxies are flaky, and rss2json only returns 10 items per feed. For a fast and reliable Live button:

1. Create a free Cloudflare account and open *Workers & Pages → Create → Worker*.
2. Paste in [`worker/cors-proxy.js`](worker/cors-proxy.js) and deploy. It only allows Google News and the gold APIs, so it is not an open proxy.
3. In the dashboard, open *Settings → Own CORS proxy* and paste the worker URL.

The free plan allows 100,000 requests per day, far more than you will use.

## How it works

```
GitHub Actions (cron, every ~15 min)                      GitHub Pages (static)
 ├─ scripts/fetch-news.mjs  → _site/data/news/<topic>.<en|te>.json ─┐
 ├─ scripts/fetch-gold.mjs  → _site/data/gold.json                  ├─► index.html + assets/app.js
 │                          → data/gold-history.json (committed daily)┘      │
 └─ deploy-pages                                                              ├─ Live: Google News RSS via CORS proxy
                                                                              └─ Live spot: api.gold-api.com (every 60 s)
```

- The code has no dependencies: Node 20+ scripts and plain HTML, CSS and JS. There is no npm install and no bundler.
- News data is rebuilt on each run and is **not** committed, which keeps the git history clean. Only `data/gold-history.json` is committed, once a day, so the gold chart keeps growing.
- Every source is optional. If a feed or a gold site fails, the rest still works: retail gold falls back to a second site, and spot gold falls back to a second API.

### Run locally

```bash
node scripts/build.mjs                    # fetch everything into _site/
python3 -m http.server 8080 -d _site      # open http://localhost:8080
node scripts/fetch-gold.mjs --backfill 365  # (re)fill a year of spot-price history
```

### Customize

- **Built-in topics and feeds**: edit [`config/topics.json`](config/topics.json). A topic can have:
  - a Google News spec per language: `{ "top": true }`, `{ "section": "WORLD" }` or `{ "q": "search words", "when": "2d" }`
  - extra publisher RSS feeds per language.
- **Gold cities**: edit [`config/gold.json`](config/gold.json). Use the city slugs from goodreturns.in and policybazaar.com.
- **Custom topics** added in the UI are stored in your browser and fetched live. To have one pre-built every 15 minutes like the built-in topics, add it to `topics.json`.

## Data sources: what was tested and why these were chosen

Each source below was tested on 31 Oct 2026. They are all free and need no account.

### News

| Source | Used for | Notes |
|---|---|---|
| **Google News RSS** `news.google.com/rss` | Backbone of every topic, in English (`hl=en-IN`) and Telugu (`hl=te&ceid=IN:te`) | Headlines, sections (WORLD, NATION, BUSINESS, TECHNOLOGY, ENTERTAINMENT, SPORTS, SCIENCE, HEALTH) and full search with `when:1d`. Covers thousands of publishers, including Eenadu, Andhra Jyothy, Sakshi and HMTV. No key and no hard rate limit. No CORS, so the browser reaches it through a proxy. |
| TV9 Telugu, NTV Telugu, V6 Velugu, 10TV, Oneindia Telugu, Asianet Telugu | Telugu States topic | Publisher RSS, includes images. |
| Telangana Today, Deccan Chronicle | Telangana & AP (English) | Publisher RSS. |
| NDTV (feedburner) | Top stories (English) | Publisher RSS with images and summaries. |
| rss2json.com, allorigins.win, codetabs.com | Browser-side Live fetch | Free public CORS proxies; flaky, so they are raced in parallel. |

Also evaluated and **not used**:

- **NewsAPI.org**: its free plan is for development only and blocks browser requests from real domains.
- **GNews, NewsData.io, Mediastack, Currents, TheNewsAPI, World News API**: each needs an API key and has a small daily or monthly quota. That is not enough for 13 topics × 2 languages every 15 minutes, and a key in a public static site would leak.
- **GDELT DOC API**: free and multilingual, but limited to one request every 5 seconds and has no CORS.
- **BBC Telugu, Sakshi, The Hindu, BBC World, Mint**: their RSS feeds return 403 to automated fetchers. Their stories still arrive through Google News.

### Gold and silver

| Source | Used for | Notes |
|---|---|---|
| **api.gold-api.com** | Real-time spot XAU/XAG in USD and INR | No key, CORS-enabled, so the browser also polls it live. |
| **fawazahmed0/exchange-api** (jsDelivr + Cloudflare mirror) | Spot fallback and **daily history** back to 2024 | No key and no limits. Date-tagged URLs make backfill possible. |
| **goodreturns.in** city pages | Retail 24K/22K/18K per gram, plus a 10-day table | Indicative retail rates, without GST, TCS or making charges. |
| **policybazaar.com** city pages | Retail fallback | 24K/22K. |

Also evaluated and **not used**: goldapi.io, metals.dev, metalpriceapi.com and Metals-API. They need keys and have about 100 requests per month on their free plans. frankfurter.app has no XAU.

**About the "estimated" values.** Indian retail prices sit well above the international spot price, because of import duty and other charges. The premium is currently about 17%. The app measures this premium each day from the real city rates. For days with no published city rate, the chart multiplies spot by the premium from the nearest real day and draws a dashed line. The "Live estimate now" figure uses the same method with the current spot price.

## Legal / etiquette

This is a personal reader. Headlines link to the original publishers. Nothing is republished beyond the title, a short snippet and a thumbnail, as RSS readers do. The fetcher identifies itself honestly in its User-Agent. Gold figures are indicative only; confirm with your jeweller before buying.
