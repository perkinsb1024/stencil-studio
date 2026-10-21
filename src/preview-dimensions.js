// Dimension lines live in viewport space so their text never scales or leaves
// the canvas. When cropped, measure only the sheet between their end marks.
export function createPreviewDimensions({ viewport, sheet, width, height, getSize, format, changed = () => {} }) {
  let frame = 0, settleUntil = 0;
  function draw() {
    changed();
    const size = getSize();
    if (!size) return;
    const view = viewport.getBoundingClientRect();
    const bounds = sheet.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const left = Math.max(12, bounds.left - view.left);
    const top = Math.max(12, bounds.top - view.top);
    const right = Math.min(view.width - 38, bounds.right - view.left);
    const bottom = Math.min(view.height - 34, bounds.bottom - view.top);
    width.hidden = height.hidden = right <= left || bottom <= top;
    if (width.hidden) return;
    Object.assign(width.style, { left: `${left}px`, top: `${bottom + 6}px`, width: `${right - left}px` });
    Object.assign(height.style, { left: `${right + 6}px`, top: `${top}px`, height: `${bottom - top}px` });
    const visibleWidth = Math.min(size.width, (right - left) / bounds.width * size.width);
    const visibleHeight = Math.min(size.height, (bottom - top) / bounds.height * size.height);
    width.querySelector('span').textContent = format(visibleWidth);
    height.querySelector('span').textContent = format(visibleHeight);
    width.setAttribute('aria-label', `Visible sheet width: ${format(visibleWidth)}`);
    height.setAttribute('aria-label', `Visible sheet height: ${format(visibleHeight)}`);
  }
  function update() {
    draw();
    frame = performance.now() < settleUntil ? requestAnimationFrame(update) : 0;
  }
  function refresh() {
    // Follow the sheet's 120ms zoom transition, including rapid repeated zooms.
    settleUntil = performance.now() + 160;
    draw();
    if (!frame) frame = requestAnimationFrame(update);
  }
  return { refresh };
}
