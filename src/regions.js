// Region vertices use artwork-width units on both axes, so they follow artwork
// resizing and stay independent of sheet padding. Widths and tapers remain millimeters.
export function scaleRegions(regions, width, padding) {
  return regions.map(region => ({ ...region, points: region.points.map(p => ({ x: p.x * width + padding, y: p.y * width + padding })) }));
}

const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const onSegment = (a, b, p) => Math.abs(cross(a, b, p)) < 1e-10 && p.x >= Math.min(a.x, b.x) - 1e-10 && p.x <= Math.max(a.x, b.x) + 1e-10 && p.y >= Math.min(a.y, b.y) - 1e-10 && p.y <= Math.max(a.y, b.y) + 1e-10;
function intersects(a, b, c, d) {
  return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0 ||
    onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}
export function validPolygon(points) {
  if (!Array.isArray(points) || points.length < 3 || points.length > 200 || !points.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) <= 1000 && Math.abs(p.y) <= 1000)) return false;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-8) return false;
    area += a.x * b.y - b.x * a.y;
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || i === 0 && j === points.length - 1) continue;
      if (intersects(a, b, points[j], points[(j + 1) % points.length])) return false;
    }
  }
  return Math.abs(area) > 1e-10;
}

export function containsPoint(points, point) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j], b = points[i];
    if (onSegment(a, b, point)) return true;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function distanceToBoundary(points, point) {
  let nearest = Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const dx = b.x - a.x, dy = b.y - a.y, lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)) : 0;
    nearest = Math.min(nearest, Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy));
  }
  return nearest;
}

export function createChannelWidthProfile(contourId, options) {
  const previousWidths = [options.channelWidth];
  const regions = (options.regions ?? []).filter(r => r.contourId === null || r.contourId === contourId).map(region => {
    // Keep the exact requested width throughout the region. Blend outward over
    // the chosen distance, using a smoothstep with flat ends to avoid shoulders.
    // Older regions retain their original automatic taper until edited.
    const taper = region.taperLength ?? Math.max(1, ...previousWidths.map(width => Math.abs(width - region.width)));
    previousWidths.push(region.width);
    const xs = region.points.map(p => p.x), ys = region.points.map(p => p.y);
    return { ...region, taper, minX: Math.min(...xs) - taper, maxX: Math.max(...xs) + taper, minY: Math.min(...ys) - taper, maxY: Math.max(...ys) + taper };
  });
  return {
    regions,
    shapeAt(point, property) {
      let value = property === 'roundedChannelCorners' ? options[property] !== false : !!options[property];
      for (const region of regions) {
        if (typeof region[property] === 'boolean' && containsPoint(region.points, point)) value = region[property];
      }
      return value;
    },
    widthAt(point) {
      let width = options.channelWidth;
      for (const region of regions) {
        if (point.x < region.minX || point.x > region.maxX || point.y < region.minY || point.y > region.maxY) continue;
        if (containsPoint(region.points, point)) { width = region.width; continue; }
        const t = Math.min(1, distanceToBoundary(region.points, point) / region.taper);
        const blend = 1 - t * t * (3 - 2 * t);
        width += (region.width - width) * blend;
      }
      return width;
    },
  };
}

export function channelWidthAt(point, contourId, options) {
  return createChannelWidthProfile(contourId, options).widthAt(point);
}
