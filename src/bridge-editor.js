import { formatLength, setLengthValue, toMillimeters, unitScale } from './units.js';
import { drawMarginSelection, clearMarginSelection } from './selection-overlay.js';
import { scaleBridges, unscaleBridge, pointInMaterial, bridgeKey, bridgePolygon } from './material-geometry.js';
import { pathData } from './geometry.js';
import { bridgeSnapLines, snapBridgeToLines, snapBridgeToAngles } from './bridge-snapping.js';

const widthControl = (id, label, min, value = '') => `<div class="control"><div class="control-label"><label for="${id}">${label}</label><div class="number-unit"><input id="${id}" type="number" min="${min}" max="15" step="0.1" value="${value}" /><span>mm</span></div></div><input id="${id}-range" type="range" min="${min}" max="15" step="0.1" value="${value || min}" aria-label="${id === 'selected-bridge-width' ? 'Selected Bridge Width' : label} Slider" /></div>`;

export const bridgePanel = `
<section class="bridge-inspector editing-panel" id="bridge-inspector" aria-label="Material Bridges" hidden>
  <div class="tab-inspector-heading"><h2>Bridges</h2><span id="bridge-support" class="badge"></span></div>
  <p class="panel-description">Bridges connect separate pieces of retained material to the sheet.</p>
  <div id="bridge-warning" class="bridge-warning" role="status" hidden><strong id="bridge-warning-title"></strong><p>These regions will fall out when cut.</p><p id="bridge-generation-hint" hidden>Some gaps may be too small for the current bridge width. Try a narrower Bridge Width and regenerate, or add custom bridges.</p></div>
  <div class="region-actions"><button id="generate-bridges" class="primary-button">Generate Bridges</button><button id="add-bridge" class="small-button" aria-pressed="false">Add Bridges</button></div>
  <p id="bridge-hint" class="edit-hint" role="status"></p>
  <div class="bridge-fields">${widthControl('bridge-width', 'Bridge Width', 0.5, 3)}<label class="check-label"><input id="bridge-match-features" type="checkbox" checked /><span>Match Artwork Features</span></label></div>
  <p class="control-hint">Automatic bridges follow nearby features and match their widths when possible. Custom bridges are preserved.</p>
  <label class="check-label"><input id="bridge-snap-lines" type="checkbox" checked /><span>Snap to Nearby Lines</span></label>
  <p class="control-hint">Align straight bridge edges and angles while dragging. Hold Alt/Option to move freely.</p>
  <label class="check-label"><input id="bridge-snap-angles" type="checkbox" checked /><span>Snap to Horizontal, Vertical & 45°</span></label>
  <p class="control-hint">Snap straight bridges within 5° while placing or dragging. Nearby lines take priority over angle snaps. Hold Alt/Option to move freely.</p>
  <label class="field">Bridge<select id="bridge-picker" aria-label="Select Material Bridge"></select></label>
  <div id="bridge-selection" hidden><h3 id="bridge-selection-title">Selected Bridge</h3><div class="bridge-fields">${widthControl('selected-bridge-width', 'Bridge Width', 0.5)}<label class="check-label"><input id="selected-bridge-curved" type="checkbox" disabled /><span>Curved Bridge</span></label></div><p id="bridge-curve-hint" class="control-hint" hidden>Drag the bend handle to follow the artwork.</p><div class="region-actions"><button id="snap-bridge" class="small-button" disabled>Snap to Artwork</button><button id="remove-bridge" class="small-button danger" disabled>Remove Bridge</button></div></div>
  <details class="panel-details"><summary>Advanced</summary><div class="bridge-fields">${widthControl('minimum-material-width', 'Minimum Material Width', 0.1, 0.5)}<label class="check-label"><input id="bridge-reinforcement" type="checkbox" /><span>Add Reinforcement</span></label></div><button id="clear-bridge-exclusions" class="small-button" disabled>Allow Removed Connections</button><p class="control-hint">Allow previously removed automatic connections to be generated again.</p></details>
</section>`;

