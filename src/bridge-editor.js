import { scaleBridges, unscaleBridge, pointInMaterial, bridgeKey, bridgePolygon } from './material-geometry.js';
import { pathData } from './geometry.js';
import { bridgeSnapLines, snapBridgeToLines, snapBridgeToAngles } from './bridge-snapping.js';

const widthControl = (id, label, min, value = '') => `<div class="control"><div class="control-label"><label for="${id}">${label}</label><div class="number-unit"><input id="${id}" type="number" min="${min}" max="15" step="0.1" value="${value}" /><span>mm</span></div></div><input id="${id}-range" type="range" min="${min}" max="15" step="0.1" value="${value || min}" aria-label="${id === 'selected-bridge-width' ? 'Selected Bridge Width' : label} Slider" /></div>`;

export const bridgePanel = `
<section class="bridge-inspector editing-panel" id="bridge-inspector" aria-label="Material Bridges" hidden>
  <div class="tab-inspector-heading"><h2>Bridges</h2><span id="bridge-support" class="badge"></span></div>
  <p class="panel-description">Bridges connect separate pieces of retained material to the sheet.</p>
  <div class="region-actions"><button id="generate-bridges" class="primary-button">Generate Bridges</button><button id="add-bridge" class="small-button" aria-pressed="false">Add Bridges</button></div>
  <p id="bridge-hint" class="edit-hint" role="status"></p>
  <div class="bridge-fields">${widthControl('bridge-width', 'Bridge Width', 0.5, 3)}<label class="check-label"><input id="bridge-match-features" type="checkbox" checked /><span>Match Artwork Features</span></label></div>
  <p class="control-hint">Automatic bridges follow nearby features and match their widths when possible. Custom bridges are preserved.</p>
  <label class="check-label"><input id="bridge-snap-lines" type="checkbox" checked /><span>Snap to Nearby Lines</span></label>
  <p class="control-hint">Align straight bridge edges and angles while dragging. Hold Alt/Option to move freely.</p>
  <label class="check-label"><input id="bridge-snap-angles" type="checkbox" checked /><span>Snap to Horizontal, Vertical & 45°</span></label>
  <p class="control-hint">Snap straight bridges within 5° while placing or dragging. The nearest snap wins; nearby lines win ties. Hold Alt/Option to move freely.</p>
  <label class="field">Bridge<select id="bridge-picker" aria-label="Select Material Bridge"></select></label>
  <div id="bridge-selection" hidden><h3 id="bridge-selection-title">Selected Bridge</h3><div class="bridge-fields">${widthControl('selected-bridge-width', 'Bridge Width', 0.5)}<label class="check-label"><input id="selected-bridge-curved" type="checkbox" disabled /><span>Curved Bridge</span></label></div><p id="bridge-curve-hint" class="control-hint" hidden>Drag the bend handle to follow the artwork.</p><div class="region-actions"><button id="snap-bridge" class="small-button" disabled>Snap to Artwork</button><button id="remove-bridge" class="small-button danger" disabled>Remove Bridge</button></div></div>
  <details class="panel-details"><summary>Advanced</summary><div class="bridge-fields">${widthControl('minimum-material-width', 'Minimum Material Width', 0.1, 0.5)}<label class="check-label"><input id="bridge-reinforcement" type="checkbox" /><span>Add Reinforcement</span></label></div><button id="clear-bridge-exclusions" class="small-button" disabled>Allow Removed Connections</button><p class="control-hint">Allow previously removed automatic connections to be generated again.</p></details>
</section>`;

