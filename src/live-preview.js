import { at, measureContour, layoutChannel, pathData } from './geometry.js';
import { createChannelWidthProfile, scaleRegions } from './regions.js';
import { materialMode, scaleBridges } from './material-geometry.js';
import { samplePath } from './variable-channel.js';
import { formatLength } from './units.js';

const number = value => Number(value.toFixed(4));
const circle = (p, r) => `M${number(p.x - r)} ${number(p.y)}a${number(r)} ${number(r)} 0 1 0 ${number(2 * r)} 0a${number(r)} ${number(r)} 0 1 0 ${number(-2 * r)} 0Z`;

function channelPreview(piece, profile, closed, unit) {
  let caps = '';
  if (!closed && (piece.start && profile.shapeAt(piece.points[0], 'roundedTabs') || piece.end && profile.shapeAt(piece.points.at(-1), 'roundedTabs'))) {
    const contour = measureContour(piece.points, false);
    const start = piece.start && profile.shapeAt(piece.points[0], 'roundedTabs') ? Math.min(contour.length / 3, profile.widthAt(piece.points[0]) / 2) : 0;
    const end = piece.end && profile.shapeAt(piece.points.at(-1), 'roundedTabs') ? Math.min(contour.length / 3, profile.widthAt(piece.points.at(-1)) / 2) : 0;
    const points = [at(contour, start), ...contour.points.filter((_, i) => contour.cumulative[i] > start && contour.cumulative[i] < contour.length - end), at(contour, contour.length - end)];
    for (const [point, neighbor, depth] of [[points[0], points[1], start], [points.at(-1), points.at(-2), end]]) {
      if (!depth) continue;
      const angle = Math.atan2(point.y - neighbor.y, point.x - neighbor.x) * 180 / Math.PI;
      caps += `<ellipse cx="${point.x}" cy="${point.y}" rx="${depth}" ry="${profile.widthAt(point) / 2}" transform="rotate(${angle} ${point.x} ${point.y})" fill="white"/>`;
    }
    piece = { ...piece, points };
  }
  const join = profile.shapeAt(piece.points[0], 'roundedChannelCorners') ? 'round' : 'miter';
  if (!profile.regions.length) {
    return `<path d="${pathData(piece.points, closed)}" fill="none" stroke="white" stroke-width="${profile.widthAt(piece.points[0])}" stroke-linejoin="${join}"/>${caps}`;
  }
  // Small uncombined ribbons show the regional width and taper. SVG paints
  // their union; Clipper offsets and polygon operations remain release-only.
  const points = samplePath(piece.points, profile, Math.max(0.25, unit * 2)), ribbons = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 1e-9) continue;
    const nx = -(b.y - a.y) / length / 2, ny = (b.x - a.x) / length / 2;
    ribbons.push(pathData([
      { x: a.x + nx * a.width, y: a.y + ny * a.width },
      { x: b.x + nx * b.width, y: b.y + ny * b.width },
      { x: b.x - nx * b.width, y: b.y - ny * b.width },
      { x: a.x - nx * a.width, y: a.y - ny * a.width },
    ]));
    if (i < points.length - 1 && profile.shapeAt(b, 'roundedChannelCorners')) ribbons.push(circle(b, b.width / 2));
  }
  return `<path d="${ribbons.join('')}" fill="white" fill-rule="nonzero"/>${caps}`;
}

const bridgePath = bridge => bridge.control
  ? `M${bridge.a.x} ${bridge.a.y}Q${bridge.control.x} ${bridge.control.y} ${bridge.b.x} ${bridge.b.y}`
  : `M${bridge.a.x} ${bridge.a.y}L${bridge.b.x} ${bridge.b.y}`;

