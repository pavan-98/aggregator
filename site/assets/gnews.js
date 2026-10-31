// Shared by the browser app and the Node build scripts.
// Google News exposes free, key-less RSS for headlines, sections and searches,
// in many languages (including Telugu: hl=te, ceid=IN:te).

export const GN_LOCALE = {
  en: { hl: 'en-IN', gl: 'IN', ceid: 'IN:en' },
  te: { hl: 'te', gl: 'IN', ceid: 'IN:te' },
};

/**
 * @param {{top?:boolean, section?:string, q?:string, when?:string}} spec
 * @param {'en'|'te'} lang
 */
export function googleNewsUrl(spec, lang) {
  const loc = GN_LOCALE[lang] || GN_LOCALE.en;
  const qs = `hl=${loc.hl}&gl=${loc.gl}&ceid=${encodeURIComponent(loc.ceid)}`;
  if (!spec || spec.top) return `https://news.google.com/rss?${qs}`;
  if (spec.section) return `https://news.google.com/rss/headlines/section/topic/${spec.section}?${qs}`;
  const q = spec.q + (spec.when === '' ? '' : ` when:${spec.when || '2d'}`);
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${qs}`;
}
