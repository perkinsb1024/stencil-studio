import { snapRegionBridge, generateRegionBridges, scaleBridges, unscaleBridge, pointInMaterial, bridgeKey } from './material-geometry.js';
import { pathData } from './geometry.js';

export const bridgePanel = `
<section class="bridge-inspector editing-panel" id="bridge-inspector" aria-label="Material Bridges" hidden>
  <div class="tab-inspector-heading"><h2>Bridges</h2><span id="bridge-support" class="badge"></span></div>
  <p class="panel-description">Bridges connect separate pieces of retained material to the sheet.</p>
  <div class="region-actions"><button id="generate-bridges" class="primary-button">Generate Bridges</button><button id="add-bridge" class="small-button" aria-pressed="false">Add Bridge</button></div>
  <p id="bridge-hint" class="edit-hint" role="status"></p>
  <div class="bridge-fields"><label>Bridge Width (mm)<input id="bridge-width" type="number" min="0.5" max="15" step="0.1" value="3" /></label><label class="check-label"><input id="bridge-match-features" type="checkbox" checked /><span>Match Artwork Features</span></label></div>
  <p class="control-hint">Automatic bridges follow nearby features and match their widths when possible. Custom bridges are preserved.</p>
  <label class="field">Bridge<select id="bridge-picker" aria-label="Select Material Bridge"></select></label>
  <div id="bridge-selection" hidden><h3 id="bridge-selection-title">Selected Bridge</h3><div class="bridge-fields"><label>Bridge Width (mm)<input id="selected-bridge-width" type="number" min="0.5" max="15" step="0.1" /></label><label class="check-label"><input id="selected-bridge-curved" type="checkbox" disabled /><span>Curved Bridge</span></label></div><p id="bridge-curve-hint" class="control-hint" hidden>Drag the bend handle to follow the artwork.</p><div class="region-actions"><button id="snap-bridge" class="small-button" disabled>Snap to Artwork</button><button id="remove-bridge" class="small-button danger" disabled>Remove Bridge</button></div></div>
  <details class="panel-details"><summary>Advanced</summary><div class="bridge-fields"><label>Minimum Material Width (mm)<input id="minimum-material-width" type="number" min="0.1" max="15" step="0.1" value="0.5" /></label><label class="check-label"><input id="bridge-reinforcement" type="checkbox" /><span>Add Reinforcement</span></label></div><button id="clear-bridge-exclusions" class="small-button" disabled>Allow Removed Connections</button><p class="control-hint">Allow previously removed automatic connections to be generated again.</p></details>
</section>`;

