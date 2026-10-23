const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

// Rotate near an enabled axis or diagonal, keeping the opposite endpoint fixed for
// handle drags or the center fixed for whole-bridge drags. Preserve length.
export function snapBridgeToAngles(bridge, end = null, { axes = true, diagonal = true } = {}) {
  if (bridge.control || end === 'control') return bridge;
  const dx = bridge.b.x - bridge.a.x, dy = bridge.b.y - bridge.a.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.0001) return bridge;
  const angle = Math.atan2(dy, dx), step = Math.round(angle / (Math.PI / 4)), snapped = step * Math.PI / 4;
  if (step % 2 === 0 ? !axes : !diagonal) return bridge;
  if (Math.abs(angle - snapped) > 5 * Math.PI / 180) return bridge;
  const x = Math.cos(snapped) * length, y = Math.sin(snapped) * length;
  if (end === 'a') return { ...bridge, a: { x: bridge.b.x - x, y: bridge.b.y - y } };
  if (end === 'b') return { ...bridge, b: { x: bridge.a.x + x, y: bridge.a.y + y } };
  const center = { x: (bridge.a.x + bridge.b.x) / 2, y: (bridge.a.y + bridge.b.y) / 2 };
  return { ...bridge, a: { x: center.x - x / 2, y: center.y - y / 2 }, b: { x: center.x + x / 2, y: center.y + y / 2 } };
}

// Use the composed cut boundaries: hidden artwork and edges covered by Keep
// layers must not attract a dragged bridge. Ignore tiny curve tessellation.
export function bridgeSnapLines(paths, minimumLength) {
  const lines = [];
  for (const path of paths) {
    for (let i = 0; i < path.length; i++) {
      const a = path[i], b = path[(i + 1) % path.length], length = distance(a, b);
      if (length >= minimumLength) lines.push({ a, b, length });
    }
  }
  return lines;
}

// Align a SIDE of the strip with a nearby line, rather than snapping its
// centerline onto the artwork and leaving half a bridge on the wrong side.
export function snapBridgeToLines(bridge, lines, tolerance, end = null) {
  if (bridge.control || end === 'control' || tolerance <= 0) return bridge;
  const length = distance(bridge.a, bridge.b);
  if (length < 0.0001) return bridge;
  const direction = { x: (bridge.b.x - bridge.a.x) / length, y: (bridge.b.y - bridge.a.y) / length };
  const center = end === 'a' ? bridge.b : end === 'b' ? bridge.a : { x: (bridge.a.x + bridge.b.x) / 2, y: (bridge.a.y + bridge.b.y) / 2 };
  let best = bridge, bestScore = Infinity;
  for (const line of lines) {
    let ux = (line.b.x - line.a.x) / line.length, uy = (line.b.y - line.a.y) / line.length;
    const dot = ux * direction.x + uy * direction.y;
    if (Math.abs(dot) < Math.cos(10 * Math.PI / 180)) continue;
    if (dot < 0) { ux = -ux; uy = -uy; }
    const nx = -uy, ny = ux;
    const offset = (center.x - line.a.x) * nx + (center.y - line.a.y) * ny;
    const lineStart = (line.a.x - center.x) * ux + (line.a.y - center.y) * uy;
    const lineEnd = (line.b.x - center.x) * ux + (line.b.y - center.y) * uy;
    const low = end === 'a' ? -length : end === 'b' ? 0 : -length / 2;
    const high = low + length;
    if (Math.max(Math.min(lineStart, lineEnd), low) > Math.min(Math.max(lineStart, lineEnd), high) + tolerance) continue;
    for (const side of [-1, 1]) {
      const shift = side * bridge.width / 2 - offset;
      if (Math.abs(shift) > tolerance) continue;
      const a = { x: center.x + ux * low + nx * shift, y: center.y + uy * low + ny * shift };
      const b = { x: center.x + ux * high + nx * shift, y: center.y + uy * high + ny * shift };
      const movement = Math.max(distance(a, bridge.a), distance(b, bridge.b));
      if (movement > tolerance) continue;
      const score = movement + Math.abs(shift) * 0.1;
      if (score >= bestScore) continue;
      bestScore = score; best = { ...bridge, a, b };
    }
  }
  return best;
}
