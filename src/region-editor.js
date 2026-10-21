import { formatLength, setLengthValue, toMillimeters } from './units.js';
import { orderControls } from './ordered-list.js';
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
  const shapeSettings = [['roundedTabs', 'regionRoundedTabs'], ['roundedChannelCorners', 'regionRoundedChannelCorners']];
  const taperLength = region => region.taperLength ?? createChannelWidthProfile(region.contourId, state).regions.find(r => r.id === region.id).taper;
  function readRegionControls(region) {
    state.regionWidth = region.width;
    state.regionTaperLength = taperLength(region);
    state.regionScope = region.contourId ?? 'all';
    for (const [property, key] of shapeSettings) state[key] = region[property] === undefined ? 'inherit' : String(region[property]);
  }
  function select(id) {
    commit();
    pickingLayer = false;
    state.selectedRegion = id;
    const region = selected();
    if (region) readRegionControls(region);
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
      state.regions.push({ id, label: `Region ${Math.max(0, ...state.regions.map(r => Number(r.label?.match(/\d+$/)?.[0]) || 0)) + 1}`, points: structuredClone(state.regionDraft), width: state.regionWidth, taperLength: state.regionTaperLength, ...Object.fromEntries(shapeSettings.filter(([, key]) => state[key] !== 'inherit').map(([property, key]) => [property, state[key] === 'true'])), contourId: state.regionScope === 'all' ? null : state.regionScope });
      state.selectedRegion = null; state.regionDraft = []; hover = null; lastCornerClick = null;
    });
  }
  function update() {
    if (!state.editingRegions || pickingArtwork !== state.artwork || !pickableContours().length) pickingLayer = false;
    if (state.selectedRegion && !selected()) state.selectedRegion = null;
    const region = selected();
    if (region) readRegionControls(region);
    const channelContours = state.artwork.contours.filter(c => materialMode(c, state) === 'outline');
    if (state.regionScope !== 'all' && !channelContours.some(c => c.id === state.regionScope)) state.regionScope = channelContours[0]?.id ?? 'all';
    $('#edit-regions').textContent = 'Override Regions';
    $('#edit-regions').setAttribute('aria-pressed', state.editingRegions);
    $('#edit-regions').setAttribute('aria-expanded', state.editingRegions);
    $('#region-inspector').hidden = !state.editingRegions;
    $('#region-count').textContent = `${state.regions.length} Region${state.regions.length === 1 ? '' : 's'}`;
    $('#region-picker').innerHTML = '<option value="">Select a region…</option>' + state.regions.map((r, i) => `<option value="${r.id}">${r.label ?? `Region ${i + 1}`} (${formatLength(r.width, state)}, ${r.contourId === null ? 'All Objects' : `Object ${state.artwork.contours.findIndex(c => c.id === r.contourId) + 1}`})</option>`).join('');
    $('#region-picker').value = state.selectedRegion ?? '';
    $('#region-scope').innerHTML = '<option value="all">All Objects</option>' + channelContours.map(c => `<option value="${c.id}">Object ${state.artwork.contours.indexOf(c) + 1}${state.hiddenContours.includes(c.id) ? ' (Hidden)' : ''}</option>`).join('');
    // A region assigned before an outline became a cut-away retains its scope.
    if (region?.contourId && !channelContours.some(c => c.id === region.contourId)) $('#region-scope').insertAdjacentHTML('beforeend', `<option value="${region.contourId}">Object ${state.artwork.contours.findIndex(c => c.id === region.contourId) + 1} (Inactive: Keep / Cut Away)</option>`);
    $('#region-scope').value = region?.contourId ?? (region ? 'all' : state.regionScope);
    $('#select-region-layer').textContent = pickingLayer ? 'Cancel' : 'Pick Object';
    $('#select-region-layer').setAttribute('aria-pressed', pickingLayer);
    $('#select-region-layer').disabled = !pickableContours().length;
    for (const [id, value] of [['region-width', state.regionWidth], ['region-taper-length', state.regionTaperLength]]) {
      setLengthValue($(`#${id}`), value, state);
      const slider = $(`#${id}-range`);
      setLengthValue(slider, value, state);
      slider.style.setProperty('--range', `${(slider.value - slider.min) / (slider.max - slider.min) * 100}%`);
    }
    for (const [property, key] of shapeSettings) $(`#region-${property}`).value = state[key];
    $('#draw-region').disabled = state.drawingRegion || state.regions.length >= 100;
    $('#draw-region').setAttribute('aria-pressed', state.drawingRegion);
    $('#finish-region').hidden = !state.drawingRegion;
    $('#finish-region').disabled = state.regionDraft.length < 3;
    $('#cancel-region').hidden = !state.drawingRegion;
    $('#region-selection-settings').hidden = !region;
    $('#remove-region').disabled = !region || state.drawingRegion;
    $('#region-picker').disabled = state.drawingRegion;
    $('#region-hint').textContent = pickingLayer ? 'Choose an Outline object in the canvas. Escape cancels.' : state.drawingRegion ? `${state.regionDraft.length} corners. Click to add; double-click or Enter finishes a region. Keep drawing regions; Cancel or Escape stops drawing.` : region && region.contourId && !channelContours.some(c => c.id === region.contourId) ? 'This region is inactive because its object no longer uses Outline.' : region ? 'Adjust this region’s width and styles. Drag corners or the interior to reshape it.' : 'Draw a polygon, then select it to adjust its width, scope, and styles.';
    const list = $('#region-list');
    const listKey = JSON.stringify([state.regions, state.selectedRegion, state.drawingRegion, state.units]);
    if (list.regionKey !== listKey) {
      const focus = list.contains(document.activeElement) ? document.activeElement.id : null;
      const scroll = list.scrollTop;
      list.innerHTML = [...state.regions].reverse().map((r, index) => {
        const label = r.label ?? `Region ${state.regions.indexOf(r) + 1}`;
        return `<div class="region-row ${state.selectedRegion === r.id ? 'selected' : ''}" role="listitem" data-order-id="${r.id}" data-order-label="${label}">${orderControls(`region-${r.id}`, label, index, state.regions.length, state.drawingRegion)}<button data-select-region="${r.id}" aria-pressed="${state.selectedRegion === r.id}"><strong>${label}</strong><small>${formatLength(r.width, state)}, ${r.contourId === null ? 'All Objects' : `Object ${state.artwork.contours.findIndex(c => c.id === r.contourId) + 1}`}</small></button></div>`;
      }).join('') || '<p class="empty-state">No override regions yet.</p>';
      list.regionKey = listKey; list.scrollTop = scroll;
      if (focus) document.getElementById(focus)?.focus({ preventScroll: true });
    }
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
      return `<g class="width-region ${active ? 'selected' : ''}"><path data-region="${r.id}" d="${pathData(r.points)}" tabindex="0" role="button" aria-label="Region ${i + 1}, ${formatLength(r.width, state)}, ${r.contourId === null ? 'all objects' : `object ${state.artwork.contours.findIndex(c => c.id === r.contourId) + 1}`}" aria-pressed="${active}" vector-effect="non-scaling-stroke"/><text x="${r.points[0].x}" y="${r.points[0].y - unit * 9}" font-size="${unit * 11}" pointer-events="none">${r.label ?? `Region ${i + 1}`} (${formatLength(r.width, state)})</text>${active && !state.drawingRegion ? r.points.map((p, j) => `<circle data-region="${r.id}" data-region-vertex="${j}" cx="${p.x}" cy="${p.y}" r="${unit * 6}" data-screen-radius="6" tabindex="0" role="button" aria-label="Region ${i + 1} corner ${j + 1}; drag or use arrow keys to move" vector-effect="non-scaling-stroke"/>`).join('') : ''}</g>`;
    }).join('');
    const points = toSheet(state.regionDraft);
    const draft = state.drawingRegion ? `<g class="region-draft" pointer-events="none"><path d="${pathData(hover ? [...points, hover] : points, points.length >= 3)}" vector-effect="non-scaling-stroke"/>${points.map((p, i) => `<circle cx="${p.x}" cy="${p.y}" r="${unit * (i ? 4 : 7)}" data-screen-radius="${i ? 4 : 7}" vector-effect="non-scaling-stroke"/>`).join('')}</g>` : '';
    const targets = pickingLayer ? `<g class="region-layer-targets">${pickableContours().map(c => {
      const number = state.artwork.contours.findIndex(outline => outline.id === c.id) + 1;
      return `<g data-region-layer="${c.id}" class="region-layer-target" tabindex="0" role="button" aria-label="Select Object ${number} for this region"><path class="region-layer-guide" d="${pathData(c.points, c.closed)}" vector-effect="non-scaling-stroke"/><path class="region-layer-hit" d="${pathData(c.points, c.closed)}" stroke-width="${Math.max(unit * 20, state.channelWidth, ...state.regions.map(r => r.width))}"/></g>`;
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
  $('#region-list').addEventListener('click', event => { const button = event.target.closest('[data-select-region]'); if (button && !state.drawingRegion) select(button.dataset.selectRegion); });
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
  for (const [property, key] of shapeSettings) {
    $(`#region-${property}`).addEventListener('change', event => {
      const value = event.target.value;
      const apply = () => {
        state[key] = value;
        const region = selected();
        if (region) {
          if (value === 'inherit') delete region[property];
          else region[property] = value === 'true';
        }
      };
      if (selected()) mutate(apply);
      else { apply(); render(); }
    });
  }
  for (const [id, property, stateKey] of [['region-width', 'width', 'regionWidth'], ['region-taper-length', 'taperLength', 'regionTaperLength'], ['region-scope', 'contourId', 'regionScope']]) {
    $(`#${id}`).addEventListener('change', e => {
      const numeric = property !== 'contourId';
      if (!numeric) pickingLayer = false;
      let value = numeric ? Number(e.target.value) : e.target.value === 'all' ? null : e.target.value;
      if (numeric) {
        if (!e.target.value || !Number.isFinite(value)) return update();
        value = toMillimeters(Math.max(Number(e.target.min), Math.min(Number(e.target.max), value)), state);
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
      state[stateKey] = property === 'taperLength' ? Math.round(toMillimeters(e.target.value, state) * 10) / 10 : toMillimeters(e.target.value, state);
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
    if (!state.editingRegions || !state.drawingRegion || !state.regionDraft.length || pickingLayer || gesture) return;
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
    if (!cancelled) render();
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
    if (!state.editingRegions || e.defaultPrevented) return;
    if (e.key === 'Escape' && (state.drawingRegion || gesture)) {
      e.preventDefault(); finishGesture(true); cancelDrawing(); return;
    }
    if (e.target.closest('input, select, textarea, [contenteditable="true"]')) return;
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
  return { update, overlay, finishGesture, cancelDrawing, get dragging() { return Boolean(gesture); } };
}
