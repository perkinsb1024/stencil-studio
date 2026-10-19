const ClipperLib = globalThis.ClipperLib;
const SCALE = 10000;
const cross = (a, b) => a.x * b.y - a.y * b.x;

function segmentRange(a, b, bounds) {
  let start = 0, end = 1;
  for (const [axis, min, max] of [['x', bounds.minX, bounds.maxX], ['y', bounds.minY, bounds.maxY]]) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-12) {
      if (a[axis] < min || a[axis] > max) return null;
    } else {
      const t1 = (min - a[axis]) / delta, t2 = (max - a[axis]) / delta;
      start = Math.max(start, Math.min(t1, t2)); end = Math.min(end, Math.max(t1, t2));
      if (start > end) return null;
    }
  }
  return [start, end];
}

function samplePath(points, profile) {
  const sampled = [{ ...points[0], width: profile.widthAt(points[0]) }];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], direction = { x: b.x - a.x, y: b.y - a.y };
    const length = Math.hypot(direction.x, direction.y);
    if (length < 1e-9) continue;
    const ranges = [], breaks = [0, 1];
    for (const region of profile.regions) {
      const range = segmentRange(a, b, region); if (!range) continue;
      ranges.push(range); breaks.push(...range);
      // Include exact polygon crossings, even for a very small region on a long
      // straight segment. Sampling only existing SVG vertices can miss it.
      for (let j = 0; j < region.points.length; j++) {
        const p = region.points[j], q = region.points[(j + 1) % region.points.length];
        const edge = { x: q.x - p.x, y: q.y - p.y }, from = { x: p.x - a.x, y: p.y - a.y };
        const divisor = cross(direction, edge); if (Math.abs(divisor) < 1e-12) continue;
        const t = cross(from, edge) / divisor, u = cross(from, direction) / divisor;
        if (t > 0 && t < 1 && u >= 0 && u <= 1) breaks.push(t);
      }
    }
    breaks.sort((x, y) => x - y);
    for (let j = 1; j < breaks.length; j++) {
      const start = breaks[j - 1], end = breaks[j]; if (end - start < 1e-10) continue;
      const mid = (start + end) / 2;
      const count = ranges.some(([from, to]) => mid >= from && mid <= to) ? Math.max(1, Math.ceil((end - start) * length / 0.25)) : 1;
      for (let k = 1; k <= count; k++) {
        const t = start + (end - start) * k / count;
        const p = { x: a.x + direction.x * t, y: a.y + direction.y * t };
        sampled.push({ ...p, width: profile.widthAt(p) });
      }
    }
  }
  return sampled;
}

export function channelPaths(points, closed, profile) {
  const sampled = samplePath(points, profile);
  const [minWidth, maxWidth] = sampled.reduce(([min, max], p) => [Math.min(min, p.width), Math.max(max, p.width)], [Infinity, -Infinity]);
  if (maxWidth - minWidth < 1e-7) {
    const offset = new ClipperLib.ClipperOffset(2, SCALE * 0.015);
    offset.AddPath((closed ? points.slice(0, -1) : points).map(p => ({ X: Math.round(p.x * SCALE), Y: Math.round(p.y * SCALE) })), ClipperLib.JoinType.jtRound, closed ? ClipperLib.EndType.etClosedLine : ClipperLib.EndType.etOpenButt);
    const solution = new ClipperLib.Paths();
    offset.Execute(solution, sampled[0].width / 2 * SCALE);
    return solution;
  }
  const paths = [], directions = [];
  function add(polygon) {
    const path = polygon.map(p => ({ X: Math.round(p.x * SCALE), Y: Math.round(p.y * SCALE) }));
    if (!ClipperLib.Clipper.Orientation(path)) path.reverse();
    paths.push(path);
  }
  for (let i = 1; i < sampled.length; i++) {
    const a = sampled[i - 1], b = sampled[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const direction = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
    directions.push(direction);
    const n = { x: -direction.y, y: direction.x };
    add([{ x: a.x + n.x * a.width / 2, y: a.y + n.y * a.width / 2 }, { x: b.x + n.x * b.width / 2, y: b.y + n.y * b.width / 2 },
      { x: b.x - n.x * b.width / 2, y: b.y - n.y * b.width / 2 }, { x: a.x - n.x * a.width / 2, y: a.y - n.y * a.width / 2 }]);
  }
  function join(point, before, after) {
    const turn = Math.atan2(cross(before, after), before.x * after.x + before.y * after.y);
    if (Math.abs(turn) < 1e-8) return;
    const side = turn > 0 ? -1 : 1;
    const start = Math.atan2(before.x * side, -before.y * side), radius = point.width / 2;
    const count = Math.max(1, Math.ceil(Math.abs(turn) / (2 * Math.acos(Math.max(-1, 1 - 0.015 / radius)))));
    const arc = Array.from({ length: count + 1 }, (_, i) => {
      const angle = start + turn * i / count;
      return { x: point.x + Math.cos(angle) * radius, y: point.y + Math.sin(angle) * radius };
    });
    add([point, ...arc]);
  }
  for (let i = 1; i < sampled.length - 1; i++) join(sampled[i], directions[i - 1], directions[i]);
  if (closed) join(sampled[0], directions.at(-1), directions[0]);
  // The segment ends stay square. Adding disks here would intrude into tab gaps.
  return paths;
}
