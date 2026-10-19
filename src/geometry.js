const ClipperLib = globalThis.ClipperLib;

const SCALE = 10000;
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function measureContour(points, closed) {
  const vertices = points.map(p => ({ ...p }));
  if (closed && distance(vertices[0], vertices.at(-1)) > 1e-8) vertices.push({ ...vertices[0] });
  const cumulative = [0];
  for (let i = 1; i < vertices.length; i++) cumulative.push(cumulative.at(-1) + distance(vertices[i - 1], vertices[i]));
  return { points: vertices, cumulative, length: cumulative.at(-1), closed };
}

export function at(contour, d) {
  const { points, cumulative, length } = contour;
  d = Math.max(0, Math.min(length, d));
  let lo = 1, hi = cumulative.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (cumulative[mid] < d) lo = mid + 1; else hi = mid; }
  const span = cumulative[lo] - cumulative[lo - 1];
  const t = span ? (d - cumulative[lo - 1]) / span : 0;
  return { x: points[lo - 1].x + (points[lo].x - points[lo - 1].x) * t, y: points[lo - 1].y + (points[lo].y - points[lo - 1].y) * t };
}

function slice(contour, from, to) {
  return [at(contour, from), ...contour.points.filter((_, i) => contour.cumulative[i] > from + 1e-7 && contour.cumulative[i] < to - 1e-7), at(contour, to)];
}

export function generateStencil(contours, { channelWidth, tabWidth, tabCount, tabOffset }) {
  const ribbons = [], bridges = [], warnings = [];
  let reducedTabs = false;
  for (const contour of contours) {
    const { length, closed } = contour;
    if (length < 0.01) continue;
    // Short contours get fewer tabs so a cut interval always remains.
    const count = Math.min(tabCount, Math.max(1, Math.floor(length / (tabWidth + channelWidth * 2))));
    reducedTabs ||= count < tabCount;
    const gap = Math.min(tabWidth, length * 0.35 / count);
    const step = length / count;
    const centers = Array.from({ length: count }, (_, i) => closed
      ? ((i + 0.5 + tabOffset / 100) * step) % length
      : (i + 1) * length / (count + 1));
    const gaps = [];
    for (const center of centers) {
      const start = center - gap / 2, end = center + gap / 2;
      bridges.push({ point: at(contour, center), before: at(contour, Math.max(0, center - gap / 2)), after: at(contour, Math.min(length, center + gap / 2)), width: gap });
      if (start < 0 && closed) { gaps.push([0, end], [length + start, length]); }
      else if (end > length && closed) { gaps.push([start, length], [0, end - length]); }
      else gaps.push([Math.max(0, start), Math.min(length, end)]);
    }
    gaps.sort((a, b) => a[0] - b[0]);
    const intervals = [];
    let cursor = 0;
    for (const [start, end] of gaps) { if (start > cursor + 1e-7) intervals.push([cursor, start]); cursor = Math.max(cursor, end); }
    if (cursor < length - 1e-7) intervals.push([cursor, length]);
    let pieces = intervals.map(([from, to]) => slice(contour, from, to));
    if (closed && intervals.length > 1 && intervals[0][0] === 0 && intervals.at(-1)[1] === length) {
      const first = pieces.shift(), last = pieces.pop();
      pieces.push([...last, ...first.slice(1)]);
    }
    for (const points of pieces) {
      const offset = new ClipperLib.ClipperOffset(2, SCALE * 0.015);
      offset.AddPath(points.map(p => ({ X: Math.round(p.x * SCALE), Y: Math.round(p.y * SCALE) })), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etOpenButt);
      const solution = new ClipperLib.Paths();
      offset.Execute(solution, channelWidth / 2 * SCALE);
      ribbons.push(...solution);
    }
  }
  const clipper = new ClipperLib.Clipper();
  clipper.AddPaths(ribbons, ClipperLib.PolyType.ptSubject, true);
  const result = new ClipperLib.Paths();
  clipper.Execute(ClipperLib.ClipType.ctUnion, result, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  const paths = result.map(path => path.map(p => ({ x: p.X / SCALE, y: p.Y / SCALE })));
  if (reducedTabs) warnings.push('Some small contours have fewer or narrower tabs so there is room for the channel.');
  // Nearby outlines can cut across a bridge. Detect this rather than claiming every island is supported.
  const damaged = bridges.filter(b => result.some(poly => ClipperLib.Clipper.PointInPolygon({ X: Math.round(b.point.x * SCALE), Y: Math.round(b.point.y * SCALE) }, poly) !== 0));
  if (damaged.length) warnings.push(`${damaged.length} tab${damaged.length === 1 ? '' : 's'} intersect another channel. Try a narrower channel or change tab position; inspect before cutting.`);
  return { paths, bridges, warnings };
}

const num = n => Number(n.toFixed(4));
export function pathData(points, close = true) {
  return points.map((p, i) => `${i ? 'L' : 'M'}${num(p.x)} ${num(p.y)}`).join('') + (close ? 'Z' : '');
}

export function exportSvg(result, width, height, title = 'Stencil') {
  const safeTitle = title.replace(/[<>&"']/g, '');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${num(width)}mm" height="${num(height)}mm" viewBox="0 0 ${num(width)} ${num(height)}">\n<title>${safeTitle}</title>\n<desc>Closed cut paths for outline channels. Gaps between channels are retaining tabs. Black areas are removed; white material remains. No outer sheet cut is included.</desc>\n<path fill="#000000" fill-rule="evenodd" stroke="none" d="${result.paths.map(p => pathData(p)).join('')}"/>\n</svg>`;
}