export function createBridgeEditor({ state, render, mutate, snapshot, restore, record, commit, save, notify, svgPoint, screenUnit, runTask }) {
  const $ = selector => document.querySelector(selector), svg = $('#preview-svg');
  let gesture = null, adding = false, start = null;
  const selected = () => state.regionBridges.find(b => b.id === state.selectedRegionBridge);
  const selection = () => state.regionBridges.filter(b => state.selectedRegionBridges.includes(b.id));
  function select(ids, anchor = ids[0]) {
    state.selectedRegionBridges = [...new Set(ids)];
    state.selectedRegionBridge = anchor ?? null;
  }
  function selectBridge(id, additive = false) {
    select(id ? [...(additive ? state.selectedRegionBridges : []), id] : [], id);
  }
  const toArtwork = p => ({ x: (p.x - state.scaled.padding) / state.artworkWidth, y: (p.y - state.scaled.padding) / state.artworkWidth });
  const scaled = () => scaleBridges(state.regionBridges, state.artworkWidth, state.scaled.padding);
  const centerline = b => `M${b.a.x} ${b.a.y}${b.control ? `Q${b.control.x} ${b.control.y} ${b.b.x} ${b.b.y}` : `L${b.b.x} ${b.b.y}`}`;
  function refreshOverlay() {
    const previous = svg.querySelector('.material-bridge-overlays');
    if (previous) previous.outerHTML = overlay();
  }
  function drawGesture() {
    if (!gesture) return;
    gesture.frame = null;
    if (gesture.kind === 'box') return refreshOverlay();
    const bridge = state.regionBridges.find(b => b.id === gesture.id);
    if (!bridge) return;
    const b = scaleBridges([bridge], state.artworkWidth, state.scaled.padding)[0];
    const group = svg.querySelector(`[data-material-bridge="${b.id}"]`)?.closest('.region-bridge');
    if (!group) return;
    // Only the small bridge polygon changes. Leave cut paths, material analysis,
    // inspector DOM and the captured handle intact until release.
    group.style.setProperty('--bridge-color', '#258477');
    group.querySelector('.bridge-highlight').setAttribute('d', pathData(bridgePolygon(b)));
    group.querySelector('.bridge-hit').setAttribute('d', centerline(b));
    group.querySelector('.bridge-control-guide')?.setAttribute('d', `M${b.a.x} ${b.a.y}L${b.control?.x} ${b.control?.y}L${b.b.x} ${b.b.y}`);
    for (const handle of group.querySelectorAll('[data-bridge-end]')) {
      const point = b[handle.dataset.bridgeEnd];
      handle.setAttribute('cx', point.x);
      handle.setAttribute('cy', point.y);
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
    $('#bridge-hint').textContent = adding ? (start ? 'Choose the second anchor in retained material. Cancel Placement or Escape stops adding.' : 'Choose the first anchor in retained material. Keep placing bridges; Cancel Placement or Escape stops adding.') : bridges.length ? `${bridges.length} selected. Drag a bridge to move it or its handles to adjust it; Shift adds to the selection.` : 'Select or drag a bridge, or drag a rectangle to select several.';
    $('#generate-bridges').textContent = state.regionBridges.some(bridge => bridge.automatic) ? 'Regenerate Bridges' : 'Generate Bridges';
    $('#bridge-selection').hidden = !bridges.length;
    $('#bridge-selection-title').textContent = bridges.length > 1 ? `${bridges.length} Bridges Selected` : 'Selected Bridge';
    $('#bridge-curve-hint').hidden = !bridges.some(bridge => bridge.control);
    $('#bridge-width').value = state.bridgeWidth;
    $('#minimum-material-width').value = state.minimumMaterialWidth;
    $('#bridge-reinforcement').checked = state.bridgeReinforcement;
    $('#bridge-match-features').checked = state.bridgeMatchFeatures;
    $('#bridge-snap-lines').checked = state.bridgeSnapLines !== false;
    $('#bridge-snap-angles').checked = state.bridgeSnapAngles !== false;
    $('#selected-bridge-curved').disabled = !selected();
    $('#selected-bridge-curved').checked = bridges.length > 0 && bridges.every(b => b.control);
    $('#selected-bridge-curved').indeterminate = bridges.some(b => b.control) && !bridges.every(b => b.control);
    $('#bridge-picker').innerHTML = '<option value="">Select a bridge…</option>' + state.regionBridges.map((b, i) => `<option value="${b.id}">Bridge ${i + 1} (${b.automatic ? 'Automatic' : 'Custom'}, ${b.width.toFixed(1)} mm${state.result.regionBridges?.find(r => r.id === b.id)?.valid === false ? ', Invalid' : ''})</option>`).join('');
    $('#bridge-picker').value = state.selectedRegionBridge ?? '';
    $('#selected-bridge-width').disabled = !selected();
    const mixedWidth = bridges.some(b => b.width !== bridges[0].width);
    $('#selected-bridge-width').value = mixedWidth ? '' : selected()?.width ?? '';
    $('#selected-bridge-width').placeholder = mixedWidth ? 'Mixed' : '';
    for (const id of ['bridge-width', 'minimum-material-width', 'selected-bridge-width']) {
      const input = $(`#${id}`), slider = $(`#${id}-range`);
      slider.disabled = input.disabled;
      slider.value = input.value || selected()?.width || input.min;
      slider.style.setProperty('--range', `${(slider.value - slider.min) / (slider.max - slider.min) * 100}%`);
      if (id === 'selected-bridge-width' && mixedWidth) slider.setAttribute('aria-valuetext', 'Mixed widths');
      else slider.removeAttribute('aria-valuetext');
    }
    $('#snap-bridge').disabled = bridges.length !== 1 || bridges[0].automatic;
    $('#snap-bridge').title = $('#snap-bridge').disabled ? 'Select one custom bridge to snap it to a nearby feature.' : 'Align with a nearby feature and match its width.';
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
    const unit = screenUnit();
    const unsupported = state.editingBridges || state.workflowStep === 3 ? (state.result.unsupported ?? []).map(component => `<path class="unsupported-material" d="${component.paths.map(p => pathData(p)).join('')}" fill-rule="nonzero" pointer-events="none"/>`).join('') : '';
    const current = new Map(scaled().map(bridge => [bridge.id, bridge]));
    const markers = (state.editingBridges || state.showBridges ? state.result.regionBridges ?? [] : []).map((bridge, i) => {
      const b = { ...bridge, ...current.get(bridge.id) };
      const active = state.editingBridges && state.selectedRegionBridges.includes(b.id);
      const color = !b.valid ? '#c24545' : b.automatic ? '#c3963e' : '#258477';
      return `<g class="region-bridge ${active ? 'selected' : ''}" style="--bridge-color:${color}"><path class="bridge-highlight" d="${pathData(b.polygon)}" pointer-events="none"/>${state.editingBridges ? `<path data-material-bridge="${b.id}" d="M${b.a.x} ${b.a.y}${b.control ? `Q${b.control.x} ${b.control.y} ${b.b.x} ${b.b.y}` : `L${b.b.x} ${b.b.y}`}" class="bridge-hit" vector-effect="non-scaling-stroke" tabindex="0" role="button" aria-label="Bridge ${i + 1}, ${b.valid ? 'valid anchors' : 'invalid anchors'}" aria-pressed="${active}"/>${active ? `${b.control ? `<path d="M${b.a.x} ${b.a.y}L${b.control.x} ${b.control.y}L${b.b.x} ${b.b.y}" class="bridge-control-guide" vector-effect="non-scaling-stroke" pointer-events="none"/>` : ''}${['a', 'b', ...(b.control ? ['control'] : [])].map(end => `<circle data-material-bridge="${b.id}" data-bridge-end="${end}" cx="${b[end].x}" cy="${b[end].y}" r="${unit * 6}" vector-effect="non-scaling-stroke" tabindex="0" role="button" aria-label="Bridge ${i + 1} ${end === 'control' ? 'bend handle' : `endpoint ${end}`}; drag or use arrow keys"/>`).join('')}` : ''}` : ''}</g>`;
    }).join('');
    const box = gesture?.kind === 'box' && gesture.moved ? `<rect id="bridge-selection-box" x="${Math.min(gesture.start.x, gesture.point.x)}" y="${Math.min(gesture.start.y, gesture.point.y)}" width="${Math.abs(gesture.point.x - gesture.start.x)}" height="${Math.abs(gesture.point.y - gesture.start.y)}"/>` : '';
    return `<g class="material-bridge-overlays">${unsupported}${markers}${start ? `<circle cx="${start.x}" cy="${start.y}" r="${unit * 6}" fill="#258477" pointer-events="none"/>` : ''}${box}</g>`;
  }
  $('#generate-bridges').addEventListener('click', () => {
    finishGesture(); adding = false; start = null;
    runTask('bridges', { contours: state.scaled.contours, channelCuts: state.result.channelCuts, settings: options() }, 'Generating bridges…', generated => {
      const bridges = generated.map(b => {
        const { distance, polygon, valid, ...saved } = unscaleBridge(b, state.artworkWidth, state.scaled.padding);
        return saved;
      });
      mutate(() => { state.regionBridges = bridges; select([]); });
    });
  });
  $('#add-bridge').addEventListener('click', () => { finishGesture(); adding = !adding; start = null; render(); });
  $('#bridge-picker').addEventListener('change', e => { commit(); selectBridge(e.target.value || null); render(); });
  $('#snap-bridge').addEventListener('click', () => {
    finishGesture();
    const bridges = selection();
    if (bridges.length !== 1 || bridges[0].automatic) return;
    const bridge = scaled().find(b => b.id === bridges[0].id);
    runTask('snap', { contours: state.scaled.contours, channelCuts: state.result.channelCuts, settings: options(), bridge }, 'Snapping bridge to artwork…', snapped => {
      if (!snapped) return notify('No nearby shape continuation fits this bridge. Move its anchors closer to the feature and try again.');
      const saved = unscaleBridge(snapped, state.artworkWidth, state.scaled.padding);
      mutate(() => { state.regionBridges = state.regionBridges.map(b => b.id === saved.id ? saved : b); });
      notify('Bridge snapped to the existing shape and matched its width.');
    });
  });
  $('#remove-bridge').addEventListener('click', remove);
  $('#clear-bridge-exclusions').addEventListener('click', () => mutate(() => { state.bridgeExclusions = []; }));
  for (const [id, key, min] of [['bridge-width', 'bridgeWidth', 0.5], ['minimum-material-width', 'minimumMaterialWidth', 0.1]]) {
    $(`#${id}`).addEventListener('change', e => {
      const number = Number(e.target.value);
      if (e.target.value === '' || !Number.isFinite(number)) return update();
      mutate(() => { state[key] = Math.max(min, Math.min(15, number)); });
    });
  }
  $('#bridge-reinforcement').addEventListener('change', e => mutate(() => { state.bridgeReinforcement = e.target.checked; }));
  $('#bridge-match-features').addEventListener('change', e => mutate(() => { state.bridgeMatchFeatures = e.target.checked; }));
  $('#bridge-snap-lines').addEventListener('change', e => mutate(() => { state.bridgeSnapLines = e.target.checked; }));
  $('#bridge-snap-angles').addEventListener('change', e => mutate(() => { state.bridgeSnapAngles = e.target.checked; }));
  $('#selected-bridge-curved').addEventListener('change', e => {
    if (!selected()) return;
    mutate(() => {
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
    const value = Number(e.target.value);
    if (!selected() || e.target.value === '' || !Number.isFinite(value)) return update();
    mutate(() => { for (const bridge of selection()) { bridge.width = Math.max(0.5, Math.min(15, value)); bridge.automatic = false; } });
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
  svg.addEventListener('pointerdown', e => {
    if (!state.editingBridges || e.button !== 0 || e.defaultPrevented || gesture) return;
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
      mutate(() => { state.regionBridges.push(bridge); selectBridge(bridge.id); });
      e.preventDefault(); return;
    }
    const target = e.target.closest('[data-material-bridge]');
    const previous = [...state.selectedRegionBridges], anchor = state.selectedRegionBridge;
    const id = target?.dataset.materialBridge;
    if (id) selectBridge(id, e.shiftKey || previous.includes(id));
    else if (!e.shiftKey) select([]);
    if (target?.dataset.bridgeEnd) {
      gesture = { before: snapshot(), pointerId: e.pointerId, end: target.dataset.bridgeEnd, id: state.selectedRegionBridge };
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
  svg.addEventListener('pointermove', e => {
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
      bridge[gesture.end] = toArtwork({ x: Math.max(0, Math.min(state.scaled.width, p.x)), y: Math.max(0, Math.min(state.scaled.height, p.y)) });
    }
    if ((state.bridgeSnapLines !== false || state.bridgeSnapAngles !== false) && !e.altKey) {
      const physical = scaleBridges([bridge], state.artworkWidth, state.scaled.padding)[0];
      const angled = state.bridgeSnapAngles !== false ? snapBridgeToAngles(physical, gesture.end) : physical;
      const lined = state.bridgeSnapLines !== false ? snapBridgeToLines(physical, gesture.snapLines, screenUnit() * 8, gesture.end) : physical;
      const inSheet = candidate => [candidate.a, candidate.b].every(p => p.x >= 0 && p.y >= 0 && p.x <= state.scaled.width && p.y <= state.scaled.height);
      // Compare both candidates against the raw drag, so snapping does not
      // compound. Ignore candidates that would move an anchor off the sheet.
      const movement = candidate => candidate === physical || !inSheet(candidate) ? Infinity : Math.max(...['a', 'b'].map(end => Math.hypot(candidate[end].x - physical[end].x, candidate[end].y - physical[end].y)));
      const snapped = movement(lined) <= movement(angled) ? lined : angled;
      if (snapped !== physical && [snapped.a, snapped.b].every(p => p.x >= 0 && p.y >= 0 && p.x <= state.scaled.width && p.y <= state.scaled.height)) {
        Object.assign(bridge, unscaleBridge(snapped, state.artworkWidth, state.scaled.padding));
      }
    }
    bridge.automatic = false; scheduleGesture();
  });
  svg.addEventListener('pointerup', e => { if (gesture?.pointerId === e.pointerId) finishGesture(); });
  svg.addEventListener('pointercancel', e => { if (gesture?.pointerId === e.pointerId) finishGesture(true); });
  svg.addEventListener('lostpointercapture', e => { if (gesture?.pointerId === e.pointerId) finishGesture(true); });
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
      mutate(() => { const bridge = selected(); bridge[end][e.key === 'ArrowLeft' || e.key === 'ArrowRight' ? 'x' : 'y'] += e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -delta : delta; bridge.automatic = false; });
      svg.querySelector(`[data-material-bridge="${state.selectedRegionBridge}"][data-bridge-end="${end}"]`)?.focus();
    }
  });
  return { update, overlay, finishGesture, cancel, get dragging() { return Boolean(gesture); } };
}