export function createBridgeEditor({ state, render, mutate, snapshot, restore, record, commit, save, notify, svgPoint, screenUnit }) {
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
    if (finished.kind === 'box') {
      if (cancelled) select(finished.previous, finished.anchor);
      render();
    } else if (cancelled) restore(finished.before);
    else record(finished.before);
    if (svg.hasPointerCapture(finished.pointerId)) svg.releasePointerCapture(finished.pointerId);
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
    $('#bridge-hint').textContent = adding ? (start ? 'Choose the second anchor in retained material.' : 'Choose the first anchor in retained material.') : bridges.length ? `${bridges.length} selected. Drag handles to adjust a bridge; Shift adds to the selection.` : 'Select a bridge to adjust it, or drag a rectangle to select several.';
    $('#generate-bridges').textContent = state.regionBridges.some(bridge => bridge.automatic) ? 'Regenerate Bridges' : 'Generate Bridges';
    $('#bridge-selection').hidden = !bridges.length;
    $('#bridge-selection-title').textContent = bridges.length > 1 ? `${bridges.length} Bridges Selected` : 'Selected Bridge';
    $('#bridge-curve-hint').hidden = !bridges.some(bridge => bridge.control);
    $('#bridge-width').value = state.bridgeWidth;
    $('#minimum-material-width').value = state.minimumMaterialWidth;
    $('#bridge-reinforcement').checked = state.bridgeReinforcement;
    $('#bridge-match-features').checked = state.bridgeMatchFeatures;
    $('#selected-bridge-curved').disabled = !selected();
    $('#selected-bridge-curved').checked = bridges.length > 0 && bridges.every(b => b.control);
    $('#selected-bridge-curved').indeterminate = bridges.some(b => b.control) && !bridges.every(b => b.control);
    $('#bridge-picker').innerHTML = '<option value="">Select a bridge…</option>' + state.regionBridges.map((b, i) => `<option value="${b.id}">Bridge ${i + 1} (${b.automatic ? 'Automatic' : 'Custom'}, ${b.width.toFixed(1)} mm${state.result.regionBridges?.find(r => r.id === b.id)?.valid === false ? ', Invalid' : ''})</option>`).join('');
    $('#bridge-picker').value = state.selectedRegionBridge ?? '';
    $('#selected-bridge-width').disabled = !selected();
    const mixedWidth = bridges.some(b => b.width !== bridges[0].width);
    $('#selected-bridge-width').value = mixedWidth ? '' : selected()?.width ?? '';
    $('#selected-bridge-width').placeholder = mixedWidth ? 'Mixed' : '';
    $('#snap-bridge').disabled = bridges.length !== 1 || bridges[0].automatic;
    $('#snap-bridge').title = $('#snap-bridge').disabled ? 'Select one custom bridge to snap it to a nearby feature.' : 'Align with a nearby feature and match its width.';
    $('#remove-bridge').disabled = !selected();
    $('#remove-bridge').textContent = bridges.length > 1 ? `Remove ${bridges.length} Bridges` : 'Remove Bridge';
    $('#clear-bridge-exclusions').disabled = !state.bridgeExclusions.length;
    $('#add-bridge').disabled = state.regionBridges.length >= 100;
    $('#add-bridge').textContent = adding ? 'Cancel Placement' : 'Add Bridge';
    $('#add-bridge').setAttribute('aria-pressed', adding);
    svg.classList.toggle('editing-bridges', state.editingBridges);
    svg.classList.toggle('adding-bridge', state.editingBridges && adding);
  }
  function overlay() {
    const unit = screenUnit();
    const unsupported = state.editingBridges || state.workflowStep === 3 ? (state.result.unsupported ?? []).map(component => `<path class="unsupported-material" d="${component.paths.map(p => pathData(p)).join('')}" fill-rule="nonzero" pointer-events="none"/>`).join('') : '';
    const markers = (state.editingBridges || state.showBridges ? state.result.regionBridges ?? [] : []).map((b, i) => {
      const active = state.editingBridges && state.selectedRegionBridges.includes(b.id);
      const color = !b.valid ? '#c24545' : b.automatic ? '#c3963e' : '#258477';
      return `<g class="region-bridge ${active ? 'selected' : ''}" style="--bridge-color:${color}"><path class="bridge-highlight" d="${pathData(b.polygon)}" pointer-events="none"/>${state.editingBridges ? `<path data-material-bridge="${b.id}" d="M${b.a.x} ${b.a.y}${b.control ? `Q${b.control.x} ${b.control.y} ${b.b.x} ${b.b.y}` : `L${b.b.x} ${b.b.y}`}" class="bridge-hit" vector-effect="non-scaling-stroke" tabindex="0" role="button" aria-label="Bridge ${i + 1}, ${b.valid ? 'valid anchors' : 'invalid anchors'}" aria-pressed="${active}"/>${active ? `${b.control ? `<path d="M${b.a.x} ${b.a.y}L${b.control.x} ${b.control.y}L${b.b.x} ${b.b.y}" class="bridge-control-guide" vector-effect="non-scaling-stroke" pointer-events="none"/>` : ''}${['a', 'b', ...(b.control ? ['control'] : [])].map(end => `<circle data-material-bridge="${b.id}" data-bridge-end="${end}" cx="${b[end].x}" cy="${b[end].y}" r="${unit * 6}" vector-effect="non-scaling-stroke" tabindex="0" role="button" aria-label="Bridge ${i + 1} ${end === 'control' ? 'bend handle' : `endpoint ${end}`}; drag or use arrow keys"/>`).join('')}` : ''}` : ''}</g>`;
    }).join('');
    const box = gesture?.kind === 'box' && gesture.moved ? `<rect id="bridge-selection-box" x="${Math.min(gesture.start.x, gesture.point.x)}" y="${Math.min(gesture.start.y, gesture.point.y)}" width="${Math.abs(gesture.point.x - gesture.start.x)}" height="${Math.abs(gesture.point.y - gesture.start.y)}"/>` : '';
    return `<g class="material-bridge-overlays">${unsupported}${markers}${start ? `<circle cx="${start.x}" cy="${start.y}" r="${unit * 6}" fill="#258477" pointer-events="none"/>` : ''}${box}</g>`;
  }
  $('#generate-bridges').addEventListener('click', () => {
    finishGesture(); adding = false; start = null;
    const bridges = generateRegionBridges(state.scaled.contours, state.result.channelCuts, options()).map(b => {
      const { distance, polygon, valid, ...saved } = unscaleBridge(b, state.artworkWidth, state.scaled.padding);
      return saved;
    });
    mutate(() => { state.regionBridges = bridges; select([]); });
  });
  $('#add-bridge').addEventListener('click', () => { finishGesture(); adding = !adding; start = null; render(); });
  $('#bridge-picker').addEventListener('change', e => { commit(); selectBridge(e.target.value || null); render(); });
  $('#snap-bridge').addEventListener('click', () => {
    finishGesture();
    const bridges = selection();
    if (bridges.length !== 1 || bridges[0].automatic) return;
    const bridge = scaled().find(b => b.id === bridges[0].id);
    const snapped = snapRegionBridge(state.scaled.contours, state.result.channelCuts, options(), bridge);
    if (!snapped) return notify('No nearby shape continuation fits this bridge. Move its anchors closer to the feature and try again.');
    const saved = unscaleBridge(snapped, state.artworkWidth, state.scaled.padding);
    mutate(() => { state.regionBridges = state.regionBridges.map(b => b.id === saved.id ? saved : b); });
    notify('Bridge snapped to the existing shape and matched its width.');
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
  svg.addEventListener('pointerdown', e => {
    if (!state.editingBridges || e.button !== 0 || e.defaultPrevented || gesture) return;
    const point = svgPoint(e); if (!point) return;
    commit();
    if (adding) {
      if (!pointInMaterial(point, state.result.retainedMaterial ?? [])) return notify('Place each endpoint inside white retained material.', 'warning');
      if (!start) { start = point; render(); return; }
      if (Math.hypot(point.x - start.x, point.y - start.y) < 0.1) return;
      const bridge = { id: `bridge-${crypto.randomUUID()}`, a: toArtwork(start), b: toArtwork(point), width: state.bridgeWidth, automatic: false };
      adding = false; start = null;
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
    } else if (!target) {
      gesture = { kind: 'box', pointerId: e.pointerId, start: point, point, x: e.clientX, y: e.clientY, moved: false, previous, anchor, additive: e.shiftKey };
    }
    if (gesture && e.isTrusted) svg.setPointerCapture(e.pointerId);
    e.preventDefault();
    render();
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
      render(); return;
    }
    const bridge = selected(); if (!bridge) return finishGesture(true);
    bridge[gesture.end] = toArtwork({ x: Math.max(0, Math.min(state.scaled.width, p.x)), y: Math.max(0, Math.min(state.scaled.height, p.y)) });
    bridge.automatic = false; render();
  });
  svg.addEventListener('pointerup', e => { if (gesture?.pointerId === e.pointerId) finishGesture(); });
  svg.addEventListener('pointercancel', e => { if (gesture?.pointerId === e.pointerId) finishGesture(true); });
  svg.addEventListener('lostpointercapture', e => { if (gesture?.pointerId === e.pointerId) finishGesture(true); });
  svg.addEventListener('click', e => {
    if (state.editingBridges && e.detail === 0 && e.target.closest('[data-material-bridge]')) { selectBridge(e.target.closest('[data-material-bridge]').dataset.materialBridge, e.shiftKey); render(); }
  });
  document.addEventListener('keydown', e => {
    if (!state.editingBridges || e.defaultPrevented || e.target.closest('input,select,textarea,[contenteditable]')) return;
    if (e.key === 'Escape') { e.preventDefault(); cancel(); render(); }
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
  return { update, overlay, finishGesture, cancel };
}
