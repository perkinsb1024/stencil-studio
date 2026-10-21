import { bridgeCenterline } from './material-geometry.js';

function snapAngle(start, point, mode) {
  if (mode?.disabled) return null;
  const options = typeof mode === 'string' ? measureSnapOptions(mode) : mode;
  if (!options.axes && !options.diagonal) return null;
  const dx = point.x - start.x, dy = point.y - start.y;
  if (Math.hypot(dx, dy) < 1e-8) return null;
  const angle = Math.atan2(dy, dx), quarter = Math.PI / 2, eighth = Math.PI / 4;
  const snapped = options.axes && options.diagonal ? Math.round(angle / eighth) * eighth
    : options.axes ? Math.round(angle / quarter) * quarter
    : eighth + Math.round((angle - eighth) / quarter) * quarter;
  const delta = Math.atan2(Math.sin(angle - snapped), Math.cos(angle - snapped));
  return Math.abs(delta) <= 5 * Math.PI / 180 + 1e-10 ? snapped : null;
}

export function snapMeasurement(start, point, mode, size) {
  let dx = point.x - start.x, dy = point.y - start.y;
  const angle = snapAngle(start, point, mode);
  if (angle !== null) {
    const distance = Math.max(0, dx * Math.cos(angle) + dy * Math.sin(angle));
    dx = distance * Math.cos(angle); dy = distance * Math.sin(angle);
  }
  let scale = 1;
  if (dx > 0) scale = Math.min(scale, (size.width - start.x) / dx);
  if (dx < 0) scale = Math.min(scale, -start.x / dx);
  if (dy > 0) scale = Math.min(scale, (size.height - start.y) / dy);
  if (dy < 0) scale = Math.min(scale, -start.y / dy);
  return { x: start.x + dx * scale, y: start.y + dy * scale };
}

export function measureSnapOptions(value) {
  if (value && typeof value === 'object') return { axes: !!value.axes, diagonal: !!value.diagonal, objects: !!value.objects };
  // Migrate the former dropdown preferences when reopening older workspaces.
  return { axes: ['auto', 'horizontal', 'vertical'].includes(value), diagonal: ['auto', 'diagonal'].includes(value), objects: false };
}

export function snapMeasurementPoint(start, pointer, options, size, targets, tolerance) {
  const point = start ? snapMeasurement(start, pointer, options, size) : pointer;
  if (options.disabled || !options.objects) return { point, snapped: false };
  const dx = start ? point.x - start.x : 0, dy = start ? point.y - start.y : 0;
  const length = Math.hypot(dx, dy);
  const constrained = start && snapAngle(start, pointer, options) !== null && length > 1e-8;
  const direction = constrained ? { x: dx / length, y: dy / length } : null;
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  let best = null, distance = tolerance;
  function consider(candidate) {
    if (candidate.x < 0 || candidate.y < 0 || candidate.x > size.width || candidate.y > size.height) return;
    if (direction) {
      const v = { x: candidate.x - start.x, y: candidate.y - start.y };
      if (Math.abs(cross(v, direction)) > 1e-7 || v.x * direction.x + v.y * direction.y < -1e-7) return;
    }
    const delta = Math.hypot(candidate.x - pointer.x, candidate.y - pointer.y);
    if (delta <= distance) { best = candidate; distance = delta; }
  }
  // Explicit features such as tab centers take priority over nearby edges.
  for (const p of targets.points) consider(p);
  if (best) return { point: { ...best }, snapped: true };
  for (const { a, b } of targets.lines) {
    const segment = { x: b.x - a.x, y: b.y - a.y };
    const squared = segment.x ** 2 + segment.y ** 2;
    if (!squared) continue;
    const denominator = direction ? cross(direction, segment) : 0;
    if (direction && Math.abs(denominator) > 1e-8) {
      // Intersect the angle guide with the actual segment, preserving both snaps.
      const offset = { x: a.x - start.x, y: a.y - start.y };
      const along = cross(offset, direction) / denominator;
      if (along < 0 || along > 1) continue;
      consider({ x: a.x + segment.x * along, y: a.y + segment.y * along });
    } else {
      const t = Math.max(0, Math.min(1, ((pointer.x - a.x) * segment.x + (pointer.y - a.y) * segment.y) / squared));
      consider({ x: a.x + segment.x * t, y: a.y + segment.y * t });
    }
  }
  return best ? { point: { ...best }, snapped: true } : { point, snapped: false };
}

export function measurementSnapTargets(state) {
  const points = (state.result?.bridges ?? []).map(tab => tab.point);
  const lines = [];
  function add(points, closed) {
    for (let i = 1; i < points.length; i++) lines.push({ a: points[i - 1], b: points[i] });
    if (closed && points.length > 1) lines.push({ a: points.at(-1), b: points[0] });
  }
  for (const contour of state.scaled?.contours ?? []) if (!(state.hiddenContours ?? []).includes(contour.id)) add(contour.points, contour.closed);
  for (const path of state.result?.paths ?? []) add(path, true);
  for (const bridge of state.result?.regionBridges ?? []) {
    add(bridge.polygon ?? [], true);
    add(bridgeCenterline(bridge), false);
    points.push(bridge.a, bridge.b, bridge.control
      ? { x: (bridge.a.x + 2 * bridge.control.x + bridge.b.x) / 4, y: (bridge.a.y + 2 * bridge.control.y + bridge.b.y) / 4 }
      : { x: (bridge.a.x + bridge.b.x) / 2, y: (bridge.a.y + bridge.b.y) / 2 });
  }
  return { points, lines };
}

