import { measureContour } from './geometry.js';

const paper = globalThis.paper;
paper.setup(new paper.Size(1, 1));
const allowed = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'symbol', 'use', 'title', 'desc', 'style']);

export function importSvg(source) {
  if (source.length > 3_000_000) throw new Error('This SVG is too large. Please use a file smaller than 3 MB.');
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') throw new Error('This file is not a valid SVG. Try exporting it again from your drawing app.');
  const warnings = [];
  if (doc.querySelector('text')) throw new Error('This SVG contains live text. Convert text to paths in your drawing app, then upload it again.');
  if (doc.querySelector('image')) warnings.push('Embedded images were skipped. Only vector outlines can become cut paths.');
  if (doc.querySelector('clipPath, mask')) throw new Error('This SVG uses clipping or masks. Flatten these to paths in your drawing app before importing.');
  for (const el of [...doc.querySelectorAll('*')]) {
    if (!allowed.has(el.localName)) { el.remove(); continue; }
    for (const attr of [...el.attributes]) {
      const key = attr.name.toLowerCase();
      if (key.startsWith('on') || ((key === 'href' || key === 'xlink:href') && !attr.value.startsWith('#')) || /(?:https?:|javascript:|data:|\/\/)/i.test(attr.value) && !key.startsWith('xmlns')) el.removeAttribute(attr.name);
    }
    if (el.localName === 'style') {
      // Retain local shape styling; disallow CSS imports and remote resources.
      el.textContent = el.textContent.replace(/@import[^;]+;/gi, '').replace(/url\([^)]*\)/gi, 'none');
    }
    // Paper's SVG 1.1 importer reads the namespaced form of SVG 2 references.
    if (el.localName === 'use' && el.getAttribute('href')?.startsWith('#')) {
      el.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', el.getAttribute('href'));
    }
  }
  paper.project.clear();
  let root;
  try { root = paper.project.importSVG(doc.documentElement, { expandShapes: true, insert: false, applyMatrix: true }); }
  catch { throw new Error('This SVG could not be read. Try exporting a plain SVG with shapes converted to paths.'); }
  const contours = [];
  function collect(item, inheritedVisible = true) {
    const visible = inheritedVisible && item.visible && item.opacity > 0;
    if (!visible) return;
    if (item instanceof paper.Path) {
      if (item.segments.length < 2) return;
      const clone = item.clone({ insert: false });
      // Flatten after applying the complete parent transform.
      clone.transform(item.globalMatrix);
      clone.applyMatrix = true;
      const span = Math.max(clone.bounds.width, clone.bounds.height, 1);
      clone.flatten(span / 5000);
      if (clone.segments.length > 30000) throw new Error('This artwork has too much detail. Simplify its paths before importing.');
      const points = clone.segments.map(s => ({ x: s.point.x, y: s.point.y }));
      contours.push({ id: `outline-${contours.length}`, points, closed: item.closed });
      clone.remove();
    } else if (item.children) for (const child of item.children) collect(child, visible);
    else if (item instanceof paper.SymbolItem) { const expanded = item.definition.item.clone({ insert: false }); expanded.transform(item.globalMatrix); collect(expanded); expanded.remove(); }
  }
  collect(root);
  root.remove();
  if (!contours.length) throw new Error('No vector outlines found. Upload an SVG containing paths or shapes.');
  if (contours.length > 500) throw new Error('This SVG has more than 500 contours. Simplify it or split it into smaller files.');
  const all = contours.flatMap(c => c.points);
  const bounds = all.reduce((b, p) => ({ minX: Math.min(b.minX, p.x), minY: Math.min(b.minY, p.y), maxX: Math.max(b.maxX, p.x), maxY: Math.max(b.maxY, p.y) }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  if (bounds.maxX - bounds.minX < 0.0001) throw new Error('The artwork needs a nonzero width. Rotate vertical lines or include a wider shape.');
  if (contours.some(c => !c.closed)) warnings.push('Open paths are included as channels with square ends.');
  return { contours, bounds, warnings };
}

export function scaleArtwork(artwork, width, padding) {
  const { bounds } = artwork;
  const scale = width / (bounds.maxX - bounds.minX);
  return {
    contours: artwork.contours.map(c => ({ ...measureContour(c.points.map(p => ({ x: (p.x - bounds.minX) * scale + padding, y: (p.y - bounds.minY) * scale + padding })), c.closed), id: c.id })),
    width: width + 2 * padding,
    height: (bounds.maxY - bounds.minY) * scale + 2 * padding,
    artworkHeight: (bounds.maxY - bounds.minY) * scale,
  };
}

export function flowerSvg() {
  const points = Array.from({ length: 24 }, (_, i) => {
    const a = i / 24 * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 89 : 57;
    return { x: 110 + Math.cos(a) * r, y: 110 + Math.sin(a) * r };
  });
  let d = `M${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length; i++) {
    const p0 = points[(i - 1 + 24) % 24], p1 = points[i], p2 = points[(i + 1) % 24], p3 = points[(i + 2) % 24];
    d += `C${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6} ${p2.x} ${p2.y}`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220"><path d="${d}Z"/><circle cx="110" cy="110" r="30"/></svg>`;
}

export const examples = {
  bloom: { name: 'Bloom.svg', svg: flowerSvg() },
  orbit: { name: 'Orbit.svg', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220"><circle cx="110" cy="110" r="90"/><circle cx="110" cy="110" r="62"/><circle cx="110" cy="110" r="33"/></svg>' },
  arch: { name: 'Arch.svg', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240"><path d="M20 220V100A80 80 0 0 1 180 100V220Z"/><path d="M52 190V102A48 48 0 0 1 148 102V190Z"/></svg>' },
};
