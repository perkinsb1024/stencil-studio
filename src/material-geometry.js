// All polygon operations and bridge widths use physical millimeters.
const SCALE = 10000;
const C = () => globalThis.ClipperLib;
const integer = paths => paths.map(path => path.map(p => ({ X: Math.round(p.x * SCALE), Y: Math.round(p.y * SCALE) })));
const decimal = paths => paths.map(path => path.map(p => ({ x: p.X / SCALE, y: p.Y / SCALE })));
const area = paths => Math.abs(paths.reduce((sum, path) => sum + C().Clipper.Area(path), 0)) / SCALE ** 2;

function operate(subject, clip = [], operation = 'ctUnion', tree = false, fill = 'pftNonZero') {
  const lib = C(), engine = new lib.Clipper(), result = tree ? new lib.PolyTree() : new lib.Paths();
  engine.StrictlySimple = true;
  engine.AddPaths(subject, lib.PolyType.ptSubject, true);
  engine.AddPaths(clip, lib.PolyType.ptClip, true);
  engine.Execute(lib.ClipType[operation], result, lib.PolyFillType[fill], lib.PolyFillType[fill]);
  return result;
}
const union = paths => operate(paths);
const difference = (a, b) => operate(a, b, 'ctDifference');
const intersection = (a, b) => operate(a, b, 'ctIntersection');
function shrink(paths, amount) {
  const engine = new (C().ClipperOffset)(2, 0.01 * SCALE), result = new (C().Paths)();
  engine.AddPaths(paths, C().JoinType.jtRound, C().EndType.etClosedPolygon);
  engine.Execute(result, -amount * SCALE);
  return result;
}

export function materialMode(contour, options) {
  return options.materialTreatments?.[contour.regionId] ?? (options.cutawayContours?.includes(contour.id) ? 'cut' : 'outline');
}

function components(paths, sheet) {
  const tree = operate(paths, [], 'ctUnion', true), result = [];
  function visit(node) {
    for (const child of node.Childs()) {
      if (!child.IsHole()) {
        const rings = [child.Contour(), ...child.Childs().filter(n => n.IsHole()).map(n => n.Contour())];
        const outer = rings[0];
        const sheetConnected = outer.some(p => p.X <= 1 || p.Y <= 1 || p.X >= sheet.width * SCALE - 1 || p.Y >= sheet.height * SCALE - 1);
        result.push({ paths: decimal(rings), sheetConnected, area: area(rings) });
      }
      visit(child);
    }
  }
  visit(tree);
  return result;
}

export function pointInMaterial(point, paths) {
  const p = { X: Math.round(point.x * SCALE), Y: Math.round(point.y * SCALE) };
  let winding = 0;
  for (const path of integer(paths)) {
    const location = C().Clipper.PointInPolygon(p, path);
    if (location === -1) return true;
    if (location === 1) winding += C().Clipper.Orientation(path) ? 1 : -1;
  }
  return winding !== 0;
}

export function bridgePolygon(bridge) {
  const { a, b, width } = bridge, length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < 0.0001) return [];
  if (bridge.control) {
    const offset = new (C().ClipperOffset)(2, 0.005 * SCALE), paths = new (C().Paths)();
    offset.AddPath(integer([bridgeCenterline(bridge)])[0], C().JoinType.jtRound, C().EndType.etOpenSquare);
    offset.Execute(paths, width / 2 * SCALE);
    return decimal(paths)[0] ?? [];
  }
  const dx = (b.x - a.x) / length, dy = (b.y - a.y) / length, radius = width / 2;
  // Square caps overlap the anchor material by half the width.
  const p = { x: a.x - dx * radius, y: a.y - dy * radius }, q = { x: b.x + dx * radius, y: b.y + dy * radius };
  return [{ x: p.x - dy * radius, y: p.y + dx * radius }, { x: p.x + dy * radius, y: p.y - dx * radius }, { x: q.x + dy * radius, y: q.y - dx * radius }, { x: q.x - dy * radius, y: q.y + dx * radius }];
}

export function bridgeCenterline(bridge) {
  if (!bridge.control) return [bridge.a, bridge.b];
  const { a, b, control: c } = bridge;
  const length = Math.hypot(c.x - a.x, c.y - a.y) + Math.hypot(b.x - c.x, b.y - c.y);
  const count = Math.max(16, Math.min(128, Math.ceil(length / 0.3)));
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count, u = 1 - t;
    return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
  });
}

