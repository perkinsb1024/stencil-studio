// Polygon operations use millimeters, independent of the SVG's source units.
const SCALE = 10000;
const same = (a, b) => a.x === b.x && a.y === b.y;
export function vertices(contour) {
  const points = contour.points.filter((p, i, all) => !i || !same(p, all[i - 1]));
  if (contour.closed && points.length > 1 && same(points[0], points.at(-1))) points.pop();
  return points;
}
export const nodeCount = contours => contours.reduce((n, c) => n + vertices(c).length, 0);

function distanceSquared(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = dx || dy ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))) : 0;
  return (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2;
}
function simplifyLine(points, tolerance) {
  if (points.length <= 2 || !tolerance) return points;
  const keep = new Set([0, points.length - 1]), stack = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    let max = tolerance ** 2, index = -1;
    for (let i = start + 1; i < end; i++) {
      const d = distanceSquared(points[i], points[start], points[end]);
      if (d > max) { max = d; index = i; }
    }
    if (index !== -1) { keep.add(index); stack.push([start, index], [index, end]); }
  }
  return points.filter((_, i) => keep.has(i));
}
function simplifyContour(contour, tolerance) {
  const points = vertices(contour);
  if (!contour.closed || points.length < 4 || !tolerance) return { ...contour, points: simplifyLine(points, tolerance) };
  // Split a ring across distant vertices so its seam cannot collapse the ring.
  let opposite = 1, farthest = 0;
  for (let i = 1; i < points.length; i++) {
    const d = distanceSquared(points[i], points[0], points[0]);
    if (d > farthest) { farthest = d; opposite = i; }
  }
  const reduced = [...simplifyLine(points.slice(0, opposite + 1), tolerance).slice(0, -1),
    ...simplifyLine([...points.slice(opposite), points[0]], tolerance).slice(0, -1)];
  return { ...contour, points: reduced.length >= 3 ? reduced : points };
}
function union(paths, fill) {
  const C = globalThis.ClipperLib, result = new C.Paths(), clipper = new C.Clipper();
  clipper.StrictlySimple = true;
  clipper.AddPaths(paths, C.PolyType.ptSubject, true);
  clipper.Execute(C.ClipType.ctUnion, result, fill, fill);
  return result;
}
function offset(paths, amount) {
  if (!paths.length) return [];
  const C = globalThis.ClipperLib, result = new C.Paths();
  const operation = new C.ClipperOffset(2, 0.01 * SCALE);
  operation.AddPaths(paths, C.JoinType.jtRound, C.EndType.etClosedPolygon);
  operation.Execute(result, amount * SCALE);
  return result;
}

export function simplifyArtwork(artwork, { width, smooth = 0, breakWidth = 0, tolerance = 0 }) {
  if (![width, smooth, breakWidth, tolerance].every(Number.isFinite) || width <= 0 || Math.min(smooth, breakWidth, tolerance) < 0) throw new Error('Simplification values must be nonnegative, with a positive artwork width.');
  const b = artwork.bounds, scale = width / (b.maxX - b.minX);
  let contours = artwork.contours.map(c => ({ closed: c.closed, points: vertices(c).map(p => ({ x: (p.x - b.minX) * scale, y: (p.y - b.minY) * scale })) }));
  const C = globalThis.ClipperLib;
  if (smooth || breakWidth) {
    let paths = contours.filter(c => c.closed).map(c => c.points.map(p => ({ X: Math.round(p.x * SCALE), Y: Math.round(p.y * SCALE) })));
    // Even/odd normalization preserves nested holes regardless of source winding.
    paths = union(paths, C.PolyFillType.pftEvenOdd);
    if (smooth) {
      // Close small notches, then round off small protrusions.
      paths = offset(offset(paths, smooth), -smooth);
      paths = offset(offset(paths, -smooth), smooth);
    }
    // Opening erodes thin necks before restoring the surviving shapes' size.
    if (breakWidth) paths = offset(offset(paths, -breakWidth / 2), breakWidth / 2);
    contours = [...paths.map(path => ({ closed: true, points: path.map(p => ({ x: p.X / SCALE, y: p.Y / SCALE })) })), ...contours.filter(c => !c.closed)];
  }
  contours = contours.map(c => simplifyContour(c, tolerance));
  // Normalize any crossings introduced by vertex reduction into valid rings.
  if (tolerance) {
    const paths = union(contours.filter(c => c.closed).map(c => c.points.map(p => ({ X: Math.round(p.x * SCALE), Y: Math.round(p.y * SCALE) }))), C.PolyFillType.pftEvenOdd);
    contours = [...paths.map(path => ({ closed: true, points: path.map(p => ({ x: p.X / SCALE, y: p.Y / SCALE })) })), ...contours.filter(c => !c.closed)];
  }
  contours = contours.filter(c => c.points.length >= (c.closed ? 3 : 2)).map((c, i) => ({ ...c, id: `outline-${i}`, points: c.points.map(p => ({ x: p.x / scale + b.minX, y: p.y / scale + b.minY })) }));
  if (contours.length > 500 || contours.some(c => c.points.length > 30000)) throw new Error('The result has too many layers or nodes. Try more node reduction or a smaller detail radius.');
  return { contours, bounds: { ...b }, warnings: artwork.warnings ?? [], description: artwork.description ?? '' };
}

export function simplifiedSvg(artwork, physicalWidth) {
  const b = artwork.bounds, num = n => Number(n.toFixed(6));
  const width = b.maxX - b.minX, height = b.maxY - b.minY;
  // Give a horizontal open path a small viewport instead of exporting an
  // invisible SVG with zero physical height. Its centerline stays unchanged.
  const frameHeight = physicalWidth && height === 0 ? width / physicalWidth * 0.1 : height;
  const frame = [0, height === 0 ? -frameHeight / 2 : 0, width, frameHeight].map(num).join(' ');
  const dimensions = physicalWidth ? ` width="${num(physicalWidth)}mm" height="${num(frameHeight / width * physicalWidth)}mm"` : '';
  const data = c => c.points.map((p, i) => `${i ? 'L' : 'M'}${num(p.x - b.minX)} ${num(p.y - b.minY)}`).join('');
  const closed = artwork.contours.filter(c => c.closed).map(c => data(c) + 'Z').join('');
  const open = artwork.contours.filter(c => !c.closed).map(c => `<path fill="none" stroke="black" d="${data(c)}"/>`).join('');
  const description = (artwork.description ?? '').replace(/[<>&"']/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[ch]);
  return `<svg xmlns="http://www.w3.org/2000/svg"${dimensions} viewBox="${frame}" data-stencil-frame="${frame}"><desc>${description}</desc><path fill="black" fill-rule="evenodd" d="${closed}"/>${open}</svg>`;
}
