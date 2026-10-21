import { updateWorkspaceUI } from './workspace-ui.js';
import { pendingTypeReviews, typeReviewIds, decideLayerType } from './type-review.js';
import { workspaceView } from './workspace-view.js';
import { createOrderedList, orderControls } from './ordered-list.js';
import { scaleRegions } from './regions.js';
import { createRegionEditor } from './region-editor.js';
import { importSvg, scaleArtwork, examples } from './import-svg.js';
import { generateStencil, pathData, exportSvg } from './geometry.js';
import { customizeContour, nearestOnContour } from './tab-layout.js';
import { workspaceKey, readWorkspace, writeWorkspace } from './workspace-storage.js';
import { createSimplifyEditor } from './simplify-editor.js';
import { createPreviewPan } from './preview-pan.js';
import { createBridgeEditor, bridgePanel } from './bridge-editor.js';
import { materialMode, scaleBridges } from './material-geometry.js';
import { suggestAreas, applyAreaSuggestions, suggestionDefaults, treatmentLabel } from './area-suggestions.js';

const icons = {
  upload: '<path d="M12 16V4m-4 4 4-4 4 4M4 15v5h16v-5"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  file: '<path d="M14 3H5v18h14V8Zm0 0v5h5M8 13h8M8 17h5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  fit: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3h.01"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  leaf: '<path d="M5 19C-1 6 10 2 21 3c1 11-4 20-16 16Zm0 0L16 8"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || ''}</svg>`;
const defaults = { artworkWidth: 150, channelWidth: 1.5, tabWidth: 3, tabCount: 4, tabOffset: 0, margin: 8, roundedTabs: false, roundedChannelCorners: true };
const state = { ...defaults, artwork: null, source: null, example: '', name: 'Bloom.svg', view: 'material', showTabs: true, showOriginal: false, zoom: 1, panX: 0, panY: 0, sourceWarnings: [], result: null, scaled: null, tabLayouts: {}, hiddenContours: [], cutawayContours: [], regions: [], editingRegions: false, selectedRegion: null, drawingRegion: false, regionDraft: [], regionWidth: 0.8, regionTaperLength: 5, regionScope: 'outline-0', editingOutlines: false, selectedOutlines: [], showHiddenOutlines: true, editing: false, adding: false, selectedContour: null, selectedTab: null, selectedTabs: [], selectCurrentOutlineOnly: true };
const $ = s => document.querySelector(s);
const htmlText = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const materialDefaults = () => ({ ...suggestionDefaults(), areaDecisions: {}, areaSuggestionBasis: null, materialVersion: 1, materialTreatments: {}, materialOrder: [], regionBridges: [], bridgeExclusions: [], bridgeWidth: 3, minimumMaterialWidth: 0.5, bridgeReinforcement: false, bridgeMatchFeatures: true });
Object.assign(state, { workflowStep: 1, activeTool: 'layers', showBridges: true, reviewingTypes: false, reviewRegion: null, layerQuery: '', layerFilter: 'all', controlsCollapsed: false, sourceChosen: false, areaDecisions: {} }, materialDefaults(), { editingBridges: false, selectedRegionBridge: null, selectedRegionBridges: [] });
const outlineThumbnails = new WeakMap();

document.querySelector('#app').innerHTML = workspaceView(icon, bridgePanel);
// The tool header does not scroll away when the object inspector is long.
const inspectorHeader = document.createElement('div');
inspectorHeader.id = 'shape-header';
inspectorHeader.className = 'inspector-header';
inspectorHeader.hidden = true;
inspectorHeader.append($('.size-section'), $('.tab-edit-toolbar'), $('#toggle-controls'));
$('.inspector').prepend(inspectorHeader);

let noticeTimer;
function notify(message, kind = 'success') {
  const el = $('#notice');
  clearTimeout(noticeTimer); el.textContent = message; el.className = `notice ${kind}`; el.hidden = false;
  if (kind === 'success') noticeTimer = setTimeout(() => { el.hidden = true; }, 6000);
}

function render() {
  if (!state.artwork) return;
  syncEditingFlags();
  const padding = Math.max(state.margin, Math.max(state.channelWidth, ...state.regions.map(r => r.width)) / 2 + 2);
  state.scaled = { ...scaleArtwork(state.artwork, state.artworkWidth, padding), padding, regions: scaleRegions(state.regions, state.artworkWidth, padding) };
  state.result = generateStencil(state.scaled.contours, { ...state, regions: state.scaled.regions, sheet: state.scaled, analyzeMaterial: state.editingBridges || state.workflowStep === 3, regionBridges: scaleBridges(state.regionBridges, state.artworkWidth, padding) });
  const { width, height, contours, artworkHeight } = state.scaled;
  const visible = visibleContours();
  const tabContours = channelContours();
  if (!tabContours.some(c => c.id === state.selectedContour)) selectTab(tabContours[0]?.id ?? null, null);
  if (!tabContours.length) state.adding = false;
  // Drop selections removed by resets, undo, or changes to automatic placement.
  state.selectedTabs = state.selectedTab == null ? [] : state.selectedTabs.filter(ref => state.result.bridges.some(b => matchesTab(b, ref)));
  if (state.selectedTabs.length && !selectedBridge()) {
    state.selectedContour = state.selectedTabs[0].contourId; state.selectedTab = state.selectedTabs[0].id;
  }
  updateTabEditor();
  updateOutlineEditor();
  regionEditor.update();
  bridgeEditor.update();
  const svg = $('#preview-svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.style.aspectRatio = `${width} / ${height}`;
  fitSheet();
  const cuts = state.result.paths.map(p => pathData(p)).join('');
  svg.innerHTML = `<rect width="${width}" height="${height}" fill="#fffef9"/><path class="cut-shape" d="${cuts}" fill="${state.view === 'material' ? '#502c6c' : 'none'}" stroke="${state.view === 'cut' ? '#502c6c' : 'none'}" stroke-width="0.14" fill-rule="evenodd"/>`;
  if (state.showOriginal) svg.innerHTML += `<g class="original-outlines" fill="none" stroke="#6f8bca" stroke-width="0.18" stroke-dasharray="1 0.7" pointer-events="none">${visible.map(c => `<path d="${pathData(c.points, c.closed)}"/>`).join('')}</g>`;
  if (state.editing) svg.innerHTML += `<g class="outline-hit-targets" fill="none" stroke="transparent" stroke-width="18" vector-effect="non-scaling-stroke">${tabContours.map(c => `<path data-outline="${c.id}" d="${pathData(c.points, c.closed)}" vector-effect="non-scaling-stroke"/>`).join('')}</g>`;
  if (state.editing && state.selectedContour) {
    const selected = contours.find(c => c.id === state.selectedContour);
    if (selected) svg.innerHTML += `<path d="${pathData(selected.points, selected.closed)}" fill="none" stroke="#258477" stroke-width="1" stroke-dasharray="3 4" vector-effect="non-scaling-stroke" pointer-events="none" opacity="0.6"/>`;
  }
  if ((state.showTabs || state.editing) && !state.editingOutlines) svg.innerHTML += renderTabMarkers();
  if (state.editingOutlines) svg.innerHTML += renderOutlineTargets();
  if (state.editingRegions) svg.innerHTML += regionEditor.overlay();
  if (state.editingBridges || state.showBridges || state.workflowStep === 3) svg.innerHTML += bridgeEditor.overlay();
  svg.classList.toggle('editing-tabs', state.editing);
  svg.classList.toggle('editing-outlines', state.editingOutlines);
  svg.classList.toggle('adding-tab', state.adding);
  $('#dimension-width').textContent = `${width.toFixed(1)} mm`;
  $('#dimension-height').textContent = `${height.toFixed(1)} mm`;
  const support = $('#material-status');
  support.hidden = true;
  $('#offset-value').textContent = `${state.tabOffset}%`;
  updateWorkspaceUI(state);
  fitSheet();
}

function refreshAreaSuggestions() {
  const padding = Math.max(state.margin, Math.max(state.channelWidth, ...state.regions.map(r => r.width)) / 2 + 2);
  state.areaSuggestions = suggestAreas(state.artwork, { ...state, padding, regions: scaleRegions(state.regions, state.artworkWidth, padding), regionBridges: scaleBridges(state.regionBridges, state.artworkWidth, padding) });
  applyAreaSuggestions(state, state.artwork, state.areaSuggestions);
  state.areaSuggestionBasis = { artworkWidth: state.artworkWidth, channelWidth: state.channelWidth, minimumMaterialWidth: state.minimumMaterialWidth };
}
function markAreaOverrides(ids) {
  for (const c of state.artwork.contours) if (ids.includes(c.id)) { state.areaOverrides[c.regionId] = true; state.areaDecisions[c.regionId] = 'manual'; }
}
function preserveLegacyAreaChoices(saved) {
  if (saved.areaOverrides !== undefined) return;
  for (const c of state.artwork.contours) if (saved.materialTreatments?.[c.regionId] || saved.hiddenContours?.includes(c.id) || saved.cutawayContours?.includes(c.id)) state.areaOverrides[c.regionId] = true;
}
function uncertainAreas() { return pendingTypeReviews(state); }
function layerName(id) {
  const regions = state.artwork.sourceRegions ?? [];
  const source = regions.find(region => region.id === id);
  return source?.source?.id || source?.source?.groups?.at(-1)?.id || `Layer ${[...new Set(state.artwork.contours.map(c => c.regionId))].indexOf(id) + 1}`;
}
function reviewUncertainArea() {
  activateTool('layers');
  if (!state.areaSuggestions) mutate(refreshAreaSuggestions);
  state.reviewingTypes = true;
  const pending = uncertainAreas();
  if (!state.reviewRegion || !pending.includes(state.reviewRegion)) state.reviewRegion = pending[0] ?? null;
  focusReviewRegion(); render();
  $('#type-review').scrollIntoView({ block: 'nearest' });
}
function focusReviewRegion() {
  if (state.reviewRegion) state.selectedOutlines = state.artwork.contours.filter(c => c.regionId === state.reviewRegion).map(c => c.id);
}
function advanceTypeReview(direction = 1, unresolvedOnly = false) {
  const ids = typeReviewIds(state), current = ids.indexOf(state.reviewRegion);
  const remaining = uncertainAreas();
  for (let offset = 1; offset <= ids.length; offset++) {
    const next = ids[(current + direction * offset + ids.length * 2) % ids.length];
    if (!unresolvedOnly || remaining.includes(next)) { state.reviewRegion = next; focusReviewRegion(); render(); return; }
  }
  state.reviewRegion = null; render();
}
function resolveTypeReview(choice, mode = null) {
  if (!state.reviewRegion) return;
  mutate(() => decideLayerType(state, state.reviewRegion, choice, mode));
  announce(`${layerName(state.reviewRegion)} reviewed. ${uncertainAreas().length} remaining.`);
  advanceTypeReview(1, true);
  (state.reviewRegion ? $('#accept-area-suggestion') : $('#close-type-review')).focus({ preventScroll: true });
}
function updateTypeReview() {
  const pending = uncertainAreas(), all = typeReviewIds(state);
  $('#review-count').textContent = state.areaSuggestions ? pending.length ? `${pending.length} Need Review` : 'No Types Need Review' : 'Not Checked';
  $('#review-areas').hidden = !!state.areaSuggestions && !pending.length;
  $('#review-areas').textContent = state.areaSuggestions ? 'Review Layer Types' : 'Detect Layer Types';
  $('#type-review').hidden = !state.reviewingTypes;
  if (!state.reviewingTypes) return;
  if (!state.reviewRegion && pending.length) { state.reviewRegion = pending[0]; focusReviewRegion(); }
  if (state.reviewRegion && !all.includes(state.reviewRegion)) state.reviewRegion = pending[0] ?? null;
  const id = state.reviewRegion, suggestion = state.areaSuggestions?.byRegion[id];
  const members = state.artwork.contours.filter(c => c.regionId === id);
  const hasLayer = Boolean(suggestion && members.length);
  $('#review-layer-name').textContent = hasLayer ? layerName(id) : 'Layer Types Reviewed';
  $('#review-thumbnail').innerHTML = hasLayer ? members.map(outlineThumbnail).join('') : '';
  $('#review-current').textContent = hasLayer ? members.every(c => state.hiddenContours.includes(c.id)) ? `Hidden (${treatmentLabel(materialMode(members[0], state))})` : treatmentLabel(materialMode(members[0], state)) : 'All Choices Saved';
  $('#review-suggested').textContent = hasLayer ? treatmentLabel(suggestion.mode) : 'No Remaining Choices';
  $('#area-review-hint').textContent = hasLayer ? suggestion.reason : 'You can still change any layer type or continue to review the stencil.';
  const progress = `${pending.length} Remaining`;
  if ($('#review-progress').textContent !== progress) $('#review-progress').textContent = progress;
  for (const selector of ['#accept-area-suggestion', '#keep-area-type', '#review-treatment']) $(selector).disabled = !hasLayer;
  $('#accept-area-suggestion').textContent = suggestion?.mode === 'hidden' ? 'Hide Layer' : 'Use Suggested Type';
  $('#accept-area-suggestion').setAttribute('aria-label', hasLayer ? `Use ${treatmentLabel(suggestion.mode)} for ${layerName(id)}` : 'Use Suggested Type');
  $('#keep-area-type').textContent = suggestion?.mode === 'hidden' ? 'Keep Visible' : 'Keep Current Type';
  $('.review-types').hidden = !hasLayer;
  $('.review-decisions').hidden = !hasLayer;
  $('#review-treatment').parentElement.hidden = !hasLayer;
  $('#review-treatment').value = hasLayer ? materialMode(members[0], state) : 'outline';
  for (const option of $('#review-treatment').options) option.disabled = option.value !== 'outline' && members.some(c => !c.closed);
  $('#previous-area').disabled = !all.length;
  $('#next-area').disabled = !all.length;
}

function visibleContours() { return state.scaled.contours.filter(c => !state.hiddenContours.includes(c.id)); }
function channelContours() { return visibleContours().filter(c => materialMode(c, state) === 'outline'); }
function outlineNumber(id) { return state.artwork.contours.findIndex(c => c.id === id) + 1; }
function renderOutlineTargets() {
  return `<g class="outline-visibility-targets">${[...state.scaled.contours].sort((a, b) => state.materialOrder.indexOf(a.regionId) - state.materialOrder.indexOf(b.regionId)).map(c => {
    const hidden = state.hiddenContours.includes(c.id), selected = state.selectedOutlines.includes(c.id);
    if (hidden && !state.showHiddenOutlines) return '';
    return `<g data-visibility-outline="${c.id}" class="visibility-outline ${hidden ? 'is-hidden' : ''} ${selected ? 'selected' : ''}" tabindex="0" role="button" aria-label="Layer ${outlineNumber(c.id)}, ${hidden ? 'hidden' : 'visible'}" aria-pressed="${selected}">
      <path class="outline-guide" d="${pathData(c.points, c.closed)}" fill="none" vector-effect="non-scaling-stroke" pointer-events="none"/>
      <path d="${pathData(c.points, c.closed)}" fill="${c.closed ? 'transparent' : 'none'}" stroke="transparent" stroke-width="18" vector-effect="non-scaling-stroke" pointer-events="${c.closed ? 'all' : 'stroke'}"/>
    </g>`;
  }).join('')}</g>`;
}
function selectOutline(id, additive = false) {
  if (!id) { if (!additive) state.selectedOutlines = []; }
  else if (additive) state.selectedOutlines = state.selectedOutlines.includes(id) ? state.selectedOutlines.filter(value => value !== id) : [...state.selectedOutlines, id];
  else state.selectedOutlines = materialMode(state.artwork.contours.find(c => c.id === id), state) === 'outline' ? [id] : state.artwork.contours.filter(c => c.regionId === state.artwork.contours.find(c => c.id === id).regionId).map(c => c.id);
  render();
}
function setLayerTypes(ids, mode) {
  const regions = new Set(state.artwork.contours.filter(c => ids.includes(c.id)).map(c => c.regionId));
  const members = state.artwork.contours.filter(c => regions.has(c.regionId));
  if (!regions.size || !['outline', 'keep', 'cut'].includes(mode) || mode !== 'outline' && members.some(c => !c.closed)) return;
  mutate(() => {
    for (const id of regions) {
      state.materialTreatments[id] = mode;
      state.areaOverrides[id] = true;
      state.areaDecisions[id] = 'manual';
    }
    const memberIds = new Set(members.map(c => c.id));
    state.cutawayContours = state.cutawayContours.filter(id => !memberIds.has(id));
    state.selectedOutlines = [...memberIds];
  });
  if (state.reviewingTypes && regions.has(state.reviewRegion)) advanceTypeReview(1, true);
}
function setOutlineVisibility(ids, visible) {
  mutate(() => {
    const hidden = new Set(state.hiddenContours);
    for (const id of ids) { if (visible) hidden.delete(id); else hidden.add(id); }
    state.hiddenContours = state.artwork.contours.filter(c => hidden.has(c.id)).map(c => c.id);
    markAreaOverrides(ids);
  });
  if (state.reviewingTypes && state.artwork.contours.some(c => c.regionId === state.reviewRegion && ids.includes(c.id))) advanceTypeReview(1, true);
}
function outlineThumbnail(contour) {
  if (outlineThumbnails.has(contour)) return outlineThumbnails.get(contour);
  const xs = contour.points.map(p => p.x), ys = contour.points.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys), width = Math.max(...xs) - x, height = Math.max(...ys) - y;
  const padding = Math.max(width, height, 1) * 0.1;
  // Keep the full contour: sampling by vertex index can skip whole corners
  // when curved sections have many more vertices than straight sections.
  const thumbnail = `<svg viewBox="${x - padding} ${y - padding} ${width + padding * 2} ${height + padding * 2}" aria-hidden="true"><path d="${pathData(contour.points, contour.closed)}" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`;
  outlineThumbnails.set(contour, thumbnail);
  return thumbnail;
}
function updateOutlineEditor() {
  $('#edit-outlines').textContent = 'Layers';
  $('#edit-outlines').setAttribute('aria-pressed', state.editingOutlines);
  $('#outline-inspector').hidden = !state.editingOutlines;
  const groups = [...new Set([...state.materialOrder, ...state.artwork.contours.map(c => c.regionId)])].filter(id => state.artwork.contours.some(c => c.regionId === id)).reverse();
  const shown = groups.filter(id => state.artwork.contours.some(c => c.regionId === id && !state.hiddenContours.includes(c.id)));
  $('#outline-count').textContent = `${shown.length} of ${groups.length} Visible`;
  $('#show-hidden-outlines').checked = state.showHiddenOutlines;
  const selected = state.selectedOutlines;
  $('#hide-outlines').disabled = !selected.some(id => !state.hiddenContours.includes(id));
  $('#show-outlines').disabled = !selected.some(id => state.hiddenContours.includes(id));
  $('#keep-only-outlines').disabled = selected.length === 0;
  $('#show-all-outlines').disabled = state.hiddenContours.length === 0;
  $('#layer-selection-actions').hidden = !selected.length;
  $('#layer-selection-controls').hidden = !selected.length;
  const selectedRegions = new Set(state.artwork.contours.filter(c => selected.includes(c.id)).map(c => c.regionId));
  const selectedMembers = state.artwork.contours.filter(c => selectedRegions.has(c.regionId));
  const selectedModes = new Set(selectedMembers.map(c => materialMode(c, state)));
  $('#selected-layer-count').textContent = `${selectedRegions.size} ${selectedRegions.size === 1 ? 'Layer' : 'Layers'} Selected`;
  $('#selected-layer-treatment').value = selectedModes.size === 1 ? [...selectedModes][0] : '';
  for (const option of $('#selected-layer-treatment').options) if (option.value) option.disabled = option.value !== 'outline' && selectedMembers.some(c => !c.closed);
  updateTypeReview();
  const filtered = Boolean(state.layerQuery || state.layerFilter !== 'all');
  $('#layer-reorder-hint').hidden = !filtered;
  const list = $('#outline-list');
  const key = JSON.stringify([state.hiddenContours, state.cutawayContours, state.materialTreatments, state.materialOrder, state.areaSuggestions, state.areaOverrides, state.areaDecisions, selected, state.layerQuery, state.layerFilter]);
  if (list.artwork !== state.artwork || list.visibilityKey !== key) {
    const focus = list.contains(document.activeElement) ? document.activeElement.id : null;
    const openGroups = new Set([...list.querySelectorAll('details.compound-children[open]')].map(el => el.dataset.group));
    const scroll = list.scrollTop;
    list.innerHTML = groups.map((regionId, position) => {
      const members = state.artwork.contours.filter(c => c.regionId === regionId), c = members[0];
      const label = htmlText(layerName(regionId)), compound = members.length > 1;
      const active = members.some(c => selected.includes(c.id));
      const hidden = members.every(c => state.hiddenContours.includes(c.id));
      const pending = uncertainAreas().includes(regionId);
      if (state.layerQuery && !layerName(regionId).toLowerCase().includes(state.layerQuery.toLowerCase()) || state.layerFilter === 'selected' && !active || state.layerFilter === 'review' && !pending) return '';
      const mode = materialMode(c, state), suggestion = state.areaSuggestions?.byRegion[regionId];
      const status = pending ? 'Needs Review' : state.areaDecisions[regionId] && state.areaDecisions[regionId] !== 'manual' ? 'Reviewed' : state.areaOverrides[regionId] ? 'Manual' : 'Automatic';
      const controls = orderControls(`layer-${regionId}`, label, position, groups.length, filtered);
      const children = compound ? `<details class="compound-children" data-group="${regionId}" ${openGroups.has(regionId) ? 'open' : ''}><summary>${members.length} Contours</summary>${members.map((contour, index) => `<div class="contour-child"><button id="select-${contour.id}" data-select-outline="${contour.id}" aria-pressed="${selected.includes(contour.id)}">Contour ${index + 1}</button><label class="check-label"><input id="visible-${contour.id}" type="checkbox" data-visible-outline="${contour.id}" aria-label="Show ${label} Contour ${index + 1}" ${state.hiddenContours.includes(contour.id) ? '' : 'checked'} />Visible</label></div>`).join('')}</details>` : '';
      return `<section class="layer-card ${compound ? 'compound-layer' : ''} ${active ? 'selected' : ''} ${hidden ? 'is-hidden' : ''}" role="listitem" data-order-id="${regionId}" data-order-label="${label}">
        <div class="layer-main">${controls}<button ${compound ? '' : `id="select-${c.id}"`} class="outline-select" data-select-outline="${c.id}" aria-label="Select ${label}" aria-pressed="${active}">${outlineThumbnail(c)}<span>${label}<small class="${pending ? 'needs-review' : ''}">${status}</small></span></button><label class="visibility-toggle" title="${hidden ? 'Show' : 'Hide'} ${label}"><input ${compound ? '' : `id="visible-${c.id}"`} type="checkbox" data-visible-layer="${regionId}" ${compound ? '' : `data-visible-outline="${c.id}"`} aria-label="${hidden ? 'Show' : 'Hide'} ${label}" ${hidden ? '' : 'checked'} /><span aria-hidden="true">${icon('eye')}</span></label></div>
        <label class="layer-treatment" for="treatment-${c.id}"><span>Layer Type</span><select id="treatment-${c.id}" data-treatment-outline="${c.id}" aria-label="${label} Type">${[['outline', 'Outline'], ['keep', 'Keep'], ['cut', 'Cut Away']].map(([value, text]) => `<option value="${value}" ${mode === value ? 'selected' : ''} ${value !== 'outline' && members.some(m => !m.closed) ? 'disabled' : ''}>${text}</option>`).join('')}</select></label>
        ${children}<details class="layer-explanation"><summary>Type Details</summary><div class="area-suggestion"><strong>${status}</strong>${suggestion ? `<span>Suggested Type: ${treatmentLabel(suggestion.mode)}</span><span>${htmlText(suggestion.reason)}</span><span>Confidence: ${suggestion.confidence}</span>` : '<span>Choose a layer type to control its treatment.</span>'}</div></details>
      </section>`;
    }).join('') || '<p class="empty-state">No layers match this filter.</p>';
    list.artwork = state.artwork; list.visibilityKey = key; list.scrollTop = scroll;
    if (focus) document.getElementById(focus)?.focus({ preventScroll: true });
  }
}

function fitSheet() {
  if (!state.scaled) return;
  const area = $('#canvas-viewport');
  const ratio = state.scaled.width / state.scaled.height;
  // Canvas dimensions are independent of editing controls; fit to the space
  // inside the canvas while leaving room for the dimension labels.
  const height = Math.max(1, Math.min(area.clientHeight - 80, (area.clientWidth - 96) / ratio));
  const wrap = $('#sheet-wrap');
  wrap.style.width = `${height * ratio}px`;
  wrap.style.height = `${height}px`;
  const maxX = height * ratio * Math.max(0, state.zoom - 1) / 2;
  const maxY = height * Math.max(0, state.zoom - 1) / 2;
  state.panX = Math.max(-maxX, Math.min(maxX, state.panX));
  state.panY = Math.max(-maxY, Math.min(maxY, state.panY));
  wrap.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  $('#zoom-label').textContent = `${Math.round(state.zoom * 100)}%`;
  previewPan.refresh();
  queueWorkspaceSave();
}

function selectedContour() { return state.scaled?.contours.find(c => c.id === state.selectedContour); }
function matchesTab(bridge, ref) { return bridge.contourId === ref.contourId && bridge.id === ref.id; }
function selectTab(contourId, id) {
  state.selectedContour = contourId; state.selectedTab = id;
  state.selectedTabs = id ? [{ contourId, id }] : [];
}
function selectedBridges() {
  return state.result?.bridges.filter(b => state.selectedTabs.some(ref => matchesTab(b, ref))) ?? [];
}
function selectionPositions() {
  return selectedBridges().map(b => ({ contourId: b.contourId, id: b.id, position: b.position, closed: state.scaled.contours.find(c => c.id === b.contourId).closed }));
}
function applyPositionDelta(tabs, delta) {
  // A shared bound keeps open-outline groups from collapsing at endpoints.
  const open = tabs.filter(t => !t.closed);
  if (open.length) delta = Math.max(-Math.min(...open.map(t => t.position)), Math.min(1 - Math.max(...open.map(t => t.position)), delta));
  for (const ref of tabs) {
    const contour = state.scaled.contours.find(c => c.id === ref.contourId);
    const tab = customizeContour(state.tabLayouts, contour, state).find(t => t.id === ref.id);
    const position = ref.position + delta;
    tab.position = ref.closed ? ((position % 1) + 1) % 1 : position;
  }
}
let positionGesture = null;
function selectedBridge() { return state.result?.bridges.find(b => b.contourId === state.selectedContour && b.id === state.selectedTab); }
function customizeSelected() {
  const contour = selectedContour();
  if (!contour) return [];
  const wasAutomatic = !Object.hasOwn(state.tabLayouts, contour.id);
  const tabs = customizeContour(state.tabLayouts, contour, state);
  if (wasAutomatic) notify('This layer now uses custom tab placement. Default width still applies.');
  return tabs;
}
function screenUnit() {
  return state.scaled.width / ($('#preview-svg').getBoundingClientRect().width || 350);
}
function renderTabMarkers() {
  const radius = screenUnit() * 3.5;
  return `<g class="tab-markers">${state.result.bridges.map(b => {
    const selected = state.editing && state.selectedTabs.some(ref => matchesTab(b, ref));
    const color = b.custom ? '#258477' : '#c3963e';
    const label = `${b.custom ? 'Custom' : 'Automatic'} tab, layer ${state.scaled.contours.findIndex(c => c.id === b.contourId) + 1}, ${b.width.toFixed(1)} mm${b.widthOverride == null ? ', default width' : ', width override'}`;
    return `<g data-tab="${b.id}" data-outline="${b.contourId}" class="tab-marker ${selected ? 'selected' : ''}" ${state.editing ? `tabindex="0" role="button" aria-label="${label}" aria-pressed="${selected}"` : ''}>
      <title>${label}</title>
      <path d="${b.segments.map(p => pathData(p, false)).join('')}" fill="none" stroke="${color}" stroke-width="${b.channelWidth + 0.65}" opacity="0.65"/>
      ${b.custom ? `<circle cx="${b.point.x}" cy="${b.point.y}" r="${radius}"` : `<rect x="${b.point.x - radius}" y="${b.point.y - radius}" width="${radius * 2}" height="${radius * 2}"`} fill="${color}" stroke="#fffef9" stroke-width="1" vector-effect="non-scaling-stroke"/>
      ${selected ? `<circle cx="${b.point.x}" cy="${b.point.y}" r="${radius + screenUnit() * 4}" fill="none" stroke="#ff2da6" stroke-width="3" vector-effect="non-scaling-stroke"/>` : ''}
      ${state.editing ? `<circle cx="${b.point.x}" cy="${b.point.y}" r="${screenUnit() * 12}" fill="transparent"/>` : ''}
    </g>`;
  }).join('')}</g>`;
}
function updateTabEditor() {
  const contours = channelContours();
  const automatic = contours.filter(c => !Object.hasOwn(state.tabLayouts, c.id)).length;
  const custom = contours.length - automatic;
  $('#automatic-scope').textContent = `Placement affects ${automatic} automatic outline${automatic === 1 ? '' : 's'}. ${custom} custom. Each contour in a compound layer gets its own count.`;
  for (const id of ['tabCount', 'tabOffset', 'tabs-minus', 'tabs-plus']) $(`#${id}`).disabled = automatic === 0;
  $('#reset-all-tabs').disabled = Object.keys(state.tabLayouts).length === 0;
  $('#edit-tabs').textContent = 'Tabs';
  $('#edit-tabs').setAttribute('aria-pressed', state.editing);
  $('#edit-tabs').setAttribute('aria-expanded', state.editing);
  $('#edit-tabs').disabled = false;
  $('#tabs-unavailable').hidden = contours.length > 0;
  $('#tabs-available').hidden = contours.length === 0;
  $('#add-tab').hidden = !state.editing;
  $('#add-tab').setAttribute('aria-pressed', state.adding);
  $('#add-tab').textContent = state.adding ? 'Finish Adding' : 'Add Tab';
  $('#edit-hint').hidden = !state.editing;
  $('#edit-hint').textContent = state.adding ? 'Click layers to keep adding tabs at the previewed positions. Choose Finish Adding or press Escape to finish.' : 'Drag tabs to move them. Drag empty space to select a group; Shift adds to the selection.';
  $('#tab-inspector').hidden = !state.editing;
  $('#show-tabs').disabled = false;
  $('#show-tabs').checked = state.showTabs;
  $('#outline-picker').innerHTML = contours.map(c => `<option value="${c.id}">${htmlText(layerName(c.regionId))}${state.artwork.contours.filter(member => member.regionId === c.regionId).length > 1 ? `, Contour ${state.artwork.contours.filter(member => member.regionId === c.regionId).indexOf(c) + 1}` : ''} (${Object.hasOwn(state.tabLayouts, c.id) ? 'Custom' : 'Automatic'})</option>`).join('');
  const contour = selectedContour();
  if (!contour) return;
  const isCustom = Object.hasOwn(state.tabLayouts, contour.id);
  const number = outlineNumber(contour.id);
  $('#outline-mode').textContent = isCustom ? 'Custom' : 'Automatic';
  $('#outline-mode').classList.toggle('custom', isCustom);
  $('#outline-mode-hint').textContent = isCustom ? 'Custom placement is preserved. Widths follow the default unless overridden.' : 'Editing a tab makes this layer custom and preserves its placement.';
  $('#outline-picker').value = contour.id;
  const tabs = state.result.bridges.filter(b => b.contourId === contour.id);
  $('#tab-picker').innerHTML = '<option value="">Select a tab…</option>' + tabs.map((b, i) => `<option value="${b.id}">Tab ${i + 1} (${b.width.toFixed(1)} mm, ${b.widthOverride == null ? 'Default' : 'Override'})</option>`).join('');
  $('#tab-picker').value = state.selectedTab ?? '';
  const bridge = selectedBridge();
  const selection = selectedBridges();
  const multiple = selection.length > 1;
  $('#remove-tab').textContent = multiple ? 'Remove Selected Tabs' : 'Remove Tab';
  $('label[for="selected-tab-position"]').textContent = multiple ? 'Position (Move Group)' : 'Position';
  $('#selected-tab-controls').hidden = !bridge;
  $('#selected-tab-actions').hidden = !bridge;
  $('#tab-empty-state').hidden = !!bridge;
  $('#remove-tab').disabled = !bridge;
  $('#inherit-tab-width').disabled = !bridge || bridge.widthOverride == null;
  $('#tab-inspector').classList.toggle('has-selection', !!bridge);
  $('#selected-outline-label').textContent = multiple ? `${selection.length} Tabs Selected` : bridge ? `Layer ${number}, Tab ${tabs.indexOf(bridge) + 1}` : `Layer ${number}`;
  if (bridge) {
    $('#selected-tab-width').value = selection.some(tab => tab.requestedWidth !== bridge.requestedWidth) ? '' : bridge.requestedWidth;
    $('#selected-tab-width').placeholder = 'Mixed';
    $('#selected-tab-width-range').value = bridge.requestedWidth;
    $('#selected-tab-position').value = Number((bridge.position * 100).toFixed(2));
    $('#selected-tab-position-range').value = $('#selected-tab-position').value;
    updateRangePaint();
    $('#tab-width-status').textContent = `${bridge.widthOverride == null ? 'Uses default width.' : 'Individual width override.'}${bridge.width < bridge.requestedWidth - 1e-7 ? ` Effective width: ${bridge.width.toFixed(2)} mm to fit this layer.` : ''}`;
    if (multiple) $('#tab-width-status').textContent = selection.every(b => b.requestedWidth === bridge.requestedWidth) ? 'Width applies to all selected tabs.' : 'Mixed widths. Set a width to apply it to all selected tabs.';
    $('#inherit-tab-width').disabled = selection.every(b => b.widthOverride == null);
  }
  $('#reset-outline').disabled = !isCustom;
}
function addTab(contourId, position) {
  state.selectedContour = contourId;
  mutate(() => {
    const tabs = customizeSelected();
    const id = `tab-${crypto.randomUUID()}`;
    tabs.push({ id, position, widthOverride: null }); selectTab(contourId, id);
  });
}
function removeSelectedTab() {
  const selection = selectedBridges();
  if (!selection.length) return;
  mutate(() => {
    for (const ref of selection) {
      const contour = state.scaled.contours.find(c => c.id === ref.contourId);
      const tabs = customizeContour(state.tabLayouts, contour, state);
      tabs.splice(tabs.findIndex(t => t.id === ref.id), 1);
    }
    selectTab(state.selectedContour, null);
  });
}
function updateSelectedTab(property, value, live = false) {
  const bridge = selectedBridge();
  if (!bridge) return;
  if (live && !pendingSettings) pendingSettings = snapshot();
  if (property === 'position' && !positionGesture) positionGesture = { tabs: selectionPositions(), anchor: bridge.position };
  const gesture = positionGesture;
  const apply = () => {
    if (property === 'position') applyPositionDelta(gesture.tabs, value - gesture.anchor);
    else for (const ref of selectedBridges()) {
      const contour = state.scaled.contours.find(c => c.id === ref.contourId);
      customizeContour(state.tabLayouts, contour, state).find(t => t.id === ref.id)[property] = value;
    }
  };
  if (live) { apply(); scheduleRender(); }
  else { mutate(apply); positionGesture = null; }
}
const regionEditor = createRegionEditor({ state, render, mutate, snapshot, restore, record: before => history.record(before), beginEdit: () => { if (!pendingSettings) pendingSettings = snapshot(); }, commit: commitSettings, save: queueWorkspaceSave, notify, svgPoint, screenUnit });
const bridgeEditor = createBridgeEditor({ state, render, mutate, snapshot, restore, record: before => history.record(before), commit: commitSettings, save: queueWorkspaceSave, notify, svgPoint, screenUnit });
const simplifyEditor = createSimplifyEditor({
  state, commit: commitWorkspaceEdits, download: downloadFile,
  apply(source) {
    const artwork = importSvg(source);
    mutate(() => {
      state.artwork = artwork; state.source = source; state.sourceWarnings = artwork.warnings;
      state.name = state.name.replace(/(?:-simplified)?\.svg$/i, '') + '-simplified.svg'; state.example = '';
      state.tabLayouts = {}; state.hiddenContours = []; state.cutawayContours = []; state.regions = [];
      Object.assign(state, materialDefaults()); bridgeEditor.cancel(); state.selectedRegionBridge = null; state.selectedRegionBridges = [];
      refreshAreaSuggestions();
      state.reviewingTypes = false; state.reviewRegion = null;
      state.selectedRegion = null; state.drawingRegion = false; state.regionDraft = [];
      state.selectedOutlines = []; state.selectedTabs = []; state.selectedContour = artwork.contours[0].id; state.selectedTab = null;
      state.adding = false;
      syncSourceInputs();
    });
    notify('Simplified artwork applied. Undo restores the previous SVG and edits.');
  },
});
$('#simplify-artwork').addEventListener('click', () => simplifyEditor.open());
const toolModes = { layers: 'editingOutlines', tabs: 'editing', bridges: 'editingBridges', regions: 'editingRegions' };
function syncEditingFlags() {
  for (const [tool, flag] of Object.entries(toolModes)) state[flag] = state.workflowStep === 2 && state.activeTool === tool;
}
function navigateStep(step) {
  if (![1, 2, 3].includes(step)) return;
  layerOrdering.cancel(); regionOrdering.cancel();
  commitWorkspaceEdits(); clearGhost();
  bridgeEditor.cancel(); state.adding = false;
  state.workflowStep = step; state.controlsCollapsed = false;
  syncEditingFlags(); render(); queueWorkspaceSave();
}
function activateTool(tool) {
  if (!(tool in toolModes)) return;
  if (state.workflowStep === 2 && state.activeTool === tool) return;
  layerOrdering.cancel(); regionOrdering.cancel();
  commitWorkspaceEdits(); clearGhost(); bridgeEditor.cancel();
  state.workflowStep = 2; state.activeTool = tool; state.controlsCollapsed = false; state.adding = false;
  if (tool === 'regions' && !state.selectedRegion && !state.drawingRegion) state.regionScope = state.selectedOutlines[0] ?? state.selectedContour ?? 'all';
  syncEditingFlags(); render(); queueWorkspaceSave();
}
function announce(message) { $('#announcements').textContent = message; }
for (const [tool, id] of Object.entries({ layers: 'edit-outlines', tabs: 'edit-tabs', bridges: 'edit-bridges', regions: 'edit-regions' })) $(`#${id}`).addEventListener('click', () => activateTool(tool));
document.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => navigateStep(Number(button.dataset.step))));
$('#step-next').addEventListener('click', () => navigateStep(state.workflowStep + 1));
$('#step-back').addEventListener('click', () => navigateStep(state.workflowStep - 1));
$('#toggle-controls').addEventListener('click', () => { state.controlsCollapsed = !state.controlsCollapsed; updateWorkspaceUI(state); queueWorkspaceSave(); });
document.addEventListener('click', event => {
  const tool = event.target.closest('[data-open-tool]');
  if (tool) activateTool(tool.dataset.openTool);
  if (event.target.closest('[data-review-types]')) reviewUncertainArea();
});
$('#review-areas').addEventListener('click', reviewUncertainArea);
$('#close-type-review').addEventListener('click', () => { state.reviewingTypes = false; render(); $('#review-areas').hidden ? $('#outline-inspector h2').focus() : $('#review-areas').focus(); });
$('#next-area').addEventListener('click', () => advanceTypeReview(1));
$('#previous-area').addEventListener('click', () => advanceTypeReview(-1));
$('#accept-area-suggestion').addEventListener('click', () => resolveTypeReview('accepted'));
$('#keep-area-type').addEventListener('click', () => resolveTypeReview('kept'));
$('#review-treatment').addEventListener('change', event => resolveTypeReview('manual', event.target.value));
$('#apply-area-suggestions').addEventListener('click', () => mutate(refreshAreaSuggestions));
$('#use-all-outlines').addEventListener('click', () => mutate(() => {
  state.materialTreatments = {}; state.hiddenContours = []; state.cutawayContours = [];
  markAreaOverrides(state.artwork.contours.map(c => c.id));
}));
$('#layer-search').addEventListener('input', event => { state.layerQuery = event.target.value; updateOutlineEditor(); });
$('#layer-filter').addEventListener('change', event => { state.layerFilter = event.target.value; updateOutlineEditor(); });
$('#clear-layer-filter').addEventListener('click', () => { state.layerQuery = ''; state.layerFilter = 'all'; $('#layer-search').value = ''; $('#layer-filter').value = 'all'; updateOutlineEditor(); });
const layerOrdering = createOrderedList({ element: $('#outline-list'), getIds: () => [...new Set([...state.materialOrder, ...state.artwork.contours.map(c => c.regionId)])].reverse(), disabled: () => Boolean(state.layerQuery || state.layerFilter !== 'all'), commit: ids => mutate(() => { state.materialOrder = [...ids].reverse(); }), announce });
const regionOrdering = createOrderedList({ element: $('#region-list'), getIds: () => state.regions.map(region => region.id).reverse(), disabled: () => state.drawingRegion, commit: ids => mutate(() => { state.regions = [...ids].reverse().map(id => state.regions.find(region => region.id === id)); }), announce });
$('#outline-list').addEventListener('click', e => {
  const button = e.target.closest('[data-select-outline]');
  if (button) selectOutline(button.dataset.selectOutline, e.shiftKey);
});
$('#outline-list').addEventListener('change', e => {
  if (e.target.matches('[data-treatment-outline]')) setLayerTypes([e.target.dataset.treatmentOutline], e.target.value);
  if (e.target.matches('[data-cutaway-outline]')) mutate(() => {
    const cutaways = new Set(state.cutawayContours);
    if (e.target.checked) cutaways.add(e.target.dataset.cutawayOutline);
    else cutaways.delete(e.target.dataset.cutawayOutline);
    state.cutawayContours = state.artwork.contours.filter(c => c.closed && cutaways.has(c.id)).map(c => c.id);
    markAreaOverrides([e.target.dataset.cutawayOutline]);
  });
  if (e.target.matches('[data-visible-layer]')) return setOutlineVisibility(state.artwork.contours.filter(c => c.regionId === e.target.dataset.visibleLayer).map(c => c.id), e.target.checked);
  if (e.target.matches('[data-visible-outline]')) setOutlineVisibility([e.target.dataset.visibleOutline], e.target.checked);
});
$('#selected-layer-treatment').addEventListener('change', e => setLayerTypes(state.selectedOutlines, e.target.value));
$('#show-hidden-outlines').addEventListener('change', e => { state.showHiddenOutlines = e.target.checked; render(); });
$('#hide-outlines').addEventListener('click', () => setOutlineVisibility(state.selectedOutlines, false));
$('#show-outlines').addEventListener('click', () => setOutlineVisibility(state.selectedOutlines, true));
$('#show-all-outlines').addEventListener('click', () => setOutlineVisibility(state.hiddenContours, true));
$('#recover-layers').addEventListener('click', () => setOutlineVisibility(state.hiddenContours, true));
$('#keep-only-outlines').addEventListener('click', () => mutate(() => {
  state.hiddenContours = state.artwork.contours.filter(c => !state.selectedOutlines.includes(c.id)).map(c => c.id);
  markAreaOverrides(state.artwork.contours.map(c => c.id));
}));
$('#add-tab').addEventListener('click', () => { state.adding = !state.adding; render(); });
document.querySelectorAll('input[name="rectangle-selection-scope"]').forEach(input => {
  input.addEventListener('change', e => { state.selectCurrentOutlineOnly = e.target.value === 'selected'; updateTabEditor(); queueWorkspaceSave(); });
});
$('#outline-picker').addEventListener('change', e => { commitSettings(); selectTab(e.target.value, null); render(); });
$('#tab-picker').addEventListener('change', e => { commitSettings(); selectTab(state.selectedContour, e.target.value || null); render(); });
$('#selected-tab-width').addEventListener('change', e => {
  const value = Number(e.target.value);
  if (e.target.value === '' || !Number.isFinite(value)) return updateTabEditor();
  updateSelectedTab('widthOverride', Math.max(0.5, Math.min(15, value)));
});
$('#selected-tab-position').addEventListener('change', e => {
  const value = Number(e.target.value);
  if (e.target.value === '' || !Number.isFinite(value)) return updateTabEditor();
  updateSelectedTab('position', Math.max(0, Math.min(100, value)) / 100);
});
for (const [id, property, scale] of [
  ['selected-tab-width-range', 'widthOverride', 1],
  ['selected-tab-position-range', 'position', 100],
]) {
  const slider = $(`#${id}`);
  slider.addEventListener('input', e => updateSelectedTab(property, Number(e.target.value) / scale, true));
  slider.addEventListener('change', commitSettings);
  slider.addEventListener('blur', commitSettings);
}
$('#inherit-tab-width').addEventListener('click', () => updateSelectedTab('widthOverride', null));
$('#remove-tab').addEventListener('click', removeSelectedTab);
$('#reset-outline').addEventListener('click', () => mutate(() => { delete state.tabLayouts[state.selectedContour]; state.selectedTab = null; }));
$('#reset-all-tabs').addEventListener('click', () => mutate(() => { state.tabLayouts = {}; state.selectedTab = null; }));
function svgPoint(event) {
  const matrix = $('#preview-svg').getScreenCTM();
  return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : null;
}
function nearestOutline(event) {
  const point = svgPoint(event);
  if (!point) return null;
  let nearest = null;
  for (const contour of channelContours()) {
    const projected = nearestOnContour(contour, point);
    if (!nearest || projected.distance < nearest.distance) nearest = { ...projected, contour };
  }
  return nearest && nearest.distance <= screenUnit() * 16 ? nearest : null;
}
function clearGhost() { $('#tab-ghost')?.remove(); }
function showGhost(event) {
  clearGhost();
  const nearest = nearestOutline(event);
  if (!nearest) return;
  const ghost = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  ghost.id = 'tab-ghost'; ghost.setAttribute('cx', nearest.point.x); ghost.setAttribute('cy', nearest.point.y);
  ghost.setAttribute('r', screenUnit() * 6); ghost.setAttribute('fill', '#258477'); ghost.setAttribute('fill-opacity', '0.35');
  ghost.setAttribute('stroke', '#258477'); ghost.setAttribute('stroke-width', '2'); ghost.setAttribute('vector-effect', 'non-scaling-stroke'); ghost.setAttribute('pointer-events', 'none');
  $('#preview-svg').append(ghost);
}
let drag = null, suppressOutlineClick = false;
const preview = $('#preview-svg');
const previewPan = createPreviewPan({
  viewport: $('#canvas-viewport'), button: $('#pan-preview'),
  enabled: () => state.zoom > 1,
  active: () => !document.querySelector('dialog[open]'),
  defaultDrag: () => !state.editing && !state.editingOutlines && !state.editingRegions && !state.editingBridges,
  getPosition: () => ({ x: state.panX, y: state.panY }),
  setPosition: ({ x, y }) => { state.panX = x; state.panY = y; fitSheet(); },
  changed: queueWorkspaceSave,
});
function drawSelectionBox(start, end) {
  $('#tab-selection-box')?.remove();
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.id = 'tab-selection-box';
  for (const [key, value] of Object.entries({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) })) rect.setAttribute(key, value);
  preview.append(rect);
}
preview.addEventListener('pointerdown', e => {
  if (e.button !== 0 || drag) return;
  if (state.editingOutlines) {
    suppressOutlineClick = false;
    commitSettings();
    drag = { kind: 'layers', pointerId: e.pointerId, x: e.clientX, y: e.clientY, start: svgPoint(e), moved: false,
      outlineId: e.target.closest('[data-visibility-outline]')?.dataset.visibilityOutline, additive: e.shiftKey,
      previousSelection: [...state.selectedOutlines], previous: e.shiftKey ? [...state.selectedOutlines] : [] };
    if (e.isTrusted) preview.setPointerCapture(e.pointerId);
    e.preventDefault();
    return;
  }
  if (!state.editing) return;
  if (state.adding) {
    const nearest = nearestOutline(e);
    if (nearest) { e.preventDefault(); addTab(nearest.contour.id, nearest.position); showGhost(e); }
    return;
  }
  commitSettings();
  const marker = e.target.closest('[data-tab]');
  const outline = e.target.closest('[data-outline]');
  const previous = [...state.selectedTabs];
  const selectionContour = state.selectCurrentOutlineOnly ? state.selectedContour : null;
  if (marker) {
    const ref = { contourId: marker.dataset.outline, id: marker.dataset.tab };
    if (!state.selectedTabs.some(t => t.id === ref.id && t.contourId === ref.contourId)) {
      selectTab(ref.contourId, ref.id);
      if (e.shiftKey) state.selectedTabs = [...previous, ref];
    } else { state.selectedContour = ref.contourId; state.selectedTab = ref.id; }
  } else selectTab(outline?.dataset.outline ?? state.selectedContour, null);
  drag = { kind: marker ? 'tabs' : 'box', pointerId: e.pointerId, x: e.clientX, y: e.clientY, start: svgPoint(e), before: snapshot(), moved: false,
    tabs: selectionPositions(), anchor: selectedBridge()?.position, contourId: state.selectedContour, selectionContour, previous: e.shiftKey ? previous.filter(ref => marker || !selectionContour || ref.contourId === selectionContour) : [] };
  // Capture on the persistent SVG, whose marker children are replaced on render.
  if (e.isTrusted) preview.setPointerCapture(e.pointerId);
  e.preventDefault(); render();
});
preview.addEventListener('click', e => {
  if (state.editingOutlines) {
    if (suppressOutlineClick && e.detail !== 0) { suppressOutlineClick = false; return; }
    const outline = e.target.closest('[data-visibility-outline]');
    selectOutline(outline?.dataset.visibilityOutline, e.shiftKey);
    return;
  }
  if (!state.editing || state.adding || e.detail !== 0) return;
  const marker = e.target.closest('[data-tab]');
  if (!marker) return;
  selectTab(marker.dataset.outline, marker.dataset.tab); render();
});
preview.addEventListener('pointermove', e => {
  if (state.adding) return showGhost(e);
  if (!drag || drag.pointerId !== e.pointerId) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 3) return;
  const point = svgPoint(e); if (!point) return;
  drag.moved = true;
  if (drag.kind === 'layers') {
    const left = Math.min(drag.start.x, point.x), right = Math.max(drag.start.x, point.x);
    const top = Math.min(drag.start.y, point.y), bottom = Math.max(drag.start.y, point.y);
    // A contour enclosed by the rectangle selects its whole source layer.
    const regions = new Set(state.scaled.contours.filter(c => (state.showHiddenOutlines || !state.hiddenContours.includes(c.id)) &&
      c.points.length && c.points.every(p => p.x >= left && p.x <= right && p.y >= top && p.y <= bottom)).map(c => c.regionId));
    state.selectedOutlines = [...new Set([...drag.previous, ...state.scaled.contours.filter(c => regions.has(c.regionId)).map(c => c.id)])];
    render(); drawSelectionBox(drag.start, point);
  } else if (drag.kind === 'box') {
    const start = drag.start;
    const inside = state.result.bridges.filter(b => (!drag.selectionContour || b.contourId === drag.selectionContour) && b.point.x >= Math.min(start.x, point.x) && b.point.x <= Math.max(start.x, point.x) && b.point.y >= Math.min(start.y, point.y) && b.point.y <= Math.max(start.y, point.y));
    state.selectedTabs = [...drag.previous];
    for (const b of inside) if (!state.selectedTabs.some(ref => matchesTab(b, ref))) state.selectedTabs.push({ contourId: b.contourId, id: b.id });
    const anchor = state.selectedTabs[0];
    state.selectedTab = anchor?.id ?? null;
    if (anchor) state.selectedContour = anchor.contourId;
    else if (drag.selectionContour) state.selectedContour = drag.selectionContour;
    render(); drawSelectionBox(start, point);
  } else {
    const contour = state.scaled.contours.find(c => c.id === drag.contourId);
    const position = nearestOnContour(contour, point).position;
    let delta = position - drag.anchor;
    if (contour.closed && drag.tabs.length > 1) delta -= Math.round(delta);
    applyPositionDelta(drag.tabs, delta); render();
  }
});
function finishDrag(event, cancelled = false) {
  if (!drag || drag.pointerId !== event.pointerId) return;
  const finished = drag; drag = null;
  $('#tab-selection-box')?.remove();
  if (finished.kind === 'layers') {
    suppressOutlineClick = true;
    if (cancelled) { state.selectedOutlines = finished.previousSelection; render(); }
    else if (finished.moved) queueWorkspaceSave();
    else selectOutline(finished.outlineId, finished.additive);
  } else if (cancelled && finished.moved) restore(finished.before);
  else if (finished.moved && finished.kind === 'tabs') history.record(finished.before);
  if (preview.hasPointerCapture(event.pointerId)) preview.releasePointerCapture(event.pointerId);
}
preview.addEventListener('pointerup', e => finishDrag(e));
preview.addEventListener('pointercancel', e => finishDrag(e, true));
preview.addEventListener('lostpointercapture', e => finishDrag(e, true));
preview.addEventListener('pointerleave', clearGhost);
$('#preview-svg').addEventListener('keydown', e => {
  if (state.editingOutlines) {
    const outline = e.target.closest('[data-visibility-outline]');
    if (!outline || !['Enter', ' ', 'Delete', 'Backspace'].includes(e.key)) return;
    e.preventDefault();
    const id = outline.dataset.visibilityOutline;
    if (e.key === 'Enter' || e.key === ' ') selectOutline(id, e.shiftKey);
    else {
      if (!state.selectedOutlines.includes(id)) state.selectedOutlines = [id];
      setOutlineVisibility(state.selectedOutlines, false);
    }
    (preview.querySelector(`[data-visibility-outline="${id}"]`) ?? $(`#select-${id}`)).focus({ preventScroll: true });
    return;
  }
  const marker = e.target.closest('[data-tab]');
  if (!marker || !state.editing) return;
  if (['Enter', ' ', 'Delete', 'Backspace', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault();
    if (!state.selectedTabs.some(ref => ref.contourId === marker.dataset.outline && ref.id === marker.dataset.tab)) selectTab(marker.dataset.outline, marker.dataset.tab);
    else { state.selectedContour = marker.dataset.outline; state.selectedTab = marker.dataset.tab; }
    if (e.key === 'Delete' || e.key === 'Backspace') removeSelectedTab();
    else if (e.key.startsWith('Arrow')) {
      const bridge = selectedBridge();
      const direction = e.key === 'ArrowLeft' ? -1 : 1;
      const value = bridge.position + direction * (e.shiftKey ? 0.01 : 0.001);
      updateSelectedTab('position', selectedContour().closed ? (value + 1) % 1 : Math.max(0, Math.min(1, value)));
    } else render();
    // The SVG children are replaced on render, so explicitly preserve keyboard focus.
    const target = [...$('#preview-svg').querySelectorAll('[data-tab]')].find(el => el.dataset.tab === state.selectedTab && el.dataset.outline === state.selectedContour);
    (target ?? $('#tab-picker')).focus();
  }
});
$('#outline-list').addEventListener('keydown', e => {
  const button = e.target.closest('[data-select-outline]');
  if (!button || !['Delete', 'Backspace'].includes(e.key)) return;
  e.preventDefault();
  if (!state.selectedOutlines.includes(button.dataset.selectOutline)) state.selectedOutlines = [button.dataset.selectOutline];
  setOutlineVisibility(state.selectedOutlines, false);
});
document.addEventListener('keydown', e => {
  if (e.defaultPrevented) return;
  if (e.key === 'Escape' && (state.adding || drag)) {
    e.preventDefault();
    if (drag) finishDrag({ pointerId: drag.pointerId }, true);
    state.adding = false; clearGhost(); render();
    return;
  }
  if (state.editing && ['Delete', 'Backspace'].includes(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey && !e.target.closest('input, textarea, [contenteditable="true"]') && selectedBridges().length) {
    e.preventDefault();
    if (drag) finishDrag({ pointerId: drag.pointerId });
    removeSelectedTab();
    return;
  }
  if (e.target.closest('input, select, textarea, [contenteditable="true"]')) return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault(); bridgeEditor.finishGesture(); regionEditor.finishGesture(); commitSettings(); if (e.shiftKey) history.redo(); else history.undo();
  }
});

function loadSource(source, name, example = '') {
  try {
    const artwork = importSvg(source);
    state.sourceChosen = Boolean(state.source);
    state.workflowStep = 1;
    bridgeEditor.cancel(); Object.assign(state, materialDefaults()); state.selectedRegionBridge = null; state.selectedRegionBridges = [];
    cancelAnimationFrame(renderFrame);
    state.artwork = artwork; state.source = source; state.example = example; state.name = name; state.sourceWarnings = artwork.warnings; state.zoom = 1; state.panX = state.panY = 0; previewPan.reset();
    state.tabLayouts = {}; state.hiddenContours = []; state.cutawayContours = []; state.regions = []; state.selectedRegion = null; state.drawingRegion = false; state.regionDraft = []; state.selectedOutlines = []; state.selectedTabs = []; state.selectedContour = artwork.contours[0].id; state.selectedTab = null; state.adding = false;
    state.reviewingTypes = false; state.reviewRegion = null; state.layerQuery = ''; state.layerFilter = 'all'; $('#layer-search').value = ''; $('#layer-filter').value = 'all';
    refreshAreaSuggestions();
    if (examples[example]?.treatments) {
      state.materialTreatments = structuredClone(examples[example].treatments);
      markAreaOverrides(artwork.contours.map(c => c.id));
    }
    history.clear(); pendingSettings = null;
    $('#filename').textContent = name;
    $('#notice').hidden = true;
    document.querySelectorAll('[data-example]').forEach(b => b.classList.toggle('active', b.dataset.example === example));
    render();
  } catch (error) { notify(error.message, 'error'); }
}

async function readFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.svg') && file.type !== 'image/svg+xml') return notify('Please choose an SVG vector file.', 'error');
  if (file.size > 3_000_000) return notify('Please use an SVG smaller than 3 MB.', 'error');
  try { loadSource(await file.text(), file.name); } catch { notify('The file could not be opened. Please try again.', 'error'); }
  $('#file-input').value = '';
}
$('#upload').addEventListener('click', () => $('#file-input').click());
$('#file-input').addEventListener('change', e => readFile(e.target.files[0]));
for (const event of ['dragenter', 'dragover']) $('#upload').addEventListener(event, e => { e.preventDefault(); $('#upload').classList.add('dragging'); });
$('#upload').addEventListener('dragleave', () => $('#upload').classList.remove('dragging'));
$('#upload').addEventListener('drop', e => { e.preventDefault(); $('#upload').classList.remove('dragging'); readFile(e.dataTransfer.files[0]); });
// Prevent dropped files from navigating away from the editor.
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => { e.preventDefault(); if (!e.target.closest('#upload') && e.dataTransfer?.files.length) readFile(e.dataTransfer.files[0]); });
document.querySelectorAll('[data-example]').forEach(b => b.addEventListener('click', () => { const example = examples[b.dataset.example]; loadSource(example.svg, example.name, b.dataset.example); }));