function bridgeEndOverlapsMaterial(bridge, end, material, strip) {
  const line = bridgeCenterline(bridge);
  const p = end === 'a' ? line[0] : line.at(-1);
  const neighbor = end === 'a' ? line[1] : line.at(-2);
  const length = Math.hypot(neighbor.x - p.x, neighbor.y - p.y);
  if (!length) return false;
  const dx = (neighbor.x - p.x) / length * bridge.width / 2;
  const dy = (neighbor.y - p.y) / length * bridge.width / 2;
  // Include the square cap and the full strip width, not just its center point.
  const footprint = integer([[
    { x: p.x - dx - dy, y: p.y - dy + dx },
    { x: p.x - dx + dy, y: p.y - dy - dx },
    { x: p.x + dx + dy, y: p.y + dy - dx },
    { x: p.x + dx - dy, y: p.y + dy + dx },
  ]]);
  return area(intersection(material, intersection(strip, footprint))) > 0.00001;
}

export function composeMaterial(contours, channelCuts, options) {
  const { sheet } = options, hidden = new Set(options.hiddenContours ?? []);
  const sheetPaths = integer([[{ x: 0, y: 0 }, { x: sheet.width, y: 0 }, { x: sheet.width, y: sheet.height }, { x: 0, y: sheet.height }]]);
  const active = contours.filter(c => !hidden.has(c.id));
  // Legacy cut-aways remain independent interiors, preserving saved geometry.
  let cuts = union(active.filter(c => c.closed && options.cutawayContours?.includes(c.id) && !options.materialTreatments?.[c.regionId]).flatMap(c => {
    const path = integer([c.points])[0];
    if (!C().Clipper.Orientation(path)) path.reverse();
    return [path];
  }));
  const sourceOrder = [...new Set(contours.map(c => c.regionId).filter(Boolean))];
  const order = [...new Set([...(options.materialOrder ?? []).filter(id => sourceOrder.includes(id)), ...sourceOrder])];
  for (const id of order) {
    const mode = options.materialTreatments?.[id];
    if (!mode || mode === 'outline') continue;
    const members = active.filter(c => c.regionId === id && c.closed);
    const polygons = operate(integer(members.map(c => c.points)), [], 'ctUnion', false, members[0]?.fillRule === 'evenodd' ? 'pftEvenOdd' : 'pftNonZero');
    cuts = mode === 'keep' ? difference(cuts, polygons) : union([...cuts, ...polygons]);
  }
  cuts = intersection(union([...cuts, ...integer(channelCuts)]), sheetPaths);
  const baseCuts = cuts, baseMaterial = difference(sheetPaths, cuts);
  const bridges = options.regionBridges ?? [];
  const strips = bridges.map(bridge => integer([bridgePolygon(bridge)]));
  cuts = difference(cuts, union(strips.flat()));
  const retained = difference(sheetPaths, cuts), materialComponents = components(retained, sheet);
  const minimumWidth = options.minimumMaterialWidth ?? 0.5;
  const strongMaterial = shrink(retained, minimumWidth / 2), strongComponents = components(strongMaterial, sheet);
  const narrowConnections = strongComponents.length > materialComponents.length || materialComponents.some(component => area(intersection(integer(component.paths), strongMaterial)) < 0.0001);
  const warnings = [];
  const unsupported = materialComponents.filter(component => !component.sheetConnected);
  if (unsupported.length) warnings.push(`${unsupported.length} unsupported material area${unsupported.length === 1 ? '' : 's'}. Use Edit Bridges to connect ${unsupported.length === 1 ? 'it' : 'them'} to the sheet.`);
  if (materialComponents.filter(component => component.sheetConnected).length > 1) warnings.push('Cuts split the outer sheet into separate sections. Add bridges between them.');
  if (narrowConnections) warnings.push(`Some material connections are narrower than ${minimumWidth.toFixed(1)} mm. Widen or reinforce them.`);
  const bridgeResults = bridges.map((bridge, i) => {
    // Validate against all OTHER bridges; a strip cannot validate its own anchors.
    const otherMaterial = difference(sheetPaths, difference(baseCuts, union(strips.filter((_, j) => j !== i).flat())));
    const valid = bridgePolygon(bridge).length > 0 && bridgeEndOverlapsMaterial(bridge, 'a', otherMaterial, strips[i]) && bridgeEndOverlapsMaterial(bridge, 'b', otherMaterial, strips[i]) && area(intersection(baseCuts, strips[i])) > 0.00001;
    if (!valid) warnings.push(`Bridge ${i + 1} has an invalid anchor or does not cross a cut. Move its endpoints or regenerate automatic bridges.`);
    return { ...bridge, valid, polygon: bridgePolygon(bridge) };
  });
  return { paths: decimal(cuts), baseCuts: decimal(baseCuts), baseMaterial: decimal(baseMaterial), retainedMaterial: decimal(retained), components: materialComponents, unsupported, narrowConnections, regionBridges: bridgeResults, warnings };
}

