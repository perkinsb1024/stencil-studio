export { scaleArtwork } from './artwork-scale.js';

const paper = globalThis.paper;
paper.setup(new paper.Size(1, 1));
const allowed = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'symbol', 'use', 'title', 'desc', 'style']);

export function importSvg(source) {
  if (source.length > 3_000_000) throw new Error('This SVG is too large. Please use a file smaller than 3 MB.');
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') throw new Error('This file is not a valid SVG. Try exporting it again from your drawing app.');
  const warnings = [];
  const description = [...doc.querySelectorAll('title, desc, text')].map(el => el.textContent.trim()).filter(Boolean).join('\n');
  if (doc.querySelector('text')) {
    if (!doc.querySelector('path, rect, circle, ellipse, line, polyline, polygon, use')) throw new Error('This SVG contains live text. Convert text to paths in your drawing app, then upload it again.');
    warnings.push('Live text was skipped. Convert text to paths first if you want to cut the lettering.');
  }
  if (doc.querySelector('image')) warnings.push('Embedded images were skipped. Only vector objects can become cut paths.');
  if (doc.querySelector('clipPath, mask')) throw new Error('This SVG uses clipping or masks. Flatten these to paths in your drawing app before importing.');
  for (const el of [...doc.querySelectorAll('*')]) {
    if (!allowed.has(el.localName)) { el.remove(); continue; }
    for (const attr of [...el.attributes]) {
      const key = attr.name.toLowerCase();
      if (key === 'data-paper-data' || key.startsWith('on') || ((key === 'href' || key === 'xlink:href') && !attr.value.startsWith('#')) || /(?:https?:|javascript:|data:|\/\/)/i.test(attr.value) && !key.startsWith('xmlns')) el.removeAttribute(attr.name);
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
  const elements = [...doc.querySelectorAll('*')];
  try { root = paper.project.importSVG(doc.documentElement, { expandShapes: true, insert: false, applyMatrix: true, onImport(node, item) {
    const groups = [];
    for (let parent = node.parentElement; parent && parent !== doc.documentElement; parent = parent.parentElement) {
      if (parent.localName === 'g') groups.unshift({ id: parent.id || null, index: elements.indexOf(parent) });
    }
    item.data.stencilSource = { element: node.localName, id: node.id || null, index: elements.indexOf(node), groups };
  } }); }
  catch { throw new Error('This SVG could not be read. Try exporting a plain SVG with shapes converted to paths.'); }
  const contours = [], sourceRegions = [];
  const paint = color => color ? (color.type === 'gradient' ? { type: 'gradient' } : { type: 'solid', color: color.toCSS(true), rgb: [color.red, color.green, color.blue], alpha: color.alpha }) : null;
  function collect(item, inheritedVisible = true, region = null, inheritedOpacity = 1) {
    const opacity = inheritedOpacity * item.opacity;
    const visible = inheritedVisible && item.visible && opacity > 0;
    if (!visible) return;
    if (item instanceof paper.Path || item instanceof paper.CompoundPath) {
      if (!region) {
        region = { id: `shape-${sourceRegions.length}`, name: item.name || `Shape ${sourceRegions.length + 1}`, fillRule: item.fillRule || 'nonzero', contourIds: [], drawingOrder: sourceRegions.length, source: item.data.stencilSource ?? null, fill: paint(item.fillColor), stroke: paint(item.strokeColor), strokeWidth: item.strokeWidth, opacity, blendMode: item.blendMode };
        sourceRegions.push(region);
      }
    }
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
      const id = `outline-${contours.length}`;
      contours.push({ id, points, closed: item.closed, regionId: region.id, fillRule: region.fillRule, source: region.source });
      region.contourIds.push(id);
      clone.remove();
    } else if (item.children) for (const child of item.children) collect(child, visible, item instanceof paper.CompoundPath ? region : null, opacity);
    else if (item instanceof paper.SymbolItem) { const expanded = item.definition.item.clone({ insert: false }); expanded.transform(item.globalMatrix); expanded.data.stencilSource = item.data.stencilSource; collect(expanded, visible, null, opacity); expanded.remove(); }
  }
  collect(root);
  root.remove();
  if (!contours.length) throw new Error('No vector objects found. Upload an SVG containing paths or shapes.');
  if (contours.length > 500) throw new Error('This SVG has more than 500 contours. Simplify it or split it into smaller files.');
  const all = contours.flatMap(c => c.points);
  let bounds = all.reduce((b, p) => ({ minX: Math.min(b.minX, p.x), minY: Math.min(b.minY, p.y), maxX: Math.max(b.maxX, p.x), maxY: Math.max(b.maxY, p.y) }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  // Our simplifier retains the original coordinate frame so removing a small
  // island cannot unexpectedly enlarge or shift the remaining artwork.
  const frame = doc.documentElement.getAttribute('data-stencil-frame')?.trim().split(/\s+/).map(Number);
  if (frame?.length === 4 && frame.every(Number.isFinite)) {
    const [x, y, width, height] = frame;
    if (width > 0 && height >= 0 && x <= bounds.minX + 0.0001 && y <= bounds.minY + 0.0001 && x + width >= bounds.maxX - 0.0001 && y + height >= bounds.maxY - 0.0001) bounds = { minX: x, minY: y, maxX: x + width, maxY: y + height };
  }
  if (bounds.maxX - bounds.minX < 0.0001) throw new Error('The artwork needs a nonzero width. Rotate vertical lines or include a wider shape.');
  if (contours.some(c => !c.closed)) warnings.push('Open paths are included as channels with square ends.');
  return { contours, sourceRegions: sourceRegions.filter(r => r.contourIds.length), bounds, warnings, description };
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
  football: { name: 'Football.svg', treatments: { 'shape-0': 'cut', 'shape-1': 'keep', 'shape-2': 'keep', 'shape-3': 'keep' }, svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 160"><g transform="rotate(-25 110 80)"><path id="football" fill="#89654c" d="M17 74C36 45 71 25 110 25C149 25 184 45 203 74Q207 80 203 86C184 115 149 135 110 135C71 135 36 115 17 86Q13 80 17 74Z"/><path id="left-band" fill="white" d="M46 35H61Q49 80 61 125H46Q34 80 46 35Z"/><path id="right-band" fill="white" d="M159 35H174Q186 80 174 125H159Q171 80 159 35Z"/><path id="laces" fill="white" d="M75 77H145V83H75Z M80 65H86V95H80Z M97 65H103V95H97Z M114 65H120V95H114Z M131 65H137V95H131Z"/></g></svg>' },
  bloom: { name: 'Bloom.svg', svg: flowerSvg() },
  orbit: { name: 'Orbit.svg', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220"><circle cx="110" cy="110" r="90"/><circle cx="110" cy="110" r="62"/><circle cx="110" cy="110" r="33"/></svg>' },
  arch: { name: 'Arch.svg', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240"><path d="M20 220V100A80 80 0 0 1 180 100V220Z"/><path d="M52 190V102A48 48 0 0 1 148 102V190Z"/></svg>' },
};
