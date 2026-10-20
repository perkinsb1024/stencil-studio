import { resolveTabs } from './tab-layout.js';
import { channelWidthAt, createChannelWidthProfile } from './regions.js';
import { channelPaths } from './variable-channel.js';
import { composeMaterial, materialMode } from './material-geometry.js';

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

export function generateStencil(contours, options) {
  const materialFeatures = options.sheet && (Object.values(options.materialTreatments ?? {}).some(mode => mode !== 'outline') || options.regionBridges?.length || options.analyzeMaterial);
  const { tabCount, tabLayouts = {} } = options;
  const hidden = new Set(options.hiddenContours ?? []);
  const cutaways = new Set(options.cutawayContours ?? []);
  const ribbons = [], bridges = [], warnings = [];
  let reducedTabs = false, hasCutaways = false;
  for (const [index, contour] of contours.entries()) {
    const contourId = contour.id ?? `outline-${index}`;
    if (hidden.has(contourId)) continue;
    if (materialFeatures && materialMode(contour, options) !== 'outline') continue;
    const { length, closed } = contour;
    if (length < 0.01) continue;
    if (closed && cutaways.has(contourId)) {
      // Remove the enclosed area at the original boundary, without an offset
      // or retaining gaps. Normalize winding before unioning cuts.
      const polygon = contour.points.slice(0, -1).map(p => ({ X: Math.round(p.x * SCALE), Y: Math.round(p.y * SCALE) }));
      if (!ClipperLib.Clipper.Orientation(polygon)) polygon.reverse();
      ribbons.push(polygon);
      hasCutaways = true;
      continue;
    }
    const layout = tabLayouts[contourId];
    const tabs = resolveTabs(contour, options, layout);
    if (!layout) reducedTabs ||= tabs.length < tabCount || tabs.some(t => t.width < t.requestedWidth - 1e-7);
    else {
      if (!tabs.length && closed) warnings.push(`Layer ${index + 1} has no tabs; its inner piece may come loose.`);
      for (const tab of tabs) if (tab.width < tab.requestedWidth - 1e-7) {
        warnings.push(`Layer ${index + 1}: a requested ${tab.requestedWidth.toFixed(1)} mm tab is ${tab.width.toFixed(1)} mm to fit the layer.`);
      }
    }
    const gaps = [];
    for (const tab of tabs) {
      const { center, gapWidth: gap } = tab;
      const start = center - gap / 2, end = center + gap / 2;
      let segments;
      if (start < 0 && closed) segments = [[length + start, length], [0, end]];
      else if (end > length && closed) segments = [[start, length], [0, end - length]];
      else segments = [[Math.max(0, start), Math.min(length, end)]];
      gaps.push(...segments);
      bridges.push({ ...tab, contourId, point: at(contour, center), before: at(contour, segments[0][0]), after: at(contour, segments.at(-1)[1]), segments: segments.map(([from, to]) => slice(contour, from, to)) });
    }
    // Report overlaps, including across a closed path's seam.
    if (tabs.some((a, i) => tabs.slice(i + 1).some(b => {
      const delta = Math.abs(a.center - b.center);
      return (closed ? Math.min(delta, length - delta) : delta) < (a.gapWidth + b.gapWidth) / 2 - 1e-7;
    }))) warnings.push(`Layer ${index + 1} has overlapping tabs; move or remove a tab to separate them.`);
    gaps.sort((a, b) => a[0] - b[0]);
    const intervals = [];
    let cursor = 0;
    for (const [start, end] of gaps) { if (start > cursor + 1e-7) intervals.push([cursor, start]); cursor = Math.max(cursor, end); }
    if (cursor < length - 1e-7) intervals.push([cursor, length]);
    let pieces = intervals.map(([from, to]) => ({ points: slice(contour, from, to), start: closed || from > 0, end: closed || to < length }));
    if (closed && intervals.length > 1 && intervals[0][0] === 0 && intervals.at(-1)[1] === length) {
      const first = pieces.shift(), last = pieces.pop();
      pieces.push({ points: [...last.points, ...first.points.slice(1)], start: last.start, end: first.end });
    }
    const profile = createChannelWidthProfile(contourId, options);
    for (const piece of pieces) ribbons.push(...channelPaths(piece.points, closed && !tabs.length, profile, options.roundedTabs ? piece : {}, options.roundedChannelCorners !== false));
  }
  const clipper = new ClipperLib.Clipper();
  clipper.AddPaths(ribbons, ClipperLib.PolyType.ptSubject, true);
  const result = new ClipperLib.Paths();
  clipper.Execute(ClipperLib.ClipType.ctUnion, result, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  let paths = result.map(path => path.map(p => ({ x: p.X / SCALE, y: p.Y / SCALE })));
  const material = materialFeatures ? composeMaterial(contours, paths, options) : null;
  if (material) { paths = material.paths; warnings.push(...material.warnings); }
  if (reducedTabs) warnings.push('Some small contours have fewer or narrower tabs so there is room for the channel.');
  // Nearby outlines can cut across a bridge. Detect this rather than claiming every island is supported.
  const damaged = bridges.filter(b => {
    const point = { X: Math.round(b.point.x * SCALE), Y: Math.round(b.point.y * SCALE) };
    const locations = paths.map(poly => ClipperLib.Clipper.PointInPolygon(point, poly.map(p => ({ X: Math.round(p.x * SCALE), Y: Math.round(p.y * SCALE) }))));
    return locations.includes(-1) || locations.filter(location => location === 1).length % 2 === 1;
  });
  if (damaged.length) warnings.push(`${damaged.length} tab${damaged.length === 1 ? '' : 's'} intersect another channel${hasCutaways ? ' or full cut-away' : ''}. Try a narrower channel or change tab position; inspect before cutting.`);
  for (const bridge of bridges) bridge.channelWidth = channelWidthAt(bridge.point, bridge.contourId, options);
  return { ...material, paths, channelCuts: result.map(path => path.map(p => ({ x: p.X / SCALE, y: p.Y / SCALE }))), bridges, warnings };
}

const num = n => Number(n.toFixed(4));
export function pathData(points, close = true) {
  return points.map((p, i) => `${i ? 'L' : 'M'}${num(p.x)} ${num(p.y)}`).join('') + (close ? 'Z' : '');
}

export function exportSvg(result, width, height, title = 'Stencil') {
  const safeTitle = title.replace(/[<>&"']/g, '');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${num(width)}mm" height="${num(height)}mm" viewBox="0 0 ${num(width)} ${num(height)}">\n<title>${safeTitle}</title>\n<desc>Closed cut paths for outline channels and resolved Keep/Cut Away regions. Retaining tabs and connecting bridges leave material intact. Black areas are removed; white material remains. No outer sheet cut is included.</desc>\n<path fill="#000000" fill-rule="evenodd" stroke="none" d="${result.paths.map(p => pathData(p)).join('')}"/>\n</svg>`;
}