export function scaleBridges(bridges, width, padding) {
  const point = p => ({ x: p.x * width + padding, y: p.y * width + padding });
  return bridges.map(bridge => ({ ...bridge, a: point(bridge.a), b: point(bridge.b), ...(bridge.control ? { control: point(bridge.control) } : {}) }));
}
export function unscaleBridge(bridge, width, padding) {
  const point = p => ({ x: (p.x - padding) / width, y: (p.y - padding) / width });
  return { ...bridge, a: point(bridge.a), b: point(bridge.b), ...(bridge.control ? { control: point(bridge.control) } : {}) };
}

function nearestOnSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, squared = dx * dx + dy * dy;
  const t = squared ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / squared)) : 0;
  return { x: a.x + dx * t, y: a.y + dy * t };
}
function samples(paths) {
  const result = [];
  for (const path of paths) {
    const step = Math.max(1, Math.ceil(path.length / 48));
    for (let i = 0; i < path.length; i += step) {
      result.push({ ...path[i], corner: true });
      const next = path[(i + 1) % path.length];
      result.push({ x: (path[i].x + next.x) / 2, y: (path[i].y + next.y) / 2, corner: false });
    }
  }
  return result;
}
function candidatesBetween(first, second, width) {
  const candidates = [];
  function add(from, to) {
    for (const p of samples(from.paths)) {
      let nearest = null, distance = Infinity;
      for (const path of to.paths) {
        const step = Math.max(1, Math.ceil(path.length / 256));
        for (let i = 0; i < path.length; i += step) {
          const q = nearestOnSegment(p, path[i], path[(i + step) % path.length]);
          const d = Math.hypot(q.x - p.x, q.y - p.y);
          if (d < distance) { nearest = q; distance = d; }
        }
      }
      if (!nearest || distance < 0.0001) continue;
      const dx = (nearest.x - p.x) / distance, dy = (nearest.y - p.y) / distance;
      const inset = width / 2 + 0.02;
      const a = { x: p.x - dx * inset, y: p.y - dy * inset }, b = { x: nearest.x + dx * inset, y: nearest.y + dy * inset };
      if (pointInMaterial(a, from.paths) && pointInMaterial(b, to.paths)) candidates.push({ a, b, width, distance, designScore: distance + (p.corner ? width * 4 : 0) });
    }
  }
  add(first, second); add(second, first);
  return candidates.sort((a, b) => a.designScore - b.designScore).slice(0, 8);
}

function rayHits(origin, direction, paths) {
  const hits = [];
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  for (const path of paths) for (let i = 0; i < path.length; i++) {
    const a = path[i], b = path[(i + 1) % path.length], edge = { x: b.x - a.x, y: b.y - a.y };
    const divisor = cross(direction, edge);
    if (Math.abs(divisor) < 1e-9) continue;
    const delta = { x: a.x - origin.x, y: a.y - origin.y };
    const t = cross(delta, edge) / divisor, u = cross(delta, direction) / divisor;
    if (t > 0.001 && u >= -1e-8 && u <= 1 + 1e-8) hits.push(t);
  }
  return hits.sort((a, b) => a - b);
}

