import { objectSettings } from './object-settings.js';

// Positions are fractions of contour length; widths are physical millimeters.
export function automaticTabs(contour, options) {
  const { tabCount, tabWidth, channelWidth, tabOffset } = objectSettings(options, contour.id);
  if (contour.length < 0.01) return [];
  const count = Math.min(tabCount, Math.max(1, Math.floor(contour.length / (tabWidth + channelWidth * 2))));
  return Array.from({ length: count }, (_, i) => ({
    id: `auto-${i}`,
    position: contour.closed ? ((i + 0.5 + tabOffset / 100) / count) % 1 : (i + 1) / (count + 1),
    widthOverride: null,
  }));
}

export function resolveTabs(contour, options, layout) {
  const inheritedWidth = objectSettings(options, contour.id).tabWidth;
  const custom = Array.isArray(layout);
  const tabs = custom ? layout : automaticTabs(contour, options);
  return tabs.map(tab => {
    const position = contour.closed ? (tab.position >= 0 && tab.position < 1 ? tab.position : ((tab.position % 1) + 1) % 1) : Math.max(0, Math.min(1, tab.position));
    const requestedWidth = tab.widthOverride ?? inheritedWidth;
    // Keep room for channel cuts, including on very short custom outlines.
    const width = Math.min(requestedWidth, contour.length * 0.35 / tabs.length);
    const center = position * contour.length;
    const effectiveWidth = contour.closed ? width : Math.min(contour.length, center + width / 2) - Math.max(0, center - width / 2);
    return { ...tab, position, center, width: effectiveWidth, gapWidth: width, requestedWidth, custom };
  });
}

export function customizeContour(layouts, contour, options) {
  if (!Object.hasOwn(layouts, contour.id)) layouts[contour.id] = automaticTabs(contour, options);
  return layouts[contour.id];
}

// Project to the actual polyline, rather than to a vertex or a nearby outline.
export function nearestOnContour(contour, point) {
  let nearest = { distance: Infinity, position: 0, point: contour.points[0] };
  for (let i = 1; i < contour.points.length; i++) {
    const a = contour.points[i - 1], b = contour.points[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const squared = dx * dx + dy * dy;
    const t = squared ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / squared)) : 0;
    const projected = { x: a.x + dx * t, y: a.y + dy * t };
    const distance = Math.hypot(point.x - projected.x, point.y - projected.y);
    if (distance < nearest.distance) nearest = { distance, point: projected, position: (contour.cumulative[i - 1] + Math.sqrt(squared) * t) / contour.length };
  }
  return nearest;
}
