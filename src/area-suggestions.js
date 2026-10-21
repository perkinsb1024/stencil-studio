import { generateStencil, measureContour } from './geometry.js';

const SCALE = 10000;
const labels = { outline: 'Outline', keep: 'Keep', cut: 'Cut Away', hidden: 'Hidden' };
export const treatmentLabel = mode => labels[mode] ?? mode;
// Physical support concerns do not change the inferred layer type.
export const isAutomaticSuggestion = suggestion => suggestion.confidence === 'high' || ['keep', 'cut'].includes(suggestion.mode) && suggestion.confidence === 'medium';
export const suggestionDefaults = () => ({ areaSuggestions: null, areaOverrides: {} });

// Use the same integer polygons and fill rules as the material compositor.
function polygons(subject, clip = [], operation = 'ctUnion', fill = 'nonzero') {
  const C = globalThis.ClipperLib, engine = new C.Clipper(), result = new C.Paths();
  engine.StrictlySimple = true;
  engine.AddPaths(subject, C.PolyType.ptSubject, true);
  engine.AddPaths(clip, C.PolyType.ptClip, true);
  const rule = fill === 'evenodd' ? C.PolyFillType.pftEvenOdd : C.PolyFillType.pftNonZero;
  engine.Execute(C.ClipType[operation], result, rule, rule);
  return result;
}
const area = paths => Math.abs(paths.reduce((sum, p) => sum + globalThis.ClipperLib.Clipper.Area(p), 0)) / SCALE ** 2;
const opaque = r => r.fill?.type === 'solid' && r.fill.alpha >= 0.999 && r.opacity >= 0.999 && (!r.blendMode || r.blendMode === 'normal');
const stroked = r => r.stroke && (r.stroke.alpha ?? 1) > 0 && r.strokeWidth > 0;
const white = r => r.fill?.rgb?.every(c => c >= 0.98);
const samePaint = (a, b) => a.fill?.color === b.fill?.color;
const intersectsBounds = (a, b) => a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
function bounds(contours) {
  const points = contours.flatMap(c => c.points);
  return points.reduce((b, p) => ({ minX: Math.min(b.minX, p.x), minY: Math.min(b.minY, p.y), maxX: Math.max(b.maxX, p.x), maxY: Math.max(b.maxY, p.y) }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}
function boundaryKey(contours) {
  return contours.map(c => {
    const points = c.points.map(p => `${Math.round(p.x * SCALE)},${Math.round(p.y * SCALE)}`);
    if (points[0] === points.at(-1)) points.pop();
    const canonical = values => {
      let start = 0;
      for (let i = 1; i < values.length; i++) if (values[i] < values[start]) start = i;
      return [...values.slice(start), ...values.slice(0, start)].join(';');
    };
    return [canonical(points), canonical([...points].reverse())].sort()[0];
  }).sort().join('|');
}

export function suggestAreas(artwork, settings) {
  settings = { artworkWidth: 150, channelWidth: 1.5, tabWidth: 3, tabCount: 4, tabOffset: 0, ...settings };
  const width = settings.artworkWidth, padding = settings.padding ?? Math.max(settings.margin ?? 8, settings.channelWidth / 2 + 2);
  const scale = width / (artwork.bounds.maxX - artwork.bounds.minX);
  const contours = artwork.contours.map(c => ({ ...c, ...measureContour(c.points.map(p => ({ x: (p.x - artwork.bounds.minX) * scale + padding, y: (p.y - artwork.bounds.minY) * scale + padding })), c.closed) }));
  const sheet = { width: width + padding * 2, height: (artwork.bounds.maxY - artwork.bounds.minY) * scale + padding * 2 };
  const regions = (artwork.sourceRegions ?? []).map((r, index) => {
    const members = contours.filter(c => c.regionId === r.id);
    const paths = polygons(members.filter(c => c.closed).map(c => c.points.map(p => ({ X: Math.round(p.x * SCALE), Y: Math.round(p.y * SCALE) }))), [], 'ctUnion', r.fillRule);
    return { ...r, drawingOrder: r.drawingOrder ?? index, members, paths, bounds: bounds(members), area: area(paths), boundary: boundaryKey(members), overlaps: [] };
  });
  for (let i = 0; i < regions.length; i++) for (let j = i + 1; j < regions.length; j++) {
    const a = regions[i], b = regions[j];
    if (!intersectsBounds(a.bounds, b.bounds)) continue;
    const shared = area(polygons(a.paths, b.paths, 'ctIntersection'));
    // A stroke/open detail can matter even though it has no filled area.
    if (shared > 0.00001 || !a.paths.length || !b.paths.length) {
      a.overlaps.push({ id: b.id, area: shared }); b.overlaps.push({ id: a.id, area: shared });
    }
  }
  const byRegion = {}, lookup = new Map(regions.map(r => [r.id, r]));
  for (const r of regions) {
    let mode = 'outline', confidence = 'low', reason = 'The intended material is unclear. Choose Keep or Cut Away, or leave an Outline channel.';
    const overlaps = r.overlaps.map(o => lookup.get(o.id));
    let visible = r.paths;
    for (const other of overlaps) if (other.drawingOrder > r.drawingOrder && opaque(other)) visible = polygons(visible, other.paths, 'ctDifference');
    const visibleArea = area(visible);
    const duplicate = regions.find(other => other.drawingOrder > r.drawingOrder && opaque(r) && opaque(other) && !stroked(r) && !stroked(other) && samePaint(r, other) && r.boundary === other.boundary && !overlaps.some(m => m.drawingOrder > r.drawingOrder && m.drawingOrder < other.drawingOrder));
    if (r.members.some(c => !c.closed)) {
      confidence = 'high'; reason = 'Open paths need an Outline channel.';
    } else if (duplicate) {
      mode = 'hidden'; confidence = 'high'; reason = `Equivalent duplicate boundary of Layer ${duplicate.drawingOrder + 1}.`;
    } else if (stroked(r) || !r.fill) {
      confidence = 'high'; reason = 'Stroke-based detail is preserved as an Outline channel.';
    } else if (!opaque(r)) {
      reason = 'Transparency, gradients or blending make the intended material uncertain.';
    } else if (!r.area) {
      reason = 'This boundary does not enclose a filled area.';
    } else if (white(r)) {
      const below = overlaps.filter(m => m.drawingOrder < r.drawingOrder && opaque(m) && !white(m) && !stroked(m));
      if (below.length && overlaps.every(m => below.includes(m) || white(m) && opaque(m) && !stroked(m))) {
        mode = 'keep'; confidence = 'high'; reason = 'Opaque white detail overlaps a filled opening; Keep preserves that detail.';
      } else reason = 'White fill alone does not establish retained material. Choose its treatment.';
    } else {
      const meaningful = overlaps.filter(m => !(opaque(m) && !stroked(m) && white(m) && m.drawingOrder > r.drawingOrder && (!settings.areaOverrides?.[m.id] || settings.materialTreatments?.[m.id] === 'keep')) && !(opaque(m) && !stroked(m) && samePaint(r, m) && r.boundary === m.boundary));
      if (!meaningful.length) {
        mode = 'cut'; confidence = 'high'; reason = r.members.length > 1 ? 'A closed opaque compound fill; its original fill rule preserves the holes.' : 'A closed opaque fill with no conflicting interior detail.';
      } else reason = 'Nested or overlapping artwork may contain meaningful detail. Outline preserves its boundaries.';
    }
    if (mode === 'outline' && confidence === 'low' && opaque(r) && !stroked(r) && r.area > 0 && visibleArea < 0.00001) {
      mode = 'hidden'; confidence = 'medium'; reason = 'Fully covered by later opaque artwork. Review before hiding this potentially intentional boundary.';
    }
    const perimeter = r.members.reduce((sum, c) => sum + c.length, 0);
    const minimum = settings.minimumMaterialWidth ?? 0.5;
    if (mode === 'cut' && r.area) {
      const offset = new globalThis.ClipperLib.ClipperOffset(2, 0.01 * SCALE), inset = new globalThis.ClipperLib.Paths();
      offset.AddPaths(r.paths, globalThis.ClipperLib.JoinType.jtRound, globalThis.ClipperLib.EndType.etClosedPolygon);
      offset.Execute(inset, -minimum / 2 * SCALE);
      if (!inset.length) { confidence = 'medium'; reason += ` This feature is narrower than ${minimum.toFixed(1)} mm; review at the selected size.`; }
    }
    byRegion[r.id] = { mode, confidence, reason, area: r.area, visibleArea, perimeter, overlaps: r.overlaps.map(o => o.id) };
  }
  // A Keep suggestion is only meaningful if its underlying fill is also a cut.
  for (const r of regions) {
    const s = byRegion[r.id];
    if (s.mode !== 'keep') continue;
    const below = r.overlaps.filter(o => lookup.get(o.id).drawingOrder < r.drawingOrder);
    const cutMode = id => settings.areaOverrides?.[id] ? settings.materialTreatments?.[id] : byRegion[id].mode;
    if (!below.some(o => cutMode(o.id) === 'cut')) {
      s.mode = 'outline'; s.confidence = 'low'; s.reason = 'The surrounding opening is ambiguous. Choose that opening before assigning Keep.';
    } else if (!below.some(o => cutMode(o.id) === 'cut' && (settings.areaOverrides?.[o.id] || byRegion[o.id].confidence === 'high'))) {
      s.confidence = 'medium'; s.reason += ' Its surrounding opening also needs review.';
    }
  }
  const suggestions = { version: 1, artworkWidth: width, byRegion, warnings: [] };
  const proposed = { materialTreatments: { ...settings.materialTreatments }, hiddenContours: [...(settings.hiddenContours ?? [])], cutawayContours: [...(settings.cutawayContours ?? [])], areaOverrides: settings.areaOverrides };
  applyAreaSuggestions(proposed, artwork, suggestions);
  const result = generateStencil(contours, { ...settings, ...proposed, regionBridges: settings.regionBridges ?? [], sheet, analyzeMaterial: true });
  suggestions.warnings = result.warnings;
  const cuts = result.paths.map(path => path.map(p => ({ X: Math.round(p.x * SCALE), Y: Math.round(p.y * SCALE) })));
  const erasedKeep = regions.some(r => !settings.areaOverrides?.[r.id] && proposed.materialTreatments[r.id] === 'keep' && area(polygons(r.paths, cuts, 'ctIntersection')) > 0.00001);
  if (erasedKeep) suggestions.warnings.push('Proposed cuts erase retained details. Review the layer order and treatments.');
  // Report support/detail concerns without replacing the inferred types with Outline.
  // Existing bridges participate in this check.
  if (erasedKeep || result.unsupported.length || result.narrowConnections || result.components.filter(c => c.sheetConnected).length > 1 || result.regionBridges.some(b => !b.valid) || result.warnings.some(w => w.includes('intersect another'))) {
    for (const s of Object.values(byRegion)) if (s.mode === 'cut' || s.mode === 'keep') {
      s.reason += ' The combined stencil needs support or detail review; use Edit Bridges if material is detached.';
    }
  }
  return suggestions;
}

// Manual treatment OR visibility choices protect the entire source region.
// Compound contours share material treatment because their fill rule is joint.
export function applyAreaSuggestions(target, artwork, suggestions, { includeUncertain = false } = {}) {
  target.materialTreatments ??= {};
  const hidden = new Set(target.hiddenContours ?? []), cutaways = new Set(target.cutawayContours ?? []);
  for (const r of artwork.sourceRegions ?? []) {
    const s = suggestions.byRegion[r.id];
    if (!s || target.areaOverrides?.[r.id]) continue;
    const mode = isAutomaticSuggestion(s) || includeUncertain ? s.mode : 'outline';
    target.materialTreatments[r.id] = mode === 'hidden' ? 'outline' : mode;
    for (const id of r.contourIds) { cutaways.delete(id); if (mode === 'hidden') hidden.add(id); else hidden.delete(id); }
  }
  target.hiddenContours = [...hidden]; target.cutawayContours = [...cutaways];
}