// Extend the centerline of an existing elongated feature, rather than attaching
// a short diagonal strip to whichever corner happens to be closest.
function featureCandidates(contours, material, options) {
  const candidates = [], fallbackWidth = options.bridgeWidth ?? 3;
  for (const contour of contours) {
    if (!contour.closed || materialMode(contour, options) !== 'keep' || options.hiddenContours?.includes(contour.id)) continue;
    const points = contour.points, segments = points.slice(1).map((p, i) => ({ a: points[i], b: p, length: Math.hypot(p.x - points[i].x, p.y - points[i].y) }));
    const longest = segments.sort((a, b) => b.length - a.length)[0];
    if (!longest || longest.length < 0.01) continue;
    const u = { x: (longest.b.x - longest.a.x) / longest.length, y: (longest.b.y - longest.a.y) / longest.length }, v = { x: -u.y, y: u.x };
    const along = points.map(p => p.x * u.x + p.y * u.y), across = points.map(p => p.x * v.x + p.y * v.y);
    const low = Math.min(...along), high = Math.max(...along), bottom = Math.min(...across), top = Math.max(...across), thickness = top - bottom;
    if (high - low >= thickness * 2.5 && longest.length >= (high - low) * 0.45) {
      const center = { x: u.x * (low + high) / 2 + v.x * (bottom + top) / 2, y: u.y * (low + high) / 2 + v.y * (bottom + top) / 2 };
      const component = material.components.find(c => pointInMaterial(center, c.paths));
      if (component && !component.sheetConnected) {
        const width = options.bridgeMatchFeatures === false ? fallbackWidth : Math.max(0.5, options.minimumMaterialWidth ?? 0.5, Math.min(15, thickness));
        for (const sign of [-1, 1]) {
          const direction = { x: u.x * sign, y: u.y * sign }, exit = rayHits(center, direction, component.paths)[0];
          if (!exit) continue;
          for (const target of material.components.filter(c => c !== component)) {
            const entry = rayHits(center, direction, target.paths).find(t => t > exit + 0.01);
            if (!entry) continue;
            const a = { x: center.x + direction.x * Math.max(0, exit - width / 2), y: center.y + direction.y * Math.max(0, exit - width / 2) };
            const b = { x: center.x + direction.x * (entry + width / 2), y: center.y + direction.y * (entry + width / 2) };
            if (!pointInMaterial(a, component.paths) || !pointInMaterial(b, target.paths)) continue;
            const distance = entry - exit;
            candidates.push({ a, b, width, distance, designScore: distance * 0.3 + width * 0.1, placement: 'feature' });
          }
        }
      }
    }
    candidates.push(...arcCandidates(contour, material, options));
  }
  return candidates;
}