export function livePreviewMarkup(state, unit, overrides = {}) {
  const { contours, width, height, padding } = state.scaled;
  const options = { ...state, regions: scaleRegions(state.regions, state.artworkWidth, padding) };
  const active = contours.filter(contour => !state.hiddenContours.includes(contour.id));
  const shapes = [], tabs = [], channels = [];
  for (const contour of active) {
    if (contour.closed && state.cutawayContours.includes(contour.id) && !state.materialTreatments[contour.regionId]) shapes.push(`<path d="${pathData(contour.points)}" fill="white"/>`);
  }
  const order = [...new Set([...state.materialOrder, ...contours.map(contour => contour.regionId)])];
  for (const id of order) {
    const mode = state.materialTreatments[id];
    if (!mode || mode === 'outline') continue;
    const members = active.filter(contour => contour.regionId === id && contour.closed);
    shapes.push(`<path d="${members.map(contour => pathData(contour.points)).join('')}" fill="${mode === 'keep' ? 'black' : 'white'}" fill-rule="${members[0]?.fillRule ?? 'nonzero'}"/>`);
  }
  for (const contour of active) {
    if (materialMode(contour, state) !== 'outline' || contour.length < 0.01) continue;
    const layout = layoutChannel(contour, options, state.tabLayouts[contour.id]);
    const profile = createChannelWidthProfile(contour.id, options);
    tabs.push(...layout.bridges.map(tab => ({ ...tab, channelWidth: profile.widthAt(tab.point) })));
    channels.push(...layout.pieces.map(piece => channelPreview(piece, profile, contour.closed && !layout.tabs.length, unit)));
  }
  const bridges = scaleBridges(state.regionBridges, state.artworkWidth, padding).map(bridge => ({
    ...bridge,
    width: overrides.selectedBridgeWidth != null && state.selectedRegionBridges.includes(bridge.id) ? overrides.selectedBridgeWidth : bridge.width,
  }));
  const strips = bridges.map(bridge => `<path d="${bridgePath(bridge)}" fill="none" stroke="black" stroke-width="${bridge.width}" stroke-linecap="square" stroke-linejoin="round"/>`).join('');
  const highlights = bridges.map(bridge => `<path class="live-bridge-highlight" data-live-bridge="${bridge.id}" d="${bridgePath(bridge)}" fill="none" stroke="var(--bridge-${bridge.automatic ? 'automatic' : 'custom'})" stroke-width="${bridge.width}" stroke-opacity=".2" stroke-linecap="square" stroke-linejoin="round"/>`).join('');
  const mask = 'live-preview-cuts';
  return {
    tabs,
    regions: options.regions,
    markup: `<g class="live-preview" pointer-events="none" aria-hidden="true"><defs><mask id="${mask}" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}" style="mask-type:luminance"><rect width="${width}" height="${height}" fill="black"/>${shapes.join('')}${channels.join('')}${strips}</mask></defs><rect width="${width}" height="${height}" fill="#502c6c" mask="url(#${mask})"/>${state.showBridges || state.view === 'material' ? highlights : ''}</g>`,
  };
}

export function createLivePreview({ svg, state, screenUnit, markers, regionMarkers }) {
  let frame = null, active = false, overrides = {};
  function draw() {
    frame = null;
    if (!active || !state.scaled) return;
    if (overrides.guide) {
      const viewport = svg.closest('.canvas-viewport');
      let guide = viewport.querySelector('.live-size-guide');
      if (!guide) {
        guide = document.createElement('div'); guide.className = 'live-size-guide';
        viewport.append(guide);
      }
      const { label, width } = overrides.guide;
      guide.replaceChildren();
      const caption = document.createElement('span'), sample = document.createElement('i');
      caption.textContent = `${label}: ${formatLength(width, state)}`;
      sample.style.height = `${width / screenUnit()}px`;
      guide.append(caption, sample);
      return;
    }
    const preview = livePreviewMarkup(state, screenUnit(), overrides);
    const previous = svg.querySelector('.live-preview');
    if (previous) previous.outerHTML = preview.markup;
    else svg.querySelector('.cut-shape')?.insertAdjacentHTML('afterend', preview.markup);
    const tabs = svg.querySelector('.tab-markers');
    if (tabs) tabs.outerHTML = markers(preview.tabs);
    const regions = svg.querySelector('.region-overlays');
    if (regions) regions.outerHTML = regionMarkers(preview.regions);
    svg.classList.add('live-preview-active');
  }
  return {
    get active() { return active; },
    schedule(value = {}) {
      active = true; overrides = value;
      if (frame == null) frame = requestAnimationFrame(draw);
    },
    clear() {
      if (!active) return;
      active = false; overrides = {};
      if (frame != null) cancelAnimationFrame(frame);
      frame = null;
      svg.querySelector('.live-preview')?.remove();
      svg.closest('.canvas-viewport')?.querySelector('.live-size-guide')?.remove();
      svg.classList.remove('live-preview-active');
      const tabs = svg.querySelector('.tab-markers');
      if (tabs) tabs.outerHTML = markers(state.result.bridges);
      const regions = svg.querySelector('.region-overlays');
      if (regions) regions.outerHTML = regionMarkers(state.scaled.regions);
    },
  };
}