export function createMeasureTool({ viewport, svg, overlay, state, format, save, edit, begin, modeChanged = () => {}, panOwns = () => false, panning = () => false }) {
  const $ = selector => document.querySelector(selector);
  let active = false, start = null, pointer = null, selected = -1, gesture = null, snappingDisabled = false;
  state.measurements = [];
  state.measureSnap = measureSnapOptions('free');
  let targetCache = null;
  const rulers = () => state.measurements;
  function settings() { return state.measureSnap = measureSnapOptions(state.measureSnap); }
  function targets() {
    if (targetCache?.scaled === state.scaled && targetCache?.result === state.result && targetCache?.hidden === state.hiddenContours) return targetCache;
    targetCache = { scaled: state.scaled, result: state.result, hidden: state.hiddenContours, ...measurementSnapTargets(state) };
    return targetCache;
  }
  function resolve(point, origin = start) {
    const matrix = svg.getScreenCTM();
    const tolerance = 8 / Math.hypot(matrix.a, matrix.b);
    return snapMeasurementPoint(origin, point, { ...settings(), disabled: snappingDisabled }, state.scaled, targets(), tolerance);
  }
  function endpoint() { return start && pointer ? resolve(pointer).point : start; }
  function draw() {
    const matrix = svg.getScreenCTM();
    if (!matrix || !state.scaled) return;
    const view = viewport.getBoundingClientRect();
    const project = p => { const q = new DOMPoint(p.x, p.y).matrixTransform(matrix); return { x: q.x - view.left, y: q.y - view.top }; };
    const markup = (ruler, index, draft = false) => {
      const a = project(ruler.a), b = project(ruler.b);
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
      const nx = length ? -dy / length : 0, ny = length ? dx / length : 1;
      let angle = Math.atan2(dy, dx) * 180 / Math.PI;
      if (angle > 90) angle -= 180;
      if (angle < -90) angle += 180;
      const label = format(Math.hypot(ruler.b.x - ruler.a.x, ruler.b.y - ruler.a.y));
      const labelWidth = label.length * 6.5 + 10;
      return `<g class="${draft ? 'draft' : index === selected && active ? 'selected' : ''}" ${draft ? '' : `data-measure="${index}" role="button" tabindex="${active ? 0 : -1}" aria-label="Ruler ${index + 1}: ${label}"`}>
        <path class="ruler-hit" d="M${a.x} ${a.y}L${b.x} ${b.y}"/>
        <path class="ruler-line" d="M${a.x} ${a.y}L${b.x} ${b.y}"/>
        <path class="ruler-cap" d="M${a.x - nx * 4} ${a.y - ny * 4}l${nx * 8} ${ny * 8}M${b.x - nx * 4} ${b.y - ny * 4}l${nx * 8} ${ny * 8}"/>
        <g transform="translate(${(a.x + b.x) / 2} ${(a.y + b.y) / 2}) rotate(${angle})"><rect class="ruler-label-bg" x="${-labelWidth / 2}" y="-9" width="${labelWidth}" height="18" rx="3"/><text>${label}</text></g></g>`;
    };
    const resolved = pointer ? resolve(pointer) : null;
    const snap = resolved?.snapped ? project(resolved.point) : null;
    overlay.innerHTML = rulers().map((r, i) => markup(r, i)).join('') + (start ? markup({ a: start, b: endpoint() }, -1, true) : '') + (snap ? `<circle class="measure-snap-target" cx="${snap.x}" cy="${snap.y}" r="4"/>` : '');
    $('#measure-delete').disabled = selected < 0 || !rulers()[selected];
    $('#measure-clear').disabled = !rulers().length;
    const options = settings();
    for (const key of ['axes', 'diagonal', 'objects']) $(`#measure-snap-${key}`).checked = options[key];
    $('#measure-hint').textContent = gesture ? 'Drag to measure. Release to finish. Alt/Option bypasses snapping.' : start ? 'Move to preview. Click the second point to finish the ruler.' : 'Drag to measure, or click two points. Alt/Option bypasses snapping. Escape cancels.';
  }
  function setActive(value) {
    cancelDraft();
    active = value; snappingDisabled = false;
    viewport.classList.toggle('measuring', active);
    $('#measure-preview').setAttribute('aria-pressed', String(active));
    $('#measure-controls').hidden = !active;
    modeChanged();
    draw();
  }
  function stop(e) { e.preventDefault(); e.stopImmediatePropagation(); }
  function point(e, clamp = false) {
    const matrix = svg.getScreenCTM();
    if (!matrix || !state.scaled) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
    if (clamp) return { x: Math.max(0, Math.min(state.scaled.width, p.x)), y: Math.max(0, Math.min(state.scaled.height, p.y)) };
    if (p.x < 0 || p.y < 0 || p.x > state.scaled.width || p.y > state.scaled.height) return null;
    return { x: p.x, y: p.y };
  }
  function releaseGesture() {
    const previous = gesture; gesture = null;
    if (previous && viewport.hasPointerCapture(previous.id)) viewport.releasePointerCapture(previous.id);
  }
  function cancelDraft() { releaseGesture(); start = pointer = null; selected = -1; }
  function finish() {
    const end = endpoint();
    if (!start || !end || Math.hypot(end.x - start.x, end.y - start.y) < 0.001) return;
    const ruler = { a: { ...start }, b: { ...end } };
    releaseGesture(); start = pointer = null;
    edit(() => rulers().push(ruler)); selected = rulers().length - 1;
    draw(); save();
  }
  viewport.addEventListener('pointerdown', e => {
    if (!active || e.button !== 0 || panOwns(e)) return;
    stop(e); snappingDisabled = e.altKey;
    const hit = e.target.closest('[data-measure]');
    if (hit && !start) { selected = Number(hit.dataset.measure); draw(); return; }
    const p = point(e);
    if (!p) return;
    if (!start) {
      start = resolve(p, null).point; pointer = p; selected = -1;
      gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
      if (e.isTrusted) viewport.setPointerCapture(e.pointerId);
    } else { pointer = p; finish(); }
    draw();
  }, true);
  viewport.addEventListener('pointermove', e => {
    if (!active || panOwns(e) && !gesture) return;
    stop(e); snappingDisabled = e.altKey;
    if (gesture && e.pointerId === gesture.id && Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) >= 3) gesture.moved = true;
    const p = point(e, !!gesture);
    if (p) { pointer = p; draw(); }
  }, true);
  viewport.addEventListener('pointerup', e => {
    if (!gesture || e.pointerId !== gesture.id) { if (active && !panOwns(e)) stop(e); return; }
    stop(e); snappingDisabled = e.altKey;
    const moved = gesture.moved || Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) >= 3;
    if (moved) { pointer = point(e, true) ?? pointer; finish(); }
    releaseGesture(); draw();
  }, true);
  for (const type of ['pointercancel', 'lostpointercapture']) viewport.addEventListener(type, e => {
    if (gesture?.id !== e.pointerId) return;
    stop(e); cancelDraft(); draw();
  }, true);
  viewport.addEventListener('click', e => { if (active && !panOwns(e)) stop(e); }, true);
  function remove() {
    if (selected < 0) return;
    edit(() => rulers().splice(selected, 1)); selected = -1; draw(); save();
  }
  $('#measure-controls').addEventListener('click', e => {
    if (e.detail > 0 && e.target.matches('button,input[type="checkbox"]') && e.target === document.activeElement) e.target.blur();
  });
  $('#measure-preview').addEventListener('click', () => { if (!active) begin(); setActive(!active); });
  $('#measure-cancel').addEventListener('click', () => setActive(false));
  $('#measure-delete').addEventListener('click', remove);
  $('#measure-clear').addEventListener('click', () => { cancelDraft(); if (rulers().length) edit(() => { state.measurements = []; }); draw(); save(); });
  for (const key of ['axes', 'diagonal', 'objects']) $(`#measure-snap-${key}`).addEventListener('change', e => {
    state.measureSnap = { ...settings(), [key]: e.target.checked }; draw(); save();
  });
  overlay.addEventListener('keydown', e => {
    if (active && ['Enter', ' '].includes(e.key) && e.target.closest('[data-measure]')) {
      stop(e); selected = Number(e.target.closest('[data-measure]').dataset.measure); draw(); $('#measure-delete').focus();
    }
  });
  for (const type of ['keydown', 'keyup']) document.addEventListener(type, e => {
    if (active && e.key === 'Alt') { snappingDisabled = type === 'keydown'; draw(); }
  }, true);
  window.addEventListener('blur', () => { snappingDisabled = false; if (gesture) cancelDraft(); if (active) draw(); });
  document.addEventListener('keydown', e => {
    if (!active || e.target.closest('input,textarea,select,[role="combobox"],[contenteditable="true"]')) return;
    if (e.key === 'Escape' && panning()) return;
    if (e.key === 'Escape') { stop(e); if (start) { cancelDraft(); draw(); } else setActive(false); }
    else if (['Delete', 'Backspace'].includes(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) { stop(e); remove(); }
  }, true);
  document.addEventListener('click', e => {
    if (active && e.target.closest('[data-step],[data-open-tool],#edit-outlines,#edit-tabs,#edit-bridges,#edit-regions,#step-back,#step-next')) setActive(false);
  }, true);
  return { get active() { return active; }, draw, cancelDraft, reset() { state.measurements = []; setActive(false); } };
}