// Fit a medial circular arc to a narrow curved source feature. The fit is only
// a candidate: endpoint membership and final polygon connectivity still decide
// whether the proposed continuation can be used.
function arcCandidates(contour, material, options) {
  if (options.bridgeMatchFeatures === false || contour.points.length < 12) return [];
  const vertices = contour.points.slice(0, -1), corners = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[(i - 1 + vertices.length) % vertices.length], b = vertices[i], c = vertices[(i + 1) % vertices.length];
    const ax = b.x - a.x, ay = b.y - a.y, bx = c.x - b.x, by = c.y - b.y;
    if ((ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1) < 0.94) corners.push(i);
  }
  const runs = corners.map((start, i) => {
    const end = corners[(i + 1) % corners.length];
    return Array.from({ length: (end - start + vertices.length) % vertices.length + 1 }, (_, k) => vertices[(start + k) % vertices.length]);
  });
  const run = runs.sort((a, b) => b.length - a.length)[0];
  // Fit one side of the ribbon: fitting both sides of a short arc together
  // biases the center toward the ribbon and destroys its intended curvature.
  const fit = run?.length >= 8 ? run : vertices;
  const points = vertices.filter((_, i) => i % Math.max(1, Math.ceil(vertices.length / 100)) === 0);
  const fitted = fit.filter((_, i) => i % Math.max(1, Math.ceil(fit.length / 100)) === 0);
  const origin = { x: fitted.reduce((s, p) => s + p.x, 0) / fitted.length, y: fitted.reduce((s, p) => s + p.y, 0) / fitted.length };
  const matrix = Array.from({ length: 3 }, () => [0, 0, 0, 0]);
  for (const p of fitted) {
    const x = p.x - origin.x, y = p.y - origin.y, row = [x, y, 1], z = x * x + y * y;
    for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) matrix[i][j] += row[i] * row[j]; matrix[i][3] += row[i] * z; }
  }
  for (let i = 0; i < 3; i++) {
    const pivot = matrix.slice(i).reduce((best, row, k) => Math.abs(row[i]) > Math.abs(matrix[best][i]) ? i + k : best, i);
    [matrix[i], matrix[pivot]] = [matrix[pivot], matrix[i]];
    const divisor = matrix[i][i]; if (Math.abs(divisor) < 1e-8) return [];
    for (let j = i; j < 4; j++) matrix[i][j] /= divisor;
    for (let k = 0; k < 3; k++) if (k !== i) { const factor = matrix[k][i]; for (let j = i; j < 4; j++) matrix[k][j] -= factor * matrix[i][j]; }
  }
  const center = { x: origin.x + matrix[0][3] / 2, y: origin.y + matrix[1][3] / 2 };
  const radii = points.map(p => Math.hypot(p.x - center.x, p.y - center.y));
  const radius = (Math.min(...radii) + Math.max(...radii)) / 2, thickness = Math.max(...radii) - Math.min(...radii);
  if (radius < 1 || thickness < 0.2 || thickness > radius * 0.22 || thickness > 15) return [];
  const angles = points.map(p => (Math.atan2(p.y - center.y, p.x - center.x) + Math.PI * 2) % (Math.PI * 2)).sort((a, b) => a - b);
  let gap = -1, index = 0;
  for (let i = 0; i < angles.length; i++) { const next = i + 1 === angles.length ? angles[0] + Math.PI * 2 : angles[i + 1]; if (next - angles[i] > gap) { gap = next - angles[i]; index = i; } }
  const first = angles[(index + 1) % angles.length], span = Math.PI * 2 - gap;
  if (span < 0.5 || span > Math.PI * 1.8) return [];
  const point = angle => ({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
  const width = Math.max(0.5, options.minimumMaterialWidth ?? 0.5, thickness), result = [];
  for (const [end, sign] of [[first, -1], [first + span, 1]]) {
    const start = end - sign * width / radius, a = point(start);
    const component = material.components.find(c => !c.sheetConnected && pointInMaterial(a, c.paths));
    if (!component) continue;
    let outside = false;
    for (let delta = width / radius; delta < Math.PI / 2; delta += 0.025) {
      const angle = start + sign * delta, p = point(angle);
      if (pointInMaterial(p, component.paths)) continue;
      outside = true;
      const target = material.components.find(c => c !== component && pointInMaterial(p, c.paths));
      if (!target || !outside) continue;
      const finish = angle + sign * width / radius, b = point(finish), mid = point((start + finish) / 2);
      if (!pointInMaterial(b, target.paths)) continue;
      const control = { x: 2 * mid.x - (a.x + b.x) / 2, y: 2 * mid.y - (a.y + b.y) / 2 };
      const distance = Math.abs(finish - start) * radius;
      result.push({ a, b, control, width, distance, designScore: distance * 0.28 + width * 0.1, placement: 'curve' }); break;
    }
  }
  return result;
}

function componentDistance(first, second) {
  const bounds = component => component.paths[0].reduce((b, p) => ({ minX: Math.min(b.minX, p.x), minY: Math.min(b.minY, p.y), maxX: Math.max(b.maxX, p.x), maxY: Math.max(b.maxY, p.y) }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const a = bounds(first), b = bounds(second);
  return Math.hypot(Math.max(0, a.minX - b.maxX, b.minX - a.maxX), Math.max(0, a.minY - b.maxY, b.minY - a.maxY));
}

export function bridgeKey(bridge, artworkWidth, padding) {
  const normalized = unscaleBridge(bridge, artworkWidth, padding);
  const ends = [normalized.a, normalized.b].map(p => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).sort();
  return ends.join(':') + (normalized.control ? `:q${normalized.control.x.toFixed(3)},${normalized.control.y.toFixed(3)}` : '');
}

// Fit an existing bridge using the same feature continuations as generation.
// Inspect the artwork without bridges so already-supported features remain available.
export function snapRegionBridge(contours, channelCuts, options, bridge) {
  const material = composeMaterial(contours, channelCuts, { ...options, regionBridges: [] });
  const componentAt = p => material.components.findIndex(c => pointInMaterial(p, c.paths));
  const first = componentAt(bridge.a), second = componentAt(bridge.b);
  if (first < 0 || second < 0 || first === second) return null;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const candidates = featureCandidates(contours, material, { ...options, bridgeMatchFeatures: true })
    .filter(c => componentAt(c.a) === first && componentAt(c.b) === second || componentAt(c.a) === second && componentAt(c.b) === first)
    .map(c => ({ ...c, displacement: Math.min(distance(c.a, bridge.a) + distance(c.b, bridge.b), distance(c.b, bridge.a) + distance(c.a, bridge.b)) }))
    .filter(c => c.displacement <= distance(bridge.a, bridge.b) + Math.max(bridge.width, c.width) * 4)
    .sort((a, b) => a.displacement - b.displacement || a.designScore - b.designScore);
  const others = (options.regionBridges ?? []).filter(b => b.id !== bridge.id);
  const before = composeMaterial(contours, channelCuts, { ...options, regionBridges: [...others, bridge] });
  for (const candidate of candidates) {
    const snapped = { ...bridge, a: candidate.a, b: candidate.b, width: candidate.width, automatic: false };
    delete snapped.control;
    delete snapped.key;
    if (candidate.control) snapped.control = candidate.control;
    const trial = composeMaterial(contours, channelCuts, { ...options, regionBridges: [...others, snapped] });
    if (!trial.regionBridges.at(-1)?.valid || trial.components.length > before.components.length || !before.narrowConnections && trial.narrowConnections) continue;
    return snapped;
  }
  return null;
}

// Deterministic, bounded greedy search. Each accepted strip is verified using
// the boolean geometry, rather than assuming its graph edge makes a connection.
export function generateRegionBridges(contours, channelCuts, options) {
  let bridges = [...(options.regionBridges ?? []).filter(b => !b.automatic)];
  let result = composeMaterial(contours, channelCuts, { ...options, regionBridges: bridges });
  const width = options.bridgeWidth ?? 3, excluded = new Set(options.bridgeExclusions ?? []);
  const score = r => r.components.length;
  for (let iteration = 0; iteration < 100 && bridges.length < 100; iteration++) {
    if (result.components.length <= 1) break;
    const candidates = featureCandidates(contours, result, options);
    for (const component of result.components) {
      const others = result.components.filter(c => c !== component).sort((a, b) => componentDistance(component, a) - componentDistance(component, b));
      const targets = [...new Set([...others.slice(0, 3), ...others.filter(c => c.sheetConnected).slice(0, 2)])];
      for (const target of targets) {
        candidates.push(...candidatesBetween(component, target, width));
      }
    }
    let accepted = false;
    for (const candidate of candidates.sort((a, b) => a.designScore - b.designScore).slice(0, 80)) {
      const key = bridgeKey(candidate, options.artworkWidth, options.padding);
      if (excluded.has(key)) continue;
      let serial = iteration;
      while (bridges.some(b => b.id === `bridge-auto-${serial}`)) serial++;
      const bridge = { a: candidate.a, b: candidate.b, ...(candidate.control ? { control: candidate.control } : {}), width: candidate.width, automatic: true, id: `bridge-auto-${serial}`, key };
      const trial = composeMaterial(contours, channelCuts, { ...options, regionBridges: [...bridges, bridge] });
      if (score(trial) >= score(result) || !trial.regionBridges.at(-1).valid || !result.narrowConnections && trial.narrowConnections) continue;
      bridges.push(bridge); result = trial; accepted = true; break;
    }
    if (!accepted) break;
  }
  if (options.bridgeReinforcement) {
    // Retain one additional separated connection per original unsupported area.
    const original = composeMaterial(contours, channelCuts, { ...options, regionBridges: options.regionBridges?.filter(b => !b.automatic) ?? [] });
    for (const island of original.unsupported.slice(0, 50)) {
      const targets = original.components.filter(c => c.sheetConnected);
      const candidates = [...featureCandidates(contours, original, options).filter(b => pointInMaterial(b.a, island.paths)), ...targets.flatMap(target => candidatesBetween(island, target, width))].sort((a, b) => a.designScore - b.designScore);
      for (const candidate of candidates) {
        if (bridges.length >= 100) break;
        const key = bridgeKey(candidate, options.artworkWidth, options.padding);
        if (excluded.has(key) || bridges.some(b => Math.hypot(b.a.x - candidate.a.x, b.a.y - candidate.a.y) < width * 2 || Math.hypot(b.b.x - candidate.a.x, b.b.y - candidate.a.y) < width * 2)) continue;
        let serial = bridges.length + 100;
        while (bridges.some(b => b.id === `bridge-auto-${serial}`)) serial++;
        const bridge = { a: candidate.a, b: candidate.b, ...(candidate.control ? { control: candidate.control } : {}), width: candidate.width, automatic: true, id: `bridge-auto-${serial}`, key };
        const trial = composeMaterial(contours, channelCuts, { ...options, regionBridges: [...bridges, bridge] });
        if (!trial.regionBridges.at(-1).valid || trial.components.length > result.components.length) continue;
        bridges.push(bridge); result = trial; break;
      }
    }
  }
  return bridges;
}
