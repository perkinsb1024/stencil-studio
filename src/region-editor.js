import { pathData } from './geometry.js';
import { scaleRegions, validPolygon, channelWidthAt, createChannelWidthProfile } from './regions.js';
import { nearestOnContour } from './tab-layout.js';
import { materialMode } from './material-geometry.js';

export function createRegionEditor({ state, render, mutate, snapshot, restore, record, beginEdit, commit, save, notify, svgPoint, screenUnit }) {
  const $ = selector => document.querySelector(selector);
  const svg = $('#preview-svg');
  let gesture = null, hover = null, pickingLayer = false, pickingArtwork = null, lastCornerClick = null;
  const pickableContours = () => state.scaled.contours.filter(c => !state.hiddenContours.includes(c.id) && materialMode(c, state) === 'outline');
  const selected = () => state.regions.find(region => region.id === state.selectedRegion);
  const toArtwork = p => ({ x: (p.x - state.scaled.padding) / state.artworkWidth, y: (p.y - state.scaled.padding) / state.artworkWidth });
  const toSheet = points => scaleRegions([{ points }], state.artworkWidth, state.scaled.padding)[0].points;
  const taperLength = region => region.taperLength ?? createChannelWidthProfile(region.contourId, state).regions.find(r => r.id === region.id).taper;
  function select(id) {
    commit();
    pickingLayer = false;
    state.selectedRegion = id;
    const region = selected();
    if (region) { state.regionWidth = region.width; state.regionTaperLength = taperLength(region); state.regionScope = region.contourId ?? 'all'; }
    state.drawingRegion = false; state.regionDraft = []; hover = null;
    render();
  }
  function cancelDrawing() {
    pickingLayer = false;
    state.drawingRegion = false; state.regionDraft = []; hover = null;
    render();
  }
  function finish() {
    pickingLayer = false;
    if (!validPolygon(state.regionDraft)) return notify('Use at least three corners and keep the polygon edges from crossing.', 'warning');
    if (state.regions.length >= 100) return notify('You can add up to 100 regions. Remove a region before adding another.', 'warning');
    mutate(() => {
      const id = `region-${crypto.randomUUID()}`;
      state.regions.push({ id, points: structuredClone(state.regionDraft), width: state.regionWidth, taperLength: state.regionTaperLength, contourId: state.regionScope === 'all' ? null : state.regionScope });
      state.selectedRegion = id; state.drawingRegion = false; state.regionDraft = []; hover = null;
    });
  }
  function update() {
    if (!state.editingRegions || pickingArtwork !== state.artwork || !pickableContours().length) pickingLayer = false;
    if (state.selectedRegion && !selected()) state.selectedRegion = null;
    const region = selected();
    if (region) { state.regionWidth = region.width; state.regionTaperLength = taperLength(region); state.regionScope = region.contourId ?? 'all'; }
    const channelContours = state.artwork.contours.filter(c => materialMode(c, state) === 'outline');
    if (state.regionScope !== 'all' && !channelContours.some(c => c.id === state.regionScope)) state.regionScope = channelContours[0]?.id ?? 'all';
    $('#edit-regions').textContent = state.editingRegions ? 'Done editing' : 'Edit regions';
    $('#edit-regions').setAttribute('aria-pressed', state.editingRegions);
    $('#edit-regions').setAttribute('aria-expanded', state.editingRegions);
    $('#region-inspector').hidden = !state.editingRegions;
    $('#region-count').textContent = `${state.regions.length} region${state.regions.length === 1 ? '' : 's'}`;
    $('#region-picker').innerHTML = '<option value="">Select a region…</option>' + state.regions.map((r, i) => `<option value="${r.id}">Region ${i + 1} · ${r.width} mm · ${r.contourId === null ? 'All layers' : `Layer ${state.artwork.contours.findIndex(c => c.id === r.contourId) + 1}`}</option>`).join('');
    $('#region-picker').value = state.selectedRegion ?? '';
    $('#region-scope').innerHTML = '<option value="all">All layers</option>' + channelContours.map(c => `<option value="${c.id}">Layer ${state.artwork.contours.indexOf(c) + 1}${state.hiddenContours.includes(c.id) ? ' · Hidden' : ''}</option>`).join('');
    // A region assigned before an outline became a cut-away retains its scope.
    if (region?.contourId && !channelContours.some(c => c.id === region.contourId)) $('#region-scope').insertAdjacentHTML('beforeend', `<option value="${region.contourId}">Layer ${state.artwork.contours.findIndex(c => c.id === region.contourId) + 1} · Keep / Cut Away</option>`);
    $('#region-scope').value = region?.contourId ?? (region ? 'all' : state.regionScope);
    $('#select-region-layer').textContent = pickingLayer ? 'Cancel' : 'Select';
    $('#select-region-layer').setAttribute('aria-pressed', pickingLayer);
    $('#select-region-layer').disabled = !pickableContours().length;
    for (const [id, value] of [['region-width', state.regionWidth], ['region-taper-length', state.regionTaperLength]]) {
      $(`#${id}`).value = id === 'region-taper-length' ? value.toFixed(1) : value;
      const slider = $(`#${id}-range`);
      slider.value = value;
      slider.style.setProperty('--range', `${(slider.value - slider.min) / (slider.max - slider.min) * 100}%`);
    }
    $('#draw-region').disabled = state.drawingRegion || state.regions.length >= 100;
    $('#finish-region').hidden = !state.drawingRegion;
    $('#finish-region').disabled = state.regionDraft.length < 3;
    $('#cancel-region').hidden = !state.drawingRegion;
    $('#remove-region').disabled = !region || state.drawingRegion;
    $('#region-picker').disabled = state.drawingRegion;
    $('#region-hint').textContent = pickingLayer
      ? 'Click a layer in the preview to select it. Escape or Cancel stops selection.'
      : state.drawingRegion
      ? `Click to add corners (${state.regionDraft.length}/200). Double-click to place the final corner and finish, or click the first corner to close it. Enter finishes; Backspace removes the last corner; Escape cancels.`
      : 'Draw a polygon around a tight area, then set its channel width, taper length and layer. Select a region to adjust it; drag its corners or interior to reshape or move it. Later regions take priority where they overlap. Keep and Cut Away treatments use their original boundaries.';
    svg.classList.toggle('editing-regions', state.editingRegions);
    svg.classList.toggle('drawing-region', state.editingRegions && state.drawingRegion);
    svg.classList.toggle('picking-region-layer', pickingLayer);
    save();
  }
  function overlay() {
    if (!state.editingRegions) return '';
    const unit = screenUnit();
    const shapes = state.scaled.regions.map((r, i) => {
      const active = r.id === state.selectedRegion;
      return `<g class="width-region ${active ? 'selected' : ''}"><path data-region="${r.id}" d="${pathData(r.points)}" tabindex="0" role="button" aria-label="Region ${i + 1}, ${r.width} millimeters, ${r.contourId === null ? 'all layers' : `layer ${state.artwork.contours.findIndex(c => c.id === r.contourId) + 1}`}" aria-pressed="${active}" vector-effect="non-scaling-stroke"/><text x="${r.points[0].x}" y="${r.points[0].y - unit * 9}" font-size="${unit * 11}" pointer-events="none">${i + 1} · ${r.width} mm</text>${active && !state.drawingRegion ? r.points.map((p, j) => `<circle data-region="${r.id}" data-region-vertex="${j}" cx="${p.x}" cy="${p.y}" r="${unit * 6}" tabindex="0" role="button" aria-label="Region ${i + 1} corner ${j + 1}; drag or use arrow keys to move" vector-effect="non-scaling-stroke"/>`).join('') : ''}</g>`;
    }).join('');
    const points = toSheet(state.regionDraft);
    const draft = state.drawingRegion ? `<g class="region-draft" pointer-events="none"><path d="${pathData(hover ? [...points, hover] : points, points.length >= 3)}" vector-effect="non-scaling-stroke"/>${points.map((p, i) => `<circle cx="${p.x}" cy="${p.y}" r="${unit * (i ? 4 : 7)}" vector-effect="non-scaling-stroke"/>`).join('')}</g>` : '';
    const targets = pickingLayer ? `<g class="region-layer-targets">${pickableContours().map(c => {
      const number = state.artwork.contours.findIndex(outline => outline.id === c.id) + 1;
      return `<g data-region-layer="${c.id}" class="region-layer-target" tabindex="0" role="button" aria-label="Select Layer ${number} for this region"><path class="region-layer-guide" d="${pathData(c.points, c.closed)}" vector-effect="non-scaling-stroke"/><path class="region-layer-hit" d="${pathData(c.points, c.closed)}" stroke-width="${Math.max(unit * 20, state.channelWidth, ...state.regions.map(r => r.width))}"/></g>`;
    }).join('')}</g>` : '';
    return `<g class="region-overlays">${shapes}${draft}${targets}</g>`;
  }
  function refreshOverlay() {
    svg.querySelector('.region-overlays')?.remove();
    svg.insertAdjacentHTML('beforeend', overlay());
  }
  function nearestLayer(event) {
    const point = svgPoint(event); if (!point) return null;
    let nearest = null;
    for (const contour of pickableContours()) {
      const projected = nearestOnContour(contour, point);
      const width = channelWidthAt(projected.point, contour.id, { ...state, regions: state.scaled.regions });
      if (projected.distance > Math.max(screenUnit() * 10, width / 2 + screenUnit() * 3)) continue;
      if (!nearest || projected.distance < nearest.distance) nearest = { ...projected, contour };
    }
    return nearest?.contour ?? null;
  }
  function pickLayer(id) {
    pickingLayer = false;
    $('#region-scope').value = id;
    $('#region-scope').dispatchEvent(new Event('change', { bubbles: true }));
    $('#select-region-layer').focus({ preventScroll: true });
  }
  $('#select-region-layer').addEventListener('click', () => {
    commit(); finishGesture();
    pickingLayer = !pickingLayer; pickingArtwork = state.artwork; hover = null; render();
  });
  $('#region-picker').addEventListener('change', e => select(e.target.value || null));
  $('#draw-region').addEventListener('click', () => {
    pickingLayer = false;
    state.selectedRegion = null; state.regionDraft = []; state.drawingRegion = true; hover = null; render();
    svg.focus({ preventScroll: true });
  });
  $('#finish-region').addEventListener('click', finish);
  $('#cancel-region').addEventListener('click', cancelDrawing);
  $('#remove-region').addEventListener('click', () => mutate(() => {
    state.regions = state.regions.filter(r => r.id !== state.selectedRegion); state.selectedRegion = null;
  }));
  for (const [id, property, stateKey] of [['region-width', 'width', 'regionWidth'], ['region-taper-length', 'taperLength', 'regionTaperLength'], ['region-scope', 'contourId', 'regionScope']]) {
    $(`#${id}`).addEventListener('change', e => {
      const numeric = property !== 'contourId';
      if (!numeric) pickingLayer = false;
      let value = numeric ? Number(e.target.value) : e.target.value === 'all' ? null : e.target.value;
      if (numeric) {
        if (!e.target.value || !Number.isFinite(value)) return update();
        value = Math.max(Number(e.target.min), Math.min(Number(e.target.max), value));
        if (property === 'taperLength') value = Math.round(value * 10) / 10;
      }
      const apply = () => {
        if (selected()) selected()[property] = value;
        state[stateKey] = value ?? 'all';
      };
      if (selected()) mutate(apply);
      else { apply(); render(); }
    });
    if (property === 'contourId') continue;
    const slider = $(`#${id}-range`);
    slider.addEventListener('input', e => {
      const region = selected();
      if (region) beginEdit();
      state[stateKey] = property === 'taperLength' ? Math.round(Number(e.target.value) * 10) / 10 : Number(e.target.value);
      if (region) region[property] = state[stateKey];
      render();
    });
    slider.addEventListener('change', commit);
    slider.addEventListener('blur', commit);
  }
  svg.addEventListener('click', e => {
    if (state.editingRegions && pickingLayer) {
      const layer = e.detail === 0 ? e.target.closest('[data-region-layer]')?.dataset.regionLayer : null;
      const id = layer ?? nearestLayer(e)?.id;
      if (id) pickLayer(id);
      return;
    }
    if (!state.editingRegions || !state.drawingRegion || gesture) return;
    const point = svgPoint(e); if (!point) return;
    if (e.detail > 1) {
      if (e.detail === 2) completeAt(point, lastCornerClick?.draft === state.regionDraft && lastCornerClick.index === state.regionDraft.length - 1);
      return;
    }
    lastCornerClick = null;
    const points = toSheet(state.regionDraft);
    if (points.length >= 3 && Math.hypot(point.x - points[0].x, point.y - points[0].y) <= screenUnit() * 10) return finish();
    if (points.length && Math.hypot(point.x - points.at(-1).x, point.y - points.at(-1).y) < screenUnit() * 3) return;
    if (points.length >= 200) return notify('A polygon can have up to 200 corners. Finish or cancel this polygon.', 'warning');
    state.regionDraft.push(toArtwork(point));
    lastCornerClick = { draft: state.regionDraft, index: state.regionDraft.length - 1 };
    hover = null; render();
  });
  function completeAt(point, replaceLast = false) {
    const points = toSheet(state.regionDraft);
    // A native double-click includes a first click that already placed this
    // corner. Refine it at the final location even if the mouse moved slightly.
    if (points.length && (replaceLast || Math.hypot(point.x - points.at(-1).x, point.y - points.at(-1).y) < screenUnit() * 3)) state.regionDraft[state.regionDraft.length - 1] = toArtwork(point);
    else {
      if (points.length >= 200) return notify('A polygon can have up to 200 corners. Finish or cancel this polygon.', 'warning');
      state.regionDraft.push(toArtwork(point));
    }
    lastCornerClick = null; hover = null;
    render(); finish();
  }
  svg.addEventListener('dblclick', e => {
    if (!state.editingRegions || !state.drawingRegion || pickingLayer || gesture) return;
    e.preventDefault();
    const point = svgPoint(e); if (point) completeAt(point);
  });
  svg.addEventListener('pointerdown', e => {
    if (!state.editingRegions || pickingLayer || state.drawingRegion || e.button !== 0 || gesture) return;
    const target = e.target.closest('[data-region]');
    if (!target) return select(null);
    const point = svgPoint(e); if (!point) return;
    commit();
    select(target.dataset.region);
    gesture = { pointerId: e.pointerId, start: toArtwork(point), before: snapshot(), original: structuredClone(selected().points), vertex: target.hasAttribute('data-region-vertex') ? Number(target.dataset.regionVertex) : null };
    if (e.isTrusted) svg.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  svg.addEventListener('pointermove', e => {
    if (!state.editingRegions) return;
    if (pickingLayer) {
      const id = nearestLayer(e)?.id;
      for (const target of svg.querySelectorAll('[data-region-layer]')) target.classList.toggle('hovered', target.dataset.regionLayer === id);
      return;
    }
    const point = svgPoint(e); if (!point) return;
    if (state.drawingRegion) { hover = point; refreshOverlay(); return; }
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    const p = toArtwork(point), dx = p.x - gesture.start.x, dy = p.y - gesture.start.y;
    const points = gesture.original.map((v, i) => gesture.vertex === null || gesture.vertex === i ? { x: v.x + dx, y: v.y + dy } : v);
    if (validPolygon(points)) { selected().points = points; render(); }
  });
  function finishGesture(cancelled = false) {
    if (!gesture) return;
    const previous = gesture; gesture = null;
    if (cancelled) restore(previous.before); else record(previous.before);
    if (svg.hasPointerCapture(previous.pointerId)) svg.releasePointerCapture(previous.pointerId);
    save();
  }
  svg.addEventListener('pointerup', e => { if (gesture?.pointerId === e.pointerId) finishGesture(); });
  svg.addEventListener('pointercancel', e => { if (gesture?.pointerId === e.pointerId) finishGesture(true); });
  svg.addEventListener('lostpointercapture', e => { if (gesture?.pointerId === e.pointerId) finishGesture(true); });
  svg.addEventListener('pointerleave', () => { hover = null; if (state.drawingRegion) refreshOverlay(); });
  document.addEventListener('keydown', e => {
    if (state.editingRegions && pickingLayer) {
      if (e.key === 'Escape') {
        e.preventDefault(); pickingLayer = false; render(); $('#select-region-layer').focus({ preventScroll: true });
      } else if (['Enter', ' '].includes(e.key) && e.target.closest('[data-region-layer]')) {
        e.preventDefault(); pickLayer(e.target.closest('[data-region-layer]').dataset.regionLayer);
      }
      return;
    }
    if (!state.editingRegions || e.target.closest('input, select, textarea, [contenteditable="true"]')) return;
    if (state.drawingRegion && ['Enter', 'Escape', 'Backspace', 'Delete'].includes(e.key)) {
      e.preventDefault();
      if (e.key === 'Enter') finish();
      else if (e.key === 'Escape') cancelDrawing();
      else { state.regionDraft.pop(); hover = null; render(); }
    } else if (e.key === 'Escape' && gesture) { e.preventDefault(); finishGesture(true); }
    else if (!state.drawingRegion && (e.key === 'Delete' || e.key === 'Backspace') && selected()) {
      e.preventDefault(); $('#remove-region').click();
    } else if (!state.drawingRegion && (e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-region]')) {
      e.preventDefault();
      const id = e.target.dataset.region; select(id);
      svg.querySelector(`path[data-region="${id}"]`)?.focus({ preventScroll: true });
    } else if (!state.drawingRegion && e.key.startsWith('Arrow') && e.target.hasAttribute('data-region-vertex')) {
      e.preventDefault();
      const id = e.target.dataset.region, index = Number(e.target.dataset.regionVertex);
      const region = state.regions.find(r => r.id === id), points = structuredClone(region.points);
      const delta = screenUnit() / state.artworkWidth * (e.shiftKey ? 10 : 1);
      if (e.key === 'ArrowLeft') points[index].x -= delta;
      if (e.key === 'ArrowRight') points[index].x += delta;
      if (e.key === 'ArrowUp') points[index].y -= delta;
      if (e.key === 'ArrowDown') points[index].y += delta;
      if (validPolygon(points)) mutate(() => { region.points = points; });
      svg.querySelector(`[data-region="${id}"][data-region-vertex="${index}"]`)?.focus({ preventScroll: true });
    }
  });
  return { update, overlay, finishGesture, cancelDrawing };
}