export function createBridgeEditor({ state, render, mutate, snapshot, restore, record, commit, save, notify, svgPoint, screenUnit, runTask }) {
  const $ = selector => document.querySelector(selector), svg = $('#preview-svg');
  const selectionViewport = $('#canvas-viewport');
  let gesture = null, adding = false, start = null;
  let generatedArtwork = null;
  const selected = () => state.regionBridges.find(b => b.id === state.selectedRegionBridge);
  const selection = () => state.regionBridges.filter(b => state.selectedRegionBridges.includes(b.id));
  function select(ids, anchor = ids[0]) {
    state.selectedRegionBridges = [...new Set(ids)];
    state.selectedRegionBridge = anchor ?? null;
  }
  function selectBridge(id, additive = false) {
    if (id) state.showBridges = true;
    select(id ? [...(additive ? state.selectedRegionBridges : []), id] : [], id);
  }
  const toArtwork = p => ({ x: (p.x - state.scaled.padding) / state.artworkWidth, y: (p.y - state.scaled.padding) / state.artworkWidth });
  const scaled = () => scaleBridges(state.regionBridges, state.artworkWidth, state.scaled.padding);
  // Keep the bend handle on the quadratic curve, inside the bridge footprint.
  const handlePoint = (b, end) => end === 'control' ? { x: (b.a.x + 2 * b.control.x + b.b.x) / 4, y: (b.a.y + 2 * b.control.y + b.b.y) / 4 } : b[end];
  function refreshOverlay() {
    const previous = svg.querySelector('.material-bridge-overlays');
    if (previous) previous.outerHTML = overlay();
  }
  function drawGesture() {
    if (!gesture) return;
    gesture.frame = null;
    if (gesture.kind === 'box') {
      if (gesture.moved) drawMarginSelection(svg, gesture.start, gesture.point);
      return refreshOverlay();
    }
    const bridge = state.regionBridges.find(b => b.id === gesture.id);
    if (!bridge) return;
    const b = scaleBridges([bridge], state.artworkWidth, state.scaled.padding)[0];
    const group = svg.querySelector(`[data-material-bridge="${b.id}"]`)?.closest('.region-bridge');
    if (!group) return;
    // Only the small bridge polygon changes. Leave cut paths, material analysis,
    // inspector DOM and the captured handle intact until release.
    group.style.setProperty('--bridge-color', 'var(--bridge-custom)');
    const footprint = pathData(bridgePolygon(b));
    group.querySelector('.bridge-highlight').setAttribute('d', footprint);
    group.querySelector('clipPath path').setAttribute('d', footprint);
    group.querySelector('.bridge-hit').setAttribute('d', footprint);
    group.querySelector('.bridge-control-guide')?.setAttribute('d', `M${b.a.x} ${b.a.y}L${b.control?.x} ${b.control?.y}L${b.b.x} ${b.b.y}`);
    for (const handle of group.querySelectorAll('[data-bridge-end], [data-bridge-handle-visual]')) {
      const point = handlePoint(b, handle.dataset.bridgeEnd ?? handle.dataset.bridgeHandleVisual);
      handle.setAttribute('cx', point.x);
      handle.setAttribute('cy', point.y);
      if (handle.dataset.bridgeHandleVisual) {
        handle.dataset.maxRadius = b.width / 4;
        handle.setAttribute('r', Math.min(screenUnit() * 3, b.width / 4));
      }
    }
    for (const feedback of group.querySelectorAll('[data-bridge-handle-feedback]')) {
      const point = handlePoint(b, feedback.dataset.bridgeHandleFeedback);
      feedback.setAttribute('transform', `translate(${point.x} ${point.y})`);
    }
  }
  function scheduleGesture() {
    if (gesture.frame == null) gesture.frame = requestAnimationFrame(drawGesture);
  }
  function options() {
    return { ...state, padding: state.scaled.padding, sheet: state.scaled, regionBridges: scaled() };
  }
  function remove() {
    const bridges = selection(); if (!bridges.length) return;
    mutate(() => {
      state.showBridges = true;
      const automaticKeys = bridges.filter(b => b.automatic).map(b => b.key ?? bridgeKey(scaled().find(s => s.id === b.id), state.artworkWidth, state.scaled.padding));
      state.bridgeExclusions = [...new Set([...state.bridgeExclusions, ...automaticKeys])].slice(-1000);
      state.regionBridges = state.regionBridges.filter(b => !state.selectedRegionBridges.includes(b.id));
      select([]);
    });
  }
  function finishGesture(cancelled = false) {
    if (!gesture) return;
    const finished = gesture; gesture = null;
    if (finished.frame != null) cancelAnimationFrame(finished.frame);
    if (finished.kind === 'box') {
      clearMarginSelection(svg);
      if (cancelled) select(finished.previous, finished.anchor);
      render();
    } else if (cancelled) restore(finished.before);
    else record(finished.before);
    if (svg.hasPointerCapture(finished.pointerId)) svg.releasePointerCapture(finished.pointerId);
    if (!cancelled && finished.kind !== 'box') render();
    save();
  }
  function cancel() { finishGesture(true); adding = false; start = null; }
  function update() {
    if (!state.editingBridges) { adding = false; start = null; }
    select((state.selectedRegionBridges ?? (selected() ? [state.selectedRegionBridge] : [])).filter(id => state.regionBridges.some(b => b.id === id)), state.selectedRegionBridge);
    if (!state.selectedRegionBridges.includes(state.selectedRegionBridge)) state.selectedRegionBridge = state.selectedRegionBridges[0] ?? null;
    const bridges = selection();
    $('#bridge-inspector').hidden = !state.editingBridges;
    $('#edit-bridges').textContent = 'Bridges';
    $('#edit-bridges').setAttribute('aria-pressed', state.editingBridges);
    $('#edit-bridges').setAttribute('aria-expanded', state.editingBridges);
    $('#bridge-support').textContent = state.result.components ? state.result.unsupported.length ? `${state.result.unsupported.length} Unsupported` : state.result.narrowConnections || state.result.regionBridges?.some(bridge => !bridge.valid) || state.result.components.filter(component => component.sheetConnected).length > 1 ? 'Material Needs Attention' : 'All Material Connected' : 'Not Checked';
    const unsupported = state.result.unsupported?.length ?? 0;
    $('#bridge-support').classList.toggle('has-warning', unsupported > 0);
    $('#bridge-warning').hidden = !unsupported;
    $('#bridge-generation-hint').hidden = !unsupported || generatedArtwork !== state.artwork;
    $('#bridge-warning-title').textContent = `${unsupported} region${unsupported === 1 ? ' is' : 's are'} still unconnected`;
    $('#bridge-hint').textContent = adding ? (start ? 'Choose the second anchor in retained material. Cancel Placement or Escape stops adding.' : 'Choose the first anchor in retained material. Keep placing bridges; Cancel Placement or Escape stops adding.') : bridges.length ? `${bridges.length} selected. Drag a bridge to move it or its handles to adjust it; Shift adds to the selection.` : 'Select or drag a bridge, or drag a rectangle to select several.';
    $('#generate-bridges').textContent = state.regionBridges.some(bridge => bridge.automatic) ? 'Regenerate Bridges' : 'Generate Bridges';
    $('#bridge-selection').hidden = !bridges.length;
    $('#bridge-selection-title').textContent = bridges.length > 1 ? `${bridges.length} Bridges Selected` : 'Selected Bridge';
    $('#bridge-curve-hint').hidden = !bridges.some(bridge => bridge.control);
    setLengthValue($('#bridge-width'), state.bridgeWidth, state);
    setLengthValue($('#minimum-material-width'), state.minimumMaterialWidth, state);
    $('#bridge-reinforcement').checked = state.bridgeReinforcement;
    $('#bridge-match-features').checked = state.bridgeMatchFeatures;
    $('#bridge-snap-lines').checked = state.bridgeSnapLines !== false;
    $('#bridge-snap-angles').checked = state.bridgeSnapAngles !== false;
    $('#selected-bridge-curved').disabled = !selected();
    $('#selected-bridge-curved').checked = bridges.length > 0 && bridges.every(b => b.control);
    $('#selected-bridge-curved').indeterminate = bridges.some(b => b.control) && !bridges.every(b => b.control);
    $('#bridge-picker').innerHTML = '<option value="">Select a bridge…</option>' + state.regionBridges.map((b, i) => `<option value="${b.id}">Bridge ${i + 1} (${b.automatic ? 'Automatic' : 'Custom'}, ${formatLength(b.width, state)}${state.result.regionBridges?.find(r => r.id === b.id)?.valid === false ? ', Invalid' : ''})</option>`).join('');
    $('#bridge-picker').value = state.selectedRegionBridge ?? '';
    $('#selected-bridge-width').disabled = !selected();
    const mixedWidth = bridges.some(b => b.width !== bridges[0].width);
    setLengthValue($('#selected-bridge-width'), mixedWidth ? '' : selected()?.width ?? '', state);
    $('#selected-bridge-width').placeholder = mixedWidth ? 'Mixed' : '';
    for (const id of ['bridge-width', 'minimum-material-width', 'selected-bridge-width']) {
      const input = $(`#${id}`), slider = $(`#${id}-range`);
      slider.disabled = input.disabled;
      slider.value = input.value || (selected() ? selected().width / unitScale(state) : input.min);
      slider.style.setProperty('--range', `${(slider.value - slider.min) / (slider.max - slider.min) * 100}%`);
      if (id === 'selected-bridge-width' && mixedWidth) slider.setAttribute('aria-valuetext', 'Mixed widths');
      else slider.removeAttribute('aria-valuetext');
    }
    $('#snap-bridge').disabled = bridges.length !== 1 || bridges[0].automatic;
    $('#snap-bridge').title = $('#snap-bridge').disabled ? 'Select one custom bridge to snap it to a nearby feature or edge.' : 'Match a nearby feature and its width, or align with a nearby edge.';
    $('#remove-bridge').disabled = !selected();
    $('#remove-bridge').textContent = bridges.length > 1 ? `Remove ${bridges.length} Bridges` : 'Remove Bridge';
    $('#clear-bridge-exclusions').disabled = !state.bridgeExclusions.length;
    $('#add-bridge').disabled = !adding && state.regionBridges.length >= 100;
    $('#add-bridge').textContent = adding ? 'Cancel Placement' : 'Add Bridges';
    $('#add-bridge').setAttribute('aria-pressed', adding);
    svg.classList.toggle('editing-bridges', state.editingBridges);
    svg.classList.toggle('adding-bridge', state.editingBridges && adding);
  }
  function overlay() {
    if (state.view !== 'material' && !state.showBridges) return '<g class="material-bridge-overlays"></g>';
    const unit = screenUnit();
    const unsupported = state.editingBridges || state.workflowStep === 3 ? (state.result.unsupported ?? []).map(component => `<path class="unsupported-material" d="${component.paths.map(p => pathData(p)).join('')}" fill-rule="nonzero" pointer-events="none"/>`).join('') : '';
    const current = new Map(scaled().map(bridge => [bridge.id, bridge]));
    const markers = (state.view === 'material' || state.showBridges ? state.result.regionBridges ?? [] : []).map((bridge, i) => {
      const b = { ...bridge, ...current.get(bridge.id) };
      const active = state.editingBridges && state.selectedRegionBridges.includes(b.id);
      const color = !b.valid ? 'var(--bridge-invalid)' : b.automatic ? 'var(--bridge-automatic)' : 'var(--bridge-custom)';
      const clipId = `bridge-footprint-${i}`, footprint = pathData(b.polygon);
      const handles = active ? ['a', 'b', ...(b.control ? ['control'] : [])].map(end => {
        const point = handlePoint(b, end);
        return `<circle class="bridge-handle-hit" data-material-bridge="${b.id}" data-bridge-end="${end}" cx="${point.x}" cy="${point.y}" r="${unit * 9}" data-screen-radius="9" tabindex="0" role="button" aria-label="Bridge ${i + 1} ${end === 'control' ? 'bend handle' : `endpoint ${end}`}; drag or use arrow keys"/><circle class="bridge-handle" data-bridge-handle-visual="${end}" cx="${point.x}" cy="${point.y}" r="${Math.min(unit * 3, b.width / 4)}" data-screen-radius="3" data-max-radius="${b.width / 4}" clip-path="url(#${clipId})" aria-hidden="true"/><g class="bridge-handle-feedback" data-bridge-handle-feedback="${end}" transform="translate(${point.x} ${point.y})" aria-hidden="true"><circle r="${unit * 11}" data-screen-radius="11"/><circle r="${unit * 11}" data-screen-radius="11"/></g>`;
      }).join('') : '';
      return `<g class="region-bridge ${active ? 'selected' : ''}" style="--bridge-color:${color}"><defs><clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><path d="${footprint}"/></clipPath></defs><path class="bridge-highlight" d="${footprint}" clip-path="url(#${clipId})"/>${state.editingBridges ? `<path data-material-bridge="${b.id}" d="${footprint}" class="bridge-hit" tabindex="0" role="button" aria-label="Bridge ${i + 1}, ${b.valid ? 'valid anchors' : 'invalid anchors'}" aria-pressed="${active}"/>${active && b.control ? `<path d="M${b.a.x} ${b.a.y}L${b.control.x} ${b.control.y}L${b.b.x} ${b.b.y}" class="bridge-control-guide" clip-path="url(#${clipId})" pointer-events="none"/>` : ''}${handles}` : ''}</g>`;
    }).join('');
    const box = gesture?.kind === 'box' && gesture.moved ? `<rect id="bridge-selection-box" x="${Math.min(gesture.start.x, gesture.point.x)}" y="${Math.min(gesture.start.y, gesture.point.y)}" width="${Math.abs(gesture.point.x - gesture.start.x)}" height="${Math.abs(gesture.point.y - gesture.start.y)}"/>` : '';
    return `<g class="material-bridge-overlays" style="--bridge-handle-unit:${unit}px">${unsupported}${markers}${start ? `<circle cx="${start.x}" cy="${start.y}" r="${unit * 6}" data-screen-radius="6" fill="var(--bridge-custom)" pointer-events="none"/>` : ''}${box}</g>`;
  }
  $('#generate-bridges').addEventListener('click', () => {
    finishGesture(); adding = false; start = null; state.showBridges = true; render();
    runTask('bridges', { contours: state.scaled.contours, channelCuts: state.result.channelCuts, settings: options() }, 'Generating bridges…', generated => {
      const bridges = generated.map(b => {
        const { distance, polygon, valid, ...saved } = unscaleBridge(b, state.artworkWidth, state.scaled.padding);
        return saved;
      });
      generatedArtwork = state.artwork;
      mutate(() => { state.showBridges = true; state.regionBridges = bridges; select([]); });
    });
  });
  $('#add-bridge').addEventListener('click', () => { finishGesture(); adding = !adding; start = null; if (adding) state.showBridges = true; render(); });
  $('#bridge-picker').addEventListener('change', e => { commit(); selectBridge(e.target.value || null); render(); });
  $('#snap-bridge').addEventListener('click', () => {
    finishGesture();
    const bridges = selection();
    if (bridges.length !== 1 || bridges[0].automatic) return;
    const bridge = scaled().find(b => b.id === bridges[0].id);
    // The explicit action searches three times farther than dragging, while
    // using the same artwork edges. Feature continuations retain priority.
    const lineMinimum = screenUnit() * 8, tolerance = lineMinimum * 3;
    const nearby = snapBridgeToLines(bridge, bridgeSnapLines(state.result.baseCuts ?? [], lineMinimum), tolerance);
    const edgeFallback = nearby !== bridge && [nearby.a, nearby.b].every(p =>
      p.x >= 0 && p.y >= 0 && p.x <= state.scaled.width && p.y <= state.scaled.height) ? nearby : null;
    runTask('snap', { contours: state.scaled.contours, channelCuts: state.result.channelCuts, settings: options(), bridge }, 'Snapping bridge to artwork…', snapped => {
      const candidate = snapped ?? edgeFallback;
      if (!candidate) return notify('No nearby feature or edge fits this bridge. Move it closer to the artwork and try again.');
      const saved = unscaleBridge(candidate, state.artworkWidth, state.scaled.padding);
      delete saved.key;
      mutate(() => { state.showBridges = true; state.regionBridges = state.regionBridges.map(b => b.id === saved.id ? saved : b); });
      notify(snapped ? 'Bridge snapped to the existing shape and matched its width.' : 'Bridge aligned with the nearby artwork edge.');
    });
  });
  $('#remove-bridge').addEventListener('click', remove);
  $('#clear-bridge-exclusions').addEventListener('click', () => mutate(() => { state.bridgeExclusions = []; }));
  for (const [id, key, min] of [['bridge-width', 'bridgeWidth', 0.5], ['minimum-material-width', 'minimumMaterialWidth', 0.1]]) {
    $(`#${id}`).addEventListener('change', e => {
      const number = toMillimeters(e.target.value, state);
      if (e.target.value === '' || !Number.isFinite(number)) return update();
      mutate(() => { if (key === 'bridge-width') state.showBridges = true; state[key] = Math.max(min, Math.min(15, number)); });
    });
  }
  $('#bridge-reinforcement').addEventListener('change', e => mutate(() => { state.bridgeReinforcement = e.target.checked; }));
  $('#bridge-match-features').addEventListener('change', e => mutate(() => { state.bridgeMatchFeatures = e.target.checked; }));
  $('#bridge-snap-lines').addEventListener('change', e => mutate(() => { state.bridgeSnapLines = e.target.checked; }));
  $('#bridge-snap-angles').addEventListener('change', e => mutate(() => { state.bridgeSnapAngles = e.target.checked; }));
  $('#selected-bridge-curved').addEventListener('change', e => {
    if (!selected()) return;
    mutate(() => {
      state.showBridges = true;
      for (const bridge of selection()) {
        if (e.target.checked) {
          if (bridge.control) continue;
          const dx = bridge.b.x - bridge.a.x, dy = bridge.b.y - bridge.a.y;
          bridge.control = { x: (bridge.a.x + bridge.b.x) / 2 - dy * 0.2, y: (bridge.a.y + bridge.b.y) / 2 + dx * 0.2 };
        } else delete bridge.control;
        bridge.automatic = false;
      }
    });
  });
  $('#selected-bridge-width').addEventListener('change', e => {
    const value = toMillimeters(e.target.value, state);
    if (!selected() || e.target.value === '' || !Number.isFinite(value)) return update();
    mutate(() => { state.showBridges = true; for (const bridge of selection()) { bridge.width = Math.max(0.5, Math.min(15, value)); bridge.automatic = false; } });
  });
  for (const id of ['bridge-width', 'minimum-material-width', 'selected-bridge-width']) {
    const input = $(`#${id}`), slider = $(`#${id}-range`);
    slider.addEventListener('input', () => {
      input.value = slider.value;
      slider.removeAttribute('aria-valuetext');
      slider.style.setProperty('--range', `${(slider.value - slider.min) / (slider.max - slider.min) * 100}%`);
    });
    // Commit on release so geometry analysis cannot interrupt a slider drag.
    slider.addEventListener('change', () => input.dispatchEvent(new Event('change', { bubbles: true })));
  }
  selectionViewport.addEventListener('pointerdown', e => {
    if (!state.editingBridges || e.button !== 0 || e.defaultPrevented || gesture) return;
    if (adding && !svg.contains(e.target)) return;
    let point = svgPoint(e); if (!point) return;
    commit();
    if (adding) {
      if (state.regionBridges.length >= 100) return notify('You can add up to 100 bridges. Remove a bridge before adding another.', 'warning');
      if (start && state.bridgeSnapAngles !== false && !e.altKey) point = snapBridgeToAngles({ a: start, b: point }, 'b').b;
      if (!pointInMaterial(point, state.result.retainedMaterial ?? [])) return notify('Place each endpoint inside white retained material.', 'warning');
      if (!start) { start = point; render(); return; }
      if (Math.hypot(point.x - start.x, point.y - start.y) < 0.1) return;
      const bridge = { id: `bridge-${crypto.randomUUID()}`, a: toArtwork(start), b: toArtwork(point), width: state.bridgeWidth, automatic: false };
      start = null;
      mutate(() => { state.showBridges = true; state.regionBridges.push(bridge); selectBridge(bridge.id); });
      e.preventDefault(); return;
    }
    const target = e.target.closest('[data-material-bridge]');
    const previous = [...state.selectedRegionBridges], anchor = state.selectedRegionBridge;
    const id = target?.dataset.materialBridge;
    if (id) selectBridge(id, e.shiftKey || previous.includes(id));
    else if (!e.shiftKey) select([]);
    if (target?.dataset.bridgeEnd) {
      // Enlarged handle targets can overlap on short bridges. Pick the nearest
      // handle so an overlapping target cannot steal the other endpoint.
      const b = scaled().find(bridge => bridge.id === id);
      const ends = ['a', 'b', ...(b.control ? ['control'] : [])].filter(end => {
        const p = handlePoint(b, end);
        return Math.hypot(point.x - p.x, point.y - p.y) <= screenUnit() * 9;
      });
      const nearest = ends.length ? ends.reduce((best, end) => {
        const p = handlePoint(b, end), q = handlePoint(b, best);
        return Math.hypot(point.x - p.x, point.y - p.y) < Math.hypot(point.x - q.x, point.y - q.y) ? end : best;
      }) : target.dataset.bridgeEnd;
      gesture = { before: snapshot(), pointerId: e.pointerId, end: nearest, id: state.selectedRegionBridge };
    } else if (target) {
      gesture = { kind: 'move', before: snapshot(), pointerId: e.pointerId, id,
        start: point, original: structuredClone(selected()), x: e.clientX, y: e.clientY, moved: false };
    } else if (!target) {
      gesture = { kind: 'box', pointerId: e.pointerId, start: point, point, x: e.clientX, y: e.clientY, moved: false, previous, anchor, additive: e.shiftKey };
    }
    if (gesture && gesture.kind !== 'box') {
      gesture.raw = structuredClone(selected());
      gesture.snapLines = bridgeSnapLines(state.result.baseCuts ?? [], screenUnit() * 8);
    }
    if (gesture && e.isTrusted) svg.setPointerCapture(e.pointerId);
    e.preventDefault();
    // Selection changes need only the editor overlays and inspector, not a
    // reconstruction of every cut path in the artwork.
    update(); refreshOverlay();
  });
  selectionViewport.addEventListener('pointermove', e => {
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    const p = svgPoint(e); if (!p) return;
    if (gesture.kind === 'box') {
      if (!gesture.moved && Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) < 3) return;
      gesture.moved = true; gesture.point = p;
      const minX = Math.min(gesture.start.x, p.x), maxX = Math.max(gesture.start.x, p.x);
      const minY = Math.min(gesture.start.y, p.y), maxY = Math.max(gesture.start.y, p.y);
      // Use each bridge's center, including the bend of a quadratic bridge.
      const inside = (state.result.regionBridges ?? []).filter(b => {
        const x = b.control ? (b.a.x + 2 * b.control.x + b.b.x) / 4 : (b.a.x + b.b.x) / 2;
        const y = b.control ? (b.a.y + 2 * b.control.y + b.b.y) / 4 : (b.a.y + b.b.y) / 2;
        return x >= minX && x <= maxX && y >= minY && y <= maxY;
      }).map(b => b.id);
      if (inside.length) state.showBridges = true;
      select([...(gesture.additive ? gesture.previous : []), ...inside]);
      scheduleGesture(); return;
    }
    const bridge = selected(); if (!bridge) return finishGesture(true);
    if (gesture.kind === 'move') {
      if (!gesture.moved && Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) < 3) return;
      gesture.moved = true;
      const original = gesture.original, padding = state.scaled.padding, width = state.artworkWidth;
      // Clamp the translation as a whole so neither anchor leaves the sheet
      // and the bridge's length and curve remain unchanged.
      const dx = Math.max(-padding / width - Math.min(original.a.x, original.b.x),
        Math.min((state.scaled.width - padding) / width - Math.max(original.a.x, original.b.x), (p.x - gesture.start.x) / width));
      const dy = Math.max(-padding / width - Math.min(original.a.y, original.b.y),
        Math.min((state.scaled.height - padding) / width - Math.max(original.a.y, original.b.y), (p.y - gesture.start.y) / width));
      for (const end of ['a', 'b', ...(original.control ? ['control'] : [])]) {
        bridge[end] = { x: original[end].x + dx, y: original[end].y + dy };
      }
    } else {
      // Always start from the unsnapped bridge so a snapped angle cannot
      // accumulate or pull the opposite anchor farther with each pointer event.
      Object.assign(bridge, structuredClone(gesture.raw));
      const point = toArtwork({ x: Math.max(0, Math.min(state.scaled.width, p.x)), y: Math.max(0, Math.min(state.scaled.height, p.y)) });
      // The midpoint of a quadratic is (a + 2 * control + b) / 4.
      bridge[gesture.end] = gesture.end === 'control' ? { x: 2 * point.x - (bridge.a.x + bridge.b.x) / 2, y: 2 * point.y - (bridge.a.y + bridge.b.y) / 2 } : point;
    }
    if ((state.bridgeSnapLines !== false || state.bridgeSnapAngles !== false) && !e.altKey) {
      const physical = scaleBridges([bridge], state.artworkWidth, state.scaled.padding)[0];
      const angled = state.bridgeSnapAngles !== false ? snapBridgeToAngles(physical, gesture.end) : physical;
      const lined = state.bridgeSnapLines !== false ? snapBridgeToLines(physical, gesture.snapLines, screenUnit() * 8, gesture.end) : physical;
      const inSheet = candidate => [candidate.a, candidate.b].every(p => p.x >= 0 && p.y >= 0 && p.x <= state.scaled.width && p.y <= state.scaled.height);
      // Prefer an eligible nearby line throughout its snap range so small
      // pointer movements cannot switch between line and angle candidates.
      // Both candidates use the raw drag; ignore snaps outside the sheet.
      const snapped = lined !== physical && inSheet(lined) ? lined : angled;
      if (snapped !== physical && inSheet(snapped)) {
        Object.assign(bridge, unscaleBridge(snapped, state.artworkWidth, state.scaled.padding));
      }
    }
    bridge.automatic = false; scheduleGesture();
  });
  selectionViewport.addEventListener('pointerup', e => { if (gesture?.pointerId === e.pointerId) finishGesture(); });
  selectionViewport.addEventListener('pointercancel', e => { if (gesture?.pointerId === e.pointerId) finishGesture(true); });
  selectionViewport.addEventListener('lostpointercapture', e => { if (gesture?.pointerId === e.pointerId) finishGesture(true); });
  svg.addEventListener('click', e => {
    if (state.editingBridges && e.detail === 0 && e.target.closest('[data-material-bridge]')) { selectBridge(e.target.closest('[data-material-bridge]').dataset.materialBridge, e.shiftKey); render(); }
  });
  document.addEventListener('keydown', e => {
    if (!state.editingBridges || e.defaultPrevented) return;
    if (e.key === 'Escape') { e.preventDefault(); cancel(); render(); return; }
    if (e.target.closest('input,select,textarea,[contenteditable]')) return;
    const marker = e.target.closest('[data-material-bridge]');
    if (marker && ['Enter', ' '].includes(e.key)) {
      e.preventDefault(); selectBridge(marker.dataset.materialBridge, e.shiftKey); render();
      svg.querySelector(`[data-material-bridge="${state.selectedRegionBridge}"]`)?.focus();
    }
    if (['Delete', 'Backspace'].includes(e.key) && selected()) { e.preventDefault(); remove(); }
    const target = e.target.closest('[data-bridge-end]');
    if (target && e.key.startsWith('Arrow')) {
      e.preventDefault(); state.selectedRegionBridge = target.dataset.materialBridge;
      const end = target.dataset.bridgeEnd, delta = (e.shiftKey ? 1 : 0.1) / state.artworkWidth;
      mutate(() => { state.showBridges = true; const bridge = selected(); bridge[end][e.key === 'ArrowLeft' || e.key === 'ArrowRight' ? 'x' : 'y'] += e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -delta : delta; bridge.automatic = false; });
      svg.querySelector(`[data-material-bridge="${state.selectedRegionBridge}"][data-bridge-end="${end}"]`)?.focus();
    }
  });
  return { update, overlay, finishGesture, cancel, get dragging() { return Boolean(gesture); } };
}