let renderFrame;
let pendingSettings = null;
const history = createHistory();
function createHistory() {
  const past = [], future = [];
  return {
    record(before) { if (JSON.stringify(before) === JSON.stringify(snapshot())) return; past.push(before); if (past.length > 100) past.shift(); future.length = 0; updateHistoryButtons(); },
    undo() { if (!past.length) return; future.push(snapshot()); restore(past.pop()); },
    redo() { if (!future.length) return; past.push(snapshot()); restore(future.pop()); },
    clear() { past.length = 0; future.length = 0; updateHistoryButtons(); },
    serialize() { return structuredClone({ past, future }); },
    hydrate(saved) { past.splice(0, past.length, ...saved.past); future.splice(0, future.length, ...saved.future); updateHistoryButtons(); },
    get canUndo() { return past.length > 0; }, get canRedo() { return future.length > 0; },
  };
}
function snapshot() {
  return structuredClone({ source: state.source, name: state.name, example: state.example, settings: Object.fromEntries(Object.keys(defaults).map(key => [key, state[key]])), tabLayouts: state.tabLayouts, hiddenContours: state.hiddenContours, cutawayContours: state.cutawayContours, regions: state.regions, ...Object.fromEntries(Object.keys(materialDefaults()).map(key => [key, state[key]])) });
}
function syncSourceInputs() {
  $('#filename').textContent = state.name;
  document.querySelectorAll('[data-example]').forEach(b => b.classList.toggle('active', b.dataset.example === state.example));
}
function restore(saved) {
  cancelAnimationFrame(renderFrame); pendingSettings = null; positionGesture = null;
  if (saved.source && saved.source !== state.source) {
    state.artwork = importSvg(saved.source); state.source = saved.source;
    state.sourceWarnings = state.artwork.warnings; state.name = saved.name; state.example = saved.example ?? '';
    state.selectedContour = state.artwork.contours[0].id; state.selectedOutlines = []; state.selectedTabs = [];
    syncSourceInputs();
  }
  Object.assign(state, defaults, saved.settings); state.tabLayouts = structuredClone(saved.tabLayouts);
  state.hiddenContours = [...(saved.hiddenContours ?? [])];
  state.cutawayContours = [...(saved.cutawayContours ?? [])];
  for (const [key, value] of Object.entries(materialDefaults())) state[key] = structuredClone(saved[key] ?? value);
  preserveLegacyAreaChoices(saved);
  state.selectedRegionBridge = null; state.selectedRegionBridges = [];
  state.regions = structuredClone(saved.regions ?? []).map((region, index) => ({ ...region, label: region.label ?? `Region ${index + 1}` }));
  state.drawingRegion = false; state.regionDraft = [];
  state.selectedTab = null;
  syncSettingInputs(); render(); updateHistoryButtons();
}
function updateHistoryButtons() {
  $('#undo').disabled = !history.canUndo; $('#redo').disabled = !history.canRedo;
  queueWorkspaceSave();
}
function commitSettings() { positionGesture = null; if (pendingSettings) { history.record(pendingSettings); pendingSettings = null; } queueWorkspaceSave(); }
function mutate(action) {
  commitSettings(); cancelAnimationFrame(renderFrame);
  const before = snapshot(); action(); render(); history.record(before);
}
function scheduleRender() { cancelAnimationFrame(renderFrame); renderFrame = requestAnimationFrame(render); }
function syncSettingInputs() {
  for (const key of Object.keys(defaults)) {
    if ($(`#${key}`)) {
      if ($(`#${key}`).type === 'checkbox') $(`#${key}`).checked = state[key];
      else $(`#${key}`).value = state[key];
    }
    if ($(`#${key}-range`)) $(`#${key}-range`).value = state[key];
  }
  document.querySelectorAll('[data-shape-setting]').forEach(button => {
    const selected = state[button.dataset.shapeSetting] === (button.dataset.rounded === 'true');
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  updateRangePaint();
}
function syncControl(key, value, live = false) {
  const input = $(`#${key}`);
  if (value === '' || !Number.isFinite(Number(value))) { input.value = state[key]; return; }
  let number = Math.max(Number(input.min), Math.min(Number(input.max), Number(value)));
  if (key === 'tabCount') number = Math.round(number);
  if (!pendingSettings) pendingSettings = snapshot();
  state[key] = number;
  syncSettingInputs(); scheduleRender();
  if (!live) commitSettings();
}
for (const key of ['artworkWidth', 'channelWidth', 'tabWidth', 'tabCount', 'tabOffset']) {
  $(`#${key}`).addEventListener('change', e => syncControl(key, e.target.value));
  const slider = $(`#${key}-range`) || (key === 'tabOffset' ? $(`#${key}`) : null);
  if (slider && slider !== $(`#${key}`)) slider.addEventListener('change', () => commitSettings());
  slider?.addEventListener('input', e => syncControl(key, e.target.value, true));
}
function updateRangePaint() { document.querySelectorAll('input[type="range"]').forEach(el => el.style.setProperty('--range', `${(el.value - el.min) / (el.max - el.min) * 100}%`)); }
document.querySelectorAll('[data-shape-setting]').forEach(button => {
  button.addEventListener('click', () => {
    const key = button.dataset.shapeSetting, rounded = button.dataset.rounded === 'true';
    if (state[key] === rounded) return;
    mutate(() => { state[key] = rounded; syncSettingInputs(); });
  });
});
$('#tabs-minus').addEventListener('click', () => syncControl('tabCount', state.tabCount - 1));
$('#tabs-plus').addEventListener('click', () => syncControl('tabCount', state.tabCount + 1));
$('#reset').addEventListener('click', () => { mutate(() => { Object.assign(state, defaults); state.tabLayouts = {}; state.selectedTab = null; syncSettingInputs(); }); notify('Stencil settings and tabs reset. Undo is available.'); });
$('#undo').addEventListener('click', () => { bridgeEditor.finishGesture(); regionEditor.finishGesture(); commitSettings(); history.undo(); });
$('#redo').addEventListener('click', () => { bridgeEditor.finishGesture(); regionEditor.finishGesture(); history.redo(); });
$('#show-tabs').addEventListener('change', e => { state.showTabs = e.target.checked; render(); });
$('#show-bridges').addEventListener('change', e => { state.showBridges = e.target.checked; render(); });
$('#show-original').addEventListener('change', e => { state.showOriginal = e.target.checked; render(); });
for (const mode of ['material', 'cut']) $(`#${mode}-view`).addEventListener('click', () => {
  state.view = mode;
  for (const v of ['material', 'cut']) { $(`#${v}-view`).classList.toggle('active', v === mode); $(`#${v}-view`).setAttribute('aria-pressed', v === mode); }
  render();
});
$('#zoom-in').addEventListener('click', () => { state.zoom = Math.min(3, state.zoom + 0.25); fitSheet(); });
$('#zoom-out').addEventListener('click', () => { state.zoom = Math.max(0.25, state.zoom - 0.25); fitSheet(); });
$('#zoom-fit').addEventListener('click', () => { state.zoom = 1; state.panX = state.panY = 0; previewPan.reset(); fitSheet(); });
function downloadFile(data, type, filename) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('#download').addEventListener('click', () => {
  commitWorkspaceEdits();
  if (!state.result?.paths.length) return;
  const data = exportSvg(state.result, state.scaled.width, state.scaled.height, state.name.replace(/\.svg$/i, '') + ' stencil');
  downloadFile(data, 'image/svg+xml', state.name.replace(/\.svg$/i, '') + '-stencil.svg');
  notify(`Stencil downloaded — ${state.scaled.width.toFixed(1)} × ${state.scaled.height.toFixed(1)} mm.`);
});
$('#export-session').addEventListener('click', () => {
  if (!state.source) return;
  commitWorkspaceEdits();
  const session = { format: 'stencil-studio-session', exportedAt: new Date().toISOString(), ...captureWorkspace() };
  downloadFile(JSON.stringify(session, null, 2) + '\n', 'application/json', state.name.replace(/\.svg$/i, '') + '-session.json');
  notify('Session exported with the original SVG, settings, edits, and undo history.');
});
$('#help').addEventListener('click', () => $('#help-dialog').showModal());
for (const id of ['close-help', 'got-it']) $(`#${id}`).addEventListener('click', () => $('#help-dialog').close());
$('#help-dialog').addEventListener('click', e => { if (e.target === $('#help-dialog')) { const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close(); } });
new ResizeObserver(scheduleRender).observe($('#canvas-viewport'));
let workspaceSaveTimer;
let storageWarningShown = false;
updateRangePaint();
if (!restoreWorkspace()) loadSource(examples.bloom.svg, examples.bloom.name, 'bloom');

// Save source SVG and editing data, rather than generated geometry or DOM nodes.
// The optional namespace lets browser checks use their own workspace.
function storageKey() {
  const workspace = new URLSearchParams(location.search).get('workspace');
  return workspace ? `${workspaceKey}:${workspace}` : workspaceKey;
}
function queueWorkspaceSave() {
  clearTimeout(workspaceSaveTimer);
  workspaceSaveTimer = setTimeout(saveWorkspace, 150);
}
function captureWorkspace() {
  const ui = Object.fromEntries(['view', 'showTabs', 'showOriginal', 'zoom', 'panX', 'panY', 'editing', 'adding', 'selectedContour', 'selectedTab', 'selectedTabs', 'selectCurrentOutlineOnly', 'editingOutlines', 'selectedOutlines', 'showHiddenOutlines', 'editingRegions', 'selectedRegion', 'drawingRegion', 'regionDraft', 'regionWidth', 'regionTaperLength', 'regionScope'].map(key => [key, state[key]]));
  const viewport = $('#canvas-viewport');
  Object.assign(ui, { workflowStep: state.workflowStep, activeTool: state.activeTool, showBridges: state.showBridges, reviewingTypes: state.reviewingTypes, reviewRegion: state.reviewRegion, sourceChosen: state.sourceChosen, editingBridges: state.editingBridges, selectedRegionBridge: state.selectedRegionBridge, selectedRegionBridges: state.selectedRegionBridges });
  return {
    version: 1, source: state.source, name: state.name, example: state.example,
    document: snapshot(), ui, history: history.serialize(),
    scroll: { x: window.scrollX, y: window.scrollY, canvasX: viewport.scrollLeft, canvasY: viewport.scrollTop },
    focus: document.activeElement?.id || null,
  };
}
function saveWorkspace() {
  clearTimeout(workspaceSaveTimer);
  if (!state.source) return;
  const saved = captureWorkspace();
  let result;
  try { result = writeWorkspace(localStorage, saved, storageKey()); }
  catch { result = { saved: false }; }
  const saveMessage = result.saved ? result.historyTruncated ? 'Saved with Shortened History' : 'Saved on This Device' : 'Could Not Save';
  if ($('#save-status').textContent !== saveMessage) $('#save-status').textContent = saveMessage;
  $('#save-status').classList.toggle('save-error', !result.saved);
  if ((!result.saved || result.historyTruncated) && !storageWarningShown) {
    storageWarningShown = true;
    notify(result.saved ? 'Workspace saved, but browser storage is full; older undo history could not be kept.' : 'This browser could not save your workspace. Keep this page open to retain your edits.', 'warning');
  }
}
function restoreWorkspace() {
  let saved;
  try { saved = readWorkspace(localStorage, storageKey()); } catch { return false; }
  if (!saved) return false;
  try {
    const artwork = importSvg(saved.source);
    const contourIds = new Set(artwork.contours.map(c => c.id));
    const selectedContour = contourIds.has(saved.ui.selectedContour) ? saved.ui.selectedContour : artwork.contours[0].id;
    Object.assign(state, saved.document.settings, saved.ui, { artwork, source: saved.source, name: saved.name, example: saved.example, sourceWarnings: artwork.warnings, tabLayouts: saved.document.tabLayouts, selectedContour });
    state.hiddenContours = (saved.document.hiddenContours ?? []).filter(id => contourIds.has(id));
    state.regions = structuredClone(saved.document.regions ?? []).map((region, index) => ({ ...region, label: region.label ?? `Region ${index + 1}` }));
    state.cutawayContours = (saved.document.cutawayContours ?? []).filter(id => artwork.contours.some(c => c.id === id && c.closed));
    for (const [key, value] of Object.entries(materialDefaults())) state[key] = structuredClone(saved.document[key] ?? value);
    preserveLegacyAreaChoices(saved.document);
    state.workflowStep = saved.ui.workflowStep ?? 2;
    state.activeTool = saved.ui.activeTool ?? (saved.ui.editing ? 'tabs' : saved.ui.editingRegions ? 'regions' : saved.ui.editingBridges ? 'bridges' : 'layers');
    state.showBridges = saved.ui.showBridges ?? saved.ui.showTabs;
    state.sourceChosen = saved.ui.sourceChosen ?? true;
    state.reviewingTypes = saved.ui.reviewingTypes ?? false;
    state.reviewRegion = saved.ui.reviewRegion ?? null;
    state.selectedRegionBridges = saved.ui.selectedRegionBridges ?? (saved.ui.selectedRegionBridge ? [saved.ui.selectedRegionBridge] : []);
    state.selectedOutlines = (saved.ui.selectedOutlines ?? []).filter(id => contourIds.has(id));
    // Controls outside the SVG are persistent DOM, so synchronize them explicitly.
    $('#filename').textContent = state.name;
    $('#show-tabs').checked = state.showTabs;
    $('#show-original').checked = state.showOriginal;
    $('#selected-layer-only').checked = state.selectCurrentOutlineOnly;
    $('#all-layers').checked = !state.selectCurrentOutlineOnly;
    for (const view of ['material', 'cut']) {
      $(`#${view}-view`).classList.toggle('active', state.view === view);
      $(`#${view}-view`).setAttribute('aria-pressed', state.view === view);
    }
    document.querySelectorAll('[data-example]').forEach(button => button.classList.toggle('active', button.dataset.example === state.example));
    syncSettingInputs();
    // Older snapshots share the workspace source. Bind it now so Undo can
    // cross a later artwork replacement without losing that original SVG.
    history.hydrate(Object.fromEntries(['past', 'future'].map(key => [key, saved.history[key].map(entry => ({ source: saved.source, name: saved.name, example: saved.example ?? '', ...entry }))])));
    render();
    requestAnimationFrame(() => {
      const focus = typeof saved.focus === 'string' ? document.getElementById(saved.focus) : null;
      focus?.focus({ preventScroll: true });
      if (saved.scroll && Object.values(saved.scroll).every(Number.isFinite)) {
        window.scrollTo(saved.scroll.x, saved.scroll.y);
        $('#canvas-viewport').scrollTo(saved.scroll.canvasX, saved.scroll.canvasY);
      }
    });
    return true;
  } catch { return false; }
}
function commitWorkspaceEdits() {
  bridgeEditor.finishGesture();
  regionEditor.finishGesture();
  const active = document.activeElement;
  if (active instanceof HTMLInputElement && active.type === 'number') active.dispatchEvent(new Event('change', { bubbles: true }));
  if (drag) finishDrag({ pointerId: drag.pointerId });
  commitSettings();
}
function flushWorkspace() {
  commitWorkspaceEdits();
  saveWorkspace();
}
window.addEventListener('stencil:before-reload', flushWorkspace);
window.addEventListener('pagehide', flushWorkspace);
window.addEventListener('beforeunload', flushWorkspace);
window.addEventListener('scroll', queueWorkspaceSave, { passive: true });
$('#canvas-viewport').addEventListener('scroll', queueWorkspaceSave, { passive: true });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushWorkspace(); });
