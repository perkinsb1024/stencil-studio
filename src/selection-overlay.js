// The sheet clips its own colored selection box. Draw the continuation in a
// separate viewport overlay, masking out the sheet so the two styles never mix.
export function drawMarginSelection(svg, start, end) {
  const viewport = svg.closest('.canvas-viewport');
  const matrix = svg.getScreenCTM();
  if (!viewport || !matrix) return;
  const bounds = viewport.getBoundingClientRect(), sheet = svg.getBoundingClientRect();
  const a = new DOMPoint(start.x, start.y).matrixTransform(matrix);
  const b = new DOMPoint(end.x, end.y).matrixTransform(matrix);
  let overlay = viewport.querySelector('.selection-margin-overlay');
  if (!overlay) {
    overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.classList.add('selection-margin-overlay');
    overlay.setAttribute('aria-hidden', 'true');
    viewport.append(overlay);
  }
  overlay.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
  overlay.innerHTML = `<defs><mask id="selection-margin-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${bounds.width}" height="${bounds.height}"><rect width="${bounds.width}" height="${bounds.height}" fill="white"/><rect x="${sheet.left - bounds.left}" y="${sheet.top - bounds.top}" width="${sheet.width}" height="${sheet.height}" fill="black"/></mask></defs><rect class="selection-margin-box" x="${Math.min(a.x, b.x) - bounds.left}" y="${Math.min(a.y, b.y) - bounds.top}" width="${Math.abs(b.x - a.x)}" height="${Math.abs(b.y - a.y)}" mask="url(#selection-margin-mask)"/>`;
}

export function clearMarginSelection(svg) {
  svg.closest('.canvas-viewport')?.querySelector('.selection-margin-overlay')?.remove();
}
