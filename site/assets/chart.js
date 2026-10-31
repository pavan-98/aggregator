// Tiny dependency-free SVG line chart with crosshair + tooltip.
// points: [{ d: 'YYYY-MM-DD', v: number, est?: boolean }] sorted by date.

const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}) => {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

function niceTicks(min, max, count = 3) {
  const span = max - min || Math.abs(max) || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || step0;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v);
  return { lo, hi, ticks };
}

export function renderChart(container, points, { fmtV, fmtVShort = fmtV, fmtD, estLabel = 'est.' }) {
  container.replaceChildren();
  if (points.length < 2) return;
  const W = Math.max(container.clientWidth, 200);
  const H = container.clientHeight || 150;
  const pad = { l: 44, r: 8, t: 10, b: 20 };
  const vals = points.map((p) => p.v);
  const { lo, hi, ticks } = niceTicks(Math.min(...vals), Math.max(...vals), 3);
  const t0 = Date.parse(points[0].d);
  const t1 = Date.parse(points.at(-1).d);
  const x = (p) => pad.l + ((Date.parse(p.d) - t0) / (t1 - t0 || 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });
  // grid + y labels
  for (const tv of ticks) {
    const yy = y(tv);
    svg.append(el('line', { class: 'grid', x1: pad.l, x2: W - pad.r, y1: yy, y2: yy }));
    const lab = el('text', { class: 'axis-label', x: pad.l - 6, y: yy + 3.5, 'text-anchor': 'end' });
    lab.textContent = fmtVShort(tv);
    svg.append(lab);
  }
  // x labels: first, middle, last
  [0, Math.floor(points.length / 2), points.length - 1].forEach((i, k) => {
    const lab = el('text', {
      class: 'axis-label', x: x(points[i]), y: H - 4,
      'text-anchor': k === 0 ? 'start' : k === 2 ? 'end' : 'middle',
    });
    lab.textContent = fmtD(points[i].d, true);
    svg.append(lab);
  });

  // area under full series
  const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  svg.append(el('path', { class: 'area', d: `${path(points)}L${x(points.at(-1))},${y(lo)}L${x(points[0])},${y(lo)}Z` }));

  // split into runs of estimated / real (sharing endpoints so the line is continuous)
  // segment i joins points[i-1]→points[i]; it is "estimated" if either end is.
  const segEst = (i) => !!(points[i].est || points[i - 1].est);
  let start = 0;
  let cur = segEst(1);
  for (let i = 2; i <= points.length; i++) {
    const e = i < points.length ? segEst(i) : null;
    if (e !== cur) {
      svg.append(el('path', { class: `line${cur ? ' est' : ''}`, d: path(points.slice(start, i)) }));
      start = i - 1;
      cur = e;
    }
  }

  const cross = el('line', { class: 'cross', y1: pad.t, y2: H - pad.b, visibility: 'hidden' });
  const dot = el('circle', { class: 'dot', r: 4.5, visibility: 'hidden' });
  const last = points.at(-1);
  const endDot = el('circle', { class: 'dot', r: 4, cx: x(last), cy: y(last.v) });
  svg.append(cross, endDot, dot);
  container.append(svg);

  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  container.append(tip);

  const show = (clientX) => {
    const r = svg.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(points[i]) - px) < Math.abs(x(points[best]) - px)) best = i;
    const p = points[best];
    const cx = x(p);
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', cx); dot.setAttribute('cy', y(p.v)); dot.setAttribute('visibility', 'visible');
    tip.replaceChildren();
    const strong = document.createElement('strong');
    strong.textContent = fmtV(p.v);
    const d = document.createElement('div');
    d.textContent = fmtD(p.d) + (p.est ? ` · ${estLabel}` : '');
    if (p.est) d.className = 'tip-est';
    tip.append(strong, d);
    tip.hidden = false;
    const left = (cx / W) * r.width;
    const half = tip.offsetWidth / 2;
    tip.style.left = `${Math.min(Math.max(left, half), r.width - half)}px`;
    tip.style.top = `${Math.max(0, (y(p.v) / H) * r.height - tip.offsetHeight - 10)}px`;
  };
  const hide = () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); };
  svg.addEventListener('pointermove', (e) => show(e.clientX));
  svg.addEventListener('pointerdown', (e) => show(e.clientX));
  svg.addEventListener('pointerleave', hide);
  svg.setAttribute('tabindex', '0');
  let ki = points.length - 1;
  svg.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    e.stopPropagation();
    ki = Math.max(0, Math.min(points.length - 1, ki + (e.key === 'ArrowLeft' ? -1 : 1)));
    const r = svg.getBoundingClientRect();
    show(r.left + (x(points[ki]) / W) * r.width);
  });
  svg.addEventListener('blur', hide);
}
