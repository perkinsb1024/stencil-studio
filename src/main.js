import { objectSettings } from './object-settings.js';
import { configureLengthControls, displayLength, formatLength, gridMarkup, setLengthValue, toMillimeters } from './units.js';
import { drawMarginSelection, clearMarginSelection } from './selection-overlay.js';
import { createBusyTask } from './busy-task.js';
import { updateWorkspaceUI, updatePanHint } from './workspace-ui.js';
import { pendingTypeReviews, typeReviewIds, decideLayerType } from './type-review.js';
import { workspaceView } from './workspace-view.js';
import { createOrderedList, orderControls } from './ordered-list.js';
import { scaleRegions } from './regions.js';
import { createRegionEditor } from './region-editor.js';
import { importSvg, examples } from './import-svg.js';
import { at, pathData, exportSvg } from './geometry.js';
import { customizeContour, nearestOnContour, resolveTabs } from './tab-layout.js';
import { workspaceKey, readWorkspace, writeWorkspace } from './workspace-storage.js';
import { createSimplifyEditor } from './simplify-editor.js';
import { createPreviewPan } from './preview-pan.js';
import { createMeasureTool } from './measure-tool.js';
import { createPreviewDimensions } from './preview-dimensions.js';
import { createLivePreview } from './live-preview.js';
import { createBridgeEditor, bridgePanel } from './bridge-editor.js';
import { materialMode, scaleBridges } from './material-geometry.js';
import { suggestionDefaults, treatmentLabel } from './area-suggestions.js';
import { installCustomSelects } from './custom-select.js';

const icons = {
  upload: '<path d="M12 16V4m-4 4 4-4 4 4M4 15v5h16v-5"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  file: '<path d="M14 3H5v18h14V8Zm0 0v5h5M8 13h8M8 17h5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  undo: '<g transform="translate(24 0) scale(-1 1)" stroke-width="2"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></g>',
  redo: '<g stroke-width="2"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></g>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
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
const state = { ...defaults, units: 'mm', showGrid: false, gridSpacing: 25.4, artwork: null, source: null, example: '', name: 'Bloom.svg', view: 'material', showTabs: true, showOriginal: false, zoom: 1, panX: 0, panY: 0, sourceWarnings: [], result: null, scaled: null, tabLayouts: {}, objectSettings: {}, tabSettingsScope: 'object', hiddenContours: [], cutawayContours: [], regions: [], editingRegions: false, selectedRegion: null, drawingRegion: false, regionDraft: [], regionWidth: 0.8, regionTaperLength: 5, regionRoundedTabs: 'inherit', regionRoundedChannelCorners: 'inherit', regionScope: 'outline-0', editingOutlines: false, selectedOutlines: [], showHiddenOutlines: true, editing: false, adding: false, selectedContour: null, selectedTab: null, selectedTabs: [], selectCurrentOutlineOnly: true };
const $ = s => document.querySelector(s);
const htmlText = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
// Older sessions used one preference for both axis and diagonal snapping.
const materialDefaults = (saved = {}) => ({ ...suggestionDefaults(), areaDecisions: {}, areaSuggestionBasis: null, materialVersion: 1, materialTreatments: {}, materialOrder: [], regionBridges: [], bridgeExclusions: [], bridgeWidth: 3, minimumMaterialWidth: 0.5, bridgeReinforcement: false, bridgeMatchFeatures: true, bridgeSnapLines: true, bridgeSnapAngles: true, bridgeSnapDiagonal: saved.bridgeSnapAngles ?? true });
Object.assign(state, { workflowStep: 1, activeTool: 'layers', showBridges: true, reviewingTypes: false, reviewRegion: null, layerQuery: '', layerFilter: 'all', controlsCollapsed: false, sourceChosen: false, areaDecisions: {} }, materialDefaults(), { editingBridges: false, selectedRegionBridge: null, selectedRegionBridges: [] });
const outlineThumbnails = new WeakMap();
const outlineBounds = new WeakMap();

document.querySelector('#app').innerHTML = workspaceView(icon, bridgePanel);
configureLengthControls(state);
// Keep document sizing above the workspace and editing tools over the canvas.
const inspectorHeader = document.createElement('div');
inspectorHeader.id = 'shape-header';
inspectorHeader.className = 'inspector-header';
inspectorHeader.hidden = true;
inspectorHeader.append($('.size-section'), $('#stencil-settings'));
$('.workspace').before(inspectorHeader);
$('.preview-panel').prepend($('.tab-edit-toolbar'));
$('.inspector-body').before($('#toggle-controls'));
$('#default-channel-settings').append($('#channel-settings'));

let noticeTimer;
function notify(message, kind = 'success') {
  const el = $('#notice');
  clearTimeout(noticeTimer); el.textContent = message; el.title = message; el.className = `notice ${kind}`; el.hidden = false;
  if (kind === 'success') noticeTimer = setTimeout(() => { el.hidden = true; }, 6000);
}

let geometryKey = null, geometryArtwork = null, detectAreas = false, completedWorkspace = null, detectionBefore = null;
let snapPreviewView = null;
const busy = createBusyTask({
  root: $('#app'), overlay: $('#preview-busy'), stage: $('#canvas-viewport'),
  onCancel() { snapPreviewView = null; rollbackGeneration(); notify('Calculation cancelled. Previous stencil restored.'); },
  onError(message) { snapPreviewView = null; rollbackGeneration(); notify(message, 'error'); },
});
function geometrySettings() {
  // Bridge generation preferences do not change the existing stencil geometry.
  // Generate Bridges reads those preferences directly from state.
  const keys = [...Object.keys(defaults), 'tabLayouts', 'objectSettings', 'hiddenContours', 'cutawayContours', 'regions',
    'materialTreatments', 'materialOrder', 'regionBridges', 'minimumMaterialWidth', 'areaOverrides'];
  return { ...Object.fromEntries(keys.map(key => [key, state[key]])), analyzeMaterial: state.editingBridges || state.workflowStep === 3 };
}
function geometryGestureActive() { return Boolean(drag || regionEditor.dragging || bridgeEditor.dragging); }
function rememberCompletedWorkspace() {
  if (busy.active || geometryGestureActive()) return;
  const { artwork, result, scaled, ...rest } = state;
  completedWorkspace = { state: { ...structuredClone(rest), artwork, result, scaled }, history: history.serialize(), pendingSettings: structuredClone(pendingSettings) };
  queueWorkspaceSave();
}
function rollbackGeneration() {
  cancelAnimationFrame(renderFrame); pendingSettings = null; positionGesture = null; detectAreas = false; detectionBefore = null;
  if (completedWorkspace) {
    Object.assign(state, structuredClone({ ...completedWorkspace.state, artwork: null, result: null, scaled: null }),
      { artwork: completedWorkspace.state.artwork, result: completedWorkspace.state.result, scaled: completedWorkspace.state.scaled });
    history.hydrate(completedWorkspace.history);
    pendingSettings = structuredClone(completedWorkspace.pendingSettings);
  } else {
    state.artwork = null; state.source = null; state.result = null; state.scaled = null;
    history.clear();
  }
  syncSourceInputs(); syncSettingInputs();
  $('#layer-search').value = state.layerQuery; $('#layer-filter').value = state.layerFilter;
  render();
}
function render() {
  if (!state.artwork || busy.active || livePreview.active) return;
  syncEditingFlags();
  const settings = geometrySettings(), key = JSON.stringify(settings);
  const geometryChanged = detectAreas || geometryArtwork !== state.artwork || geometryKey !== key;
  if (geometryChanged && geometryGestureActive()) {
    // Keep handles responsive during a drag; rebuild cut polygons on release.
    state.scaled = { ...state.scaled, regions: scaleRegions(state.regions, state.artworkWidth, state.scaled.padding) };
    if (state.editing) {
      const tabs = new Map(state.scaled.contours.map(contour => [contour.id, resolveTabs(contour, state, state.tabLayouts[contour.id])]));
      state.result = { ...state.result, bridges: state.result.bridges.map(bridge => {
        const tab = tabs.get(bridge.contourId)?.find(tab => tab.id === bridge.id);
        const contour = state.scaled.contours.find(contour => contour.id === bridge.contourId);
        return tab ? { ...bridge, ...tab, point: at(contour, tab.center) } : bridge;
      }) };
    }
  } else if (geometryChanged) {
    const artwork = state.artwork, detecting = detectAreas;
    busy.run('stencil', { artwork, settings, detectAreas: detecting },
      detecting ? 'Detecting object types…' : settings.analyzeMaterial ? 'Analyzing stencil material…' : 'Generating tabs and channels…',
      ({ scaled, stencil, suggestions, ...treatments }) => {
        state.scaled = scaled; state.result = stencil;
        if (suggestions) {
          Object.assign(state, treatments, { areaSuggestions: suggestions });
          state.areaSuggestionBasis = { artworkWidth: state.artworkWidth, channelWidth: state.channelWidth, minimumMaterialWidth: state.minimumMaterialWidth };
        }
        if (detectionBefore) { history.record(detectionBefore); detectionBefore = null; }
        detectAreas = false; geometryArtwork = artwork; geometryKey = JSON.stringify(geometrySettings());
        render();
      });
    return;
  }
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
  if (state.showGrid) svg.innerHTML += gridMarkup(width, height, state.gridSpacing);
  if (state.showOriginal) svg.innerHTML += `<g class="original-outlines" fill="none" stroke="#6f8bca" stroke-width="0.18" stroke-dasharray="1 0.7" pointer-events="none">${visible.map(c => `<path d="${pathData(c.points, c.closed)}"/>`).join('')}</g>`;
  if (state.editing) svg.innerHTML += `<g class="outline-hit-targets" fill="none" stroke="transparent" stroke-width="18" vector-effect="non-scaling-stroke">${tabContours.map(c => `<path data-outline="${c.id}" d="${pathData(c.points, c.closed)}" vector-effect="non-scaling-stroke"/>`).join('')}</g>`;
  if (state.editing && state.selectedContour && (state.view === 'material' || state.showTabs)) {
    const selected = contours.find(c => c.id === state.selectedContour);
    if (selected) svg.innerHTML += `<path d="${pathData(selected.points, selected.closed)}" fill="none" stroke="#258477" stroke-width="1" stroke-dasharray="3 4" vector-effect="non-scaling-stroke" pointer-events="none" opacity="0.6"/>`;
  }
  if ((state.view === 'material' || state.showTabs) && !state.editingOutlines) svg.innerHTML += renderTabMarkers();
  if (state.editingOutlines) svg.innerHTML += renderOutlineTargets();
  if (state.editingRegions) svg.innerHTML += regionEditor.overlay();
  if (state.view === 'material' || state.editingBridges || state.showBridges || state.workflowStep === 3) svg.innerHTML += bridgeEditor.overlay();
  svg.classList.toggle('editing-tabs', state.editing);
  svg.classList.toggle('editing-outlines', state.editingOutlines);
  svg.classList.toggle('adding-tab', state.adding);
  const support = $('#material-status');
  support.hidden = true;
  $('#offset-value').textContent = `${state.tabOffset}%`;
  updateWorkspaceUI(state);
  const snappedView = snapPreviewView;
  snapPreviewView = null;
  if (snappedView) {
    const { panX, panY, zoom } = snappedView;
    Object.assign(state, { panX, panY, zoom });
  }
  fitSheet();
  if (snappedView) {
    const { bridgeId, scrollLeft, scrollTop } = snappedView;
    const viewport = $('#canvas-viewport');
    viewport.scrollLeft = scrollLeft; viewport.scrollTop = scrollTop;
    const polygon = state.result.regionBridges.find(bridge => bridge.id === bridgeId)?.polygon;
    if (polygon?.length) {
      const bounds = viewport.getBoundingClientRect();
      const low = svgPoint({ clientX: bounds.left, clientY: bounds.top });
      const high = svgPoint({ clientX: bounds.right, clientY: bounds.bottom });
      const xs = polygon.map(p => p.x), ys = polygon.map(p => p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      if (maxX < low.x || minX > high.x || maxY < low.y || minY > high.y) {
        fitSheet({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 });
      }
    }
  }
  updateHistoryButtons();
  if (state.adding && tabPlacementPointer) showGhost(tabPlacementPointer);
  if (!geometryChanged) queueMicrotask(rememberCompletedWorkspace);
}

function refreshAreaSuggestions() {
  detectAreas = true;
  state.areaSuggestionBasis = null;
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
  return source?.source?.id || source?.source?.groups?.at(-1)?.id || `Object ${[...new Set(state.artwork.contours.map(c => c.regionId))].indexOf(id) + 1}`;
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
  $('#review-areas').textContent = state.areaSuggestions ? 'Review Object Types' : 'Detect Object Types';
  $('#type-review').hidden = !state.reviewingTypes;
  if (!state.reviewingTypes) return;
  if (!state.reviewRegion && pending.length) { state.reviewRegion = pending[0]; focusReviewRegion(); }
  if (state.reviewRegion && !all.includes(state.reviewRegion)) state.reviewRegion = pending[0] ?? null;
  const id = state.reviewRegion, suggestion = state.areaSuggestions?.byRegion[id];
  const members = state.artwork.contours.filter(c => c.regionId === id);
  const hasLayer = Boolean(suggestion && members.length);
  $('#review-layer-name').textContent = hasLayer ? layerName(id) : 'Object Types Reviewed';
  $('#review-thumbnail').innerHTML = hasLayer ? members.map(outlineThumbnail).join('') : '';
  $('#review-current').textContent = hasLayer ? members.every(c => state.hiddenContours.includes(c.id)) ? `Hidden (${treatmentLabel(materialMode(members[0], state))})` : treatmentLabel(materialMode(members[0], state)) : 'All Choices Saved';
  $('#review-suggested').textContent = hasLayer ? treatmentLabel(suggestion.mode) : 'No Remaining Choices';
  $('#area-review-hint').textContent = hasLayer ? suggestion.reason : 'You can still change any object type or continue to review the stencil.';
  const progress = `${pending.length} Remaining`;
  if ($('#review-progress').textContent !== progress) $('#review-progress').textContent = progress;
  for (const selector of ['#accept-area-suggestion', '#keep-area-type', '#review-treatment']) $(selector).disabled = !hasLayer;
  $('#accept-area-suggestion').textContent = suggestion?.mode === 'hidden' ? 'Hide Object' : 'Use Suggested Type';
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
    return `<g data-visibility-outline="${c.id}" class="visibility-outline ${hidden ? 'is-hidden' : ''} ${selected ? 'selected' : ''}" tabindex="0" role="button" aria-label="Object ${outlineNumber(c.id)}, ${hidden ? 'hidden' : 'visible'}" aria-pressed="${selected}">
      <path class="outline-guide" d="${pathData(c.points, c.closed)}" fill="none" vector-effect="non-scaling-stroke" pointer-events="none"/>
      <path d="${pathData(c.points, c.closed)}" fill="${c.closed ? 'transparent' : 'none'}" stroke="transparent" stroke-width="18" vector-effect="non-scaling-stroke" pointer-events="${c.closed ? 'all' : 'stroke'}"/>
    </g>`;
  }).join('')}</g>`;
}
function selectOutline(id, additive = false, reveal = false) {
  if (!id) { if (!additive) state.selectedOutlines = []; }
  else if (additive) state.selectedOutlines = state.selectedOutlines.includes(id) ? state.selectedOutlines.filter(value => value !== id) : [...state.selectedOutlines, id];
  else state.selectedOutlines = materialMode(state.artwork.contours.find(c => c.id === id), state) === 'outline' ? [id] : state.artwork.contours.filter(c => c.regionId === state.artwork.contours.find(c => c.id === id).regionId).map(c => c.id);
  updateOutlineSelection();
  queueWorkspaceSave();
  if (id && reveal) {
    const regionId = state.artwork.contours.find(c => c.id === id)?.regionId;
    const card = [...$('#outline-list').children].find(element => element.dataset.orderId === regionId);
    if (card) {
      const sidebar = $('.inspector-body');
      const bounds = sidebar.getBoundingClientRect(), layer = card.getBoundingClientRect();
      if (layer.top < bounds.top || layer.height > bounds.height) sidebar.scrollTop += layer.top - bounds.top;
      else if (layer.bottom > bounds.bottom) sidebar.scrollTop += layer.bottom - bounds.bottom;
    }
  }
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
  const contours = Array.isArray(contour) ? contour : [contour];
  let x = Infinity, y = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const member of contours) for (const point of member.points) {
    x = Math.min(x, point.x); y = Math.min(y, point.y);
    maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y);
  }
  const width = maxX - x, height = maxY - y;
  const padding = Math.max(width, height, 1) * 0.1;
  // Keep the full contour: sampling by vertex index can skip whole corners
  // when curved sections have many more vertices than straight sections.
  const thumbnail = `<svg viewBox="${x - padding} ${y - padding} ${width + padding * 2} ${height + padding * 2}" aria-hidden="true">${contours.map(member => `<path d="${pathData(member.points, member.closed)}" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`).join('')}</svg>`;
  outlineThumbnails.set(contour, thumbnail);
  return thumbnail;
}
function updateOutlineSelectionControls() {
  const selected = new Set(state.selectedOutlines);
  $('#hide-outlines').disabled = !state.selectedOutlines.some(id => !state.hiddenContours.includes(id));
  $('#show-outlines').disabled = !state.selectedOutlines.some(id => state.hiddenContours.includes(id));
  $('#keep-only-outlines').disabled = selected.size === 0;
  $('#show-all-outlines').disabled = state.hiddenContours.length === 0;
  $('#layer-selection-actions').hidden = !selected.size;
  const selectedRegions = new Set(state.artwork.contours.filter(c => selected.has(c.id)).map(c => c.regionId));
  $('#layer-selection-controls').hidden = selectedRegions.size < 2;
  const selectedMembers = state.artwork.contours.filter(c => selectedRegions.has(c.regionId));
  const selectedModes = new Set(selectedMembers.map(c => materialMode(c, state)));
  $('#selected-layer-count').textContent = `${selectedRegions.size} ${selectedRegions.size === 1 ? 'Object' : 'Objects'} Selected`;
  $('#selected-layer-treatment').value = selectedModes.size === 1 ? [...selectedModes][0] : '';
  for (const option of $('#selected-layer-treatment').options) if (option.value) option.disabled = option.value !== 'outline' && selectedMembers.some(c => !c.closed);
}
function updateOutlineSelectionHighlights() {
  const selected = new Set(state.selectedOutlines);
  const regions = new Set(state.artwork.contours.filter(c => selected.has(c.id)).map(c => c.regionId));
  const highlight = (element, active) => {
    if (element.classList.contains('selected') !== active) element.classList.toggle('selected', active);
  };
  const pressed = (element, active) => {
    if (element.getAttribute('aria-pressed') !== String(active)) element.setAttribute('aria-pressed', active);
  };
  for (const target of document.querySelectorAll('[data-visibility-outline]')) {
    const active = selected.has(target.dataset.visibilityOutline);
    highlight(target, active); pressed(target, active);
  }
  for (const card of $('#outline-list').querySelectorAll('.layer-card')) {
    const active = regions.has(card.dataset.orderId);
    highlight(card, active);
    pressed(card.querySelector('.outline-select'), active);
    for (const button of card.querySelectorAll('.compound-children [data-select-outline]')) pressed(button, selected.has(button.dataset.selectOutline));
  }
}
function updateOutlineSelection() {
  if (state.layerFilter === 'selected') updateOutlineEditor();
  else { updateOutlineSelectionControls(); updateOutlineSelectionHighlights(); }
}
function updateOutlineEditor() {
  $('#edit-outlines').setAttribute('aria-pressed', state.editingOutlines);
  $('#outline-inspector').hidden = !state.editingOutlines;
  const groups = [...new Set([...state.materialOrder, ...state.artwork.contours.map(c => c.regionId)])].filter(id => state.artwork.contours.some(c => c.regionId === id)).reverse();
  const shown = groups.filter(id => state.artwork.contours.some(c => c.regionId === id && !state.hiddenContours.includes(c.id)));
  $('#outline-count').textContent = `${shown.length} of ${groups.length} Visible`;
  $('#show-hidden-outlines').checked = state.showHiddenOutlines;
  updateTypeReview();
  updateOutlineSelectionControls();
  const selected = state.selectedOutlines;
  const filtered = Boolean(state.layerQuery || state.layerFilter !== 'all');
  $('#layer-reorder-hint').hidden = !filtered;
  const list = $('#outline-list');
  const key = JSON.stringify([state.hiddenContours, state.cutawayContours, state.materialTreatments, state.materialOrder, state.areaSuggestions, state.areaOverrides, state.areaDecisions, state.layerFilter === 'selected' ? selected : null, state.layerQuery, state.layerFilter]);
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
        <div class="layer-main">${controls}<button ${compound ? '' : `id="select-${c.id}"`} class="outline-select" data-select-outline="${c.id}" aria-label="Select ${label}" aria-pressed="${active}">${outlineThumbnail(compound ? members : c)}<span>${label}<small class="${pending ? 'needs-review' : ''}">${status}</small></span></button><label class="visibility-toggle" title="${hidden ? 'Show' : 'Hide'} ${label}"><input ${compound ? '' : `id="visible-${c.id}"`} type="checkbox" data-visible-layer="${regionId}" ${compound ? '' : `data-visible-outline="${c.id}"`} aria-label="${hidden ? 'Show' : 'Hide'} ${label}" ${hidden ? '' : 'checked'} /><span aria-hidden="true">${icon('eye')}</span></label></div>
        <label class="layer-treatment" for="treatment-${c.id}"><span>Object Type</span><select id="treatment-${c.id}" data-treatment-outline="${c.id}" aria-label="${label} Type">${[['outline', 'Outline'], ['keep', 'Keep'], ['cut', 'Cut Away']].map(([value, text]) => `<option value="${value}" ${mode === value ? 'selected' : ''} ${value !== 'outline' && members.some(m => !m.closed) ? 'disabled' : ''}>${text}</option>`).join('')}</select></label>
        ${children}<details class="layer-explanation"><summary>Type Details</summary><div class="area-suggestion"><strong>${status}</strong>${suggestion ? `<span>Suggested Type: ${treatmentLabel(suggestion.mode)}</span><span>${htmlText(suggestion.reason)}</span><span>Confidence: ${suggestion.confidence}</span>` : '<span>Choose an object type to control its treatment.</span>'}</div></details>
      </section>`;
    }).join('') || '<p class="empty-state">No objects match this filter.</p>';
    list.artwork = state.artwork; list.visibilityKey = key; list.scrollTop = scroll;
    if (focus) document.getElementById(focus)?.focus({ preventScroll: true });
  }
  updateOutlineSelectionHighlights();
}

function zoomSelectionCenter() {
  if (!state.scaled) return null;
  let points = [];
  if (state.activeTool === 'tabs') {
    points = selectedBridges().map(tab => tab.point);
  } else if (state.activeTool === 'bridges') {
    points = (state.result?.regionBridges ?? []).filter(bridge => state.selectedRegionBridges.includes(bridge.id)).flatMap(bridge => bridge.polygon);
  } else if (state.activeTool === 'regions') {
    points = state.scaled.regions?.find(region => region.id === state.selectedRegion)?.points ?? [];
  } else {
    points = state.scaled.contours.filter(contour => state.selectedOutlines.includes(contour.id)).flatMap(contour => contour.points);
  }
  if (!points.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

function zoomPreview(delta) {
  state.zoom = Math.max(0.25, Math.min(3, state.zoom + delta));
  fitSheet(zoomSelectionCenter());
}

function fitSheet(center = null) {
  if (!state.scaled) return;
  // Intermediate renders during snapping must not resize or animate the
  // sheet. Restore the camera once the final stencil is ready instead.
  if (snapPreviewView) return;
  const area = $('#canvas-viewport');
  const ratio = state.scaled.width / state.scaled.height;
  // Canvas dimensions are independent of editing controls; fit to the space
  // inside the canvas while leaving room for the dimension labels.
  const height = Math.max(1, Math.min(area.clientHeight - 80, (area.clientWidth - 96) / ratio));
  const wrap = $('#sheet-wrap');
  wrap.style.width = `${height * ratio}px`;
  wrap.style.height = `${height}px`;
  if (center) {
    const pixelsPerUnit = height / state.scaled.height;
    state.panX = (state.scaled.width / 2 - center.x) * pixelsPerUnit * state.zoom;
    state.panY = (state.scaled.height / 2 - center.y) * pixelsPerUnit * state.zoom;
  }
  // Let any point on the sheet reach the viewport center, including edge selections.
  const maxX = height * ratio * state.zoom / 2;
  const maxY = height * state.zoom / 2;
  state.panX = Math.max(-maxX, Math.min(maxX, state.panX));
  state.panY = Math.max(-maxY, Math.min(maxY, state.panY));
  wrap.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  previewDimensions.refresh();
  resizePreviewHandles();
  $('#zoom-label').textContent = `${Math.round(state.zoom * 100)}%`;
  previewPan.refresh();
  queueWorkspaceSave();
}

function selectedContour() { return state.scaled?.contours.find(c => c.id === state.selectedContour); }
function matchesTab(bridge, ref) { return bridge.contourId === ref.contourId && bridge.id === ref.id; }
function selectTab(contourId, id) {
  if (id) { state.showTabs = true; if (!state.adding) state.tabSettingsScope = 'tab'; }
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
  if (tabs.length) state.showTabs = true;
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
  if (wasAutomatic) notify('This object now uses custom tab placement. Object width still applies unless a tab has its own width.');
  return tabs;
}
function screenUnit() {
  // Use the target scale so the CSS zoom transition cannot affect handle sizing.
  return state.scaled.width / (($('#sheet-wrap').clientWidth || 350) * state.zoom);
}
function resizePreviewHandles() {
  const unit = screenUnit();
  $('#preview-svg').querySelector('.material-bridge-overlays')?.style.setProperty('--bridge-handle-unit', `${unit}px`);
  $('#preview-svg').querySelector('.tab-markers')?.style.setProperty('--tab-handle-unit', `${unit}px`);
  for (const handle of $('#preview-svg').querySelectorAll('[data-screen-radius]')) {
    const radius = Math.min(Number(handle.dataset.screenRadius) * unit, Number(handle.dataset.maxRadius ?? Infinity));
    if (handle.tagName === 'rect') {
      const x = Number(handle.getAttribute('x')) + Number(handle.getAttribute('width')) / 2;
      const y = Number(handle.getAttribute('y')) + Number(handle.getAttribute('height')) / 2;
      handle.setAttribute('x', x - radius); handle.setAttribute('y', y - radius);
      handle.setAttribute('width', radius * 2); handle.setAttribute('height', radius * 2);
    } else handle.setAttribute('r', radius);
  }
}
function renderTabMarkers(bridges = state.result.bridges) {
  const radius = screenUnit() * 3.5;
  return `<g class="tab-markers" style="--tab-handle-unit:${screenUnit()}px">${bridges.map(b => {
    const selected = state.editing && state.selectedTabs.some(ref => matchesTab(b, ref));
    const color = b.custom ? '#258477' : '#c3963e';
    const label = `${b.custom ? 'Custom' : 'Automatic'} tab, object ${state.scaled.contours.findIndex(c => c.id === b.contourId) + 1}, ${formatLength(b.width, state)}${b.widthOverride == null ? ', inherited width' : ', width override'}`;
    return `<g data-tab="${b.id}" data-outline="${b.contourId}" class="tab-marker ${selected ? 'selected' : ''}" style="--tab-color:${color}" ${state.editing ? `tabindex="0" role="button" aria-label="${label}" aria-pressed="${selected}"` : ''}>
      <title>${label}</title>
      <path d="${b.segments.map(p => pathData(p, false)).join('')}" fill="none" stroke="${color}" stroke-width="${b.channelWidth + 0.65}" opacity="0.65"/>
      ${b.custom ? `<circle cx="${b.point.x}" cy="${b.point.y}" r="${radius}" data-screen-radius="3.5"` : `<rect x="${b.point.x - radius}" y="${b.point.y - radius}" width="${radius * 2}" height="${radius * 2}" data-screen-radius="3.5"`} class="tab-center" fill="${color}"/>
      ${selected ? `<circle class="tab-selection-ring" cx="${b.point.x}" cy="${b.point.y}" r="${radius + screenUnit() * 4}" data-screen-radius="7.5" fill="none"/>` : ''}
      ${state.editing ? `<circle cx="${b.point.x}" cy="${b.point.y}" r="${screenUnit() * 12}" data-screen-radius="12" fill="transparent"/>` : ''}
    </g>`;
  }).join('')}</g>`;
}
function updateTabScope() {
  const scope = state.tabSettingsScope;
  document.querySelectorAll('[data-tab-scope]').forEach(button => {
    const active = button.dataset.tabScope === scope;
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
    document.getElementById(button.getAttribute('aria-controls')).hidden = !active;
  });
  $('#tab-object-context').hidden = scope === 'defaults';
}
const objectSettingKeys = ['tabWidth', 'tabCount', 'tabOffset', 'channelWidth', 'roundedTabs', 'roundedChannelCorners'];
function updateObjectSettings(contour, custom) {
  const own = state.objectSettings[contour.id] ?? {};
  const effective = objectSettings(state, contour.id);
  for (const key of objectSettingKeys) {
    const input = $(`#object-${key}`), status = $(`#object-${key}-status`);
    const inherited = own[key] == null;
    if (input.tagName === 'SELECT') {
      input.value = inherited ? 'inherit' : String(own[key]);
      status.textContent = `Global default: ${state[key] ? 'Rounded' : 'Sharp'}.`;
    } else {
      const length = key === 'tabWidth' || key === 'channelWidth';
      for (const field of [input, $(`#object-${key}-range`)]) {
        if (length) setLengthValue(field, effective[key], state);
        else field.value = effective[key];
        field.disabled = custom && ['tabCount', 'tabOffset'].includes(key) || key === 'tabOffset' && !contour.closed;
      }
      status.textContent = inherited ? 'Uses global default' : 'Object override';
      $(`[data-inherit-object="${key}"]`).disabled = inherited;
    }
  }
  $('#inherit-object-settings').disabled = Object.keys(own).length === 0;
  $('#object-placement-hint').textContent = custom
    ? 'Count and offset are paused for hand-placed tabs. Use Automatic Placement to enable them again.'
    : contour.closed ? 'Count and offset place tabs automatically on this object only.' : 'Tabs are evenly spaced along this open outline. Placement offset applies to closed outlines.';
  updateRangePaint();
}
function updateTabEditor() {
  const contours = channelContours();
  $('#automatic-scope').textContent = `Count and offset control automatic placement. Hand-placed tabs keep their count and positions. Offset moves tabs around closed outlines; open outlines stay evenly spaced.`;
  // Defaults remain editable even when all existing objects use custom placement.
  for (const id of ['tabCount', 'tabOffset', 'tabs-minus', 'tabs-plus']) $(`#${id}`).disabled = false;
  $('#reset-all-tabs').disabled = Object.keys(state.tabLayouts).length === 0;
  updateTabScope();
  $('#edit-tabs').setAttribute('aria-pressed', state.editing);
  $('#edit-tabs').setAttribute('aria-expanded', state.editing);
  $('#edit-tabs').disabled = !toolAvailable('tabs');
  $('#edit-tabs').title = $('#edit-tabs').disabled ? 'Tabs require a visible Outline object.' : '';
  $('#tabs-unavailable').hidden = contours.length > 0;
  $('#tabs-available').hidden = contours.length === 0;
  $('#add-tab').hidden = !state.editing;
  $('#add-tab').setAttribute('aria-pressed', state.adding);
  $('#add-tab').textContent = state.adding ? 'Cancel Placement' : 'Add Tabs';
  $('#edit-hint').hidden = !state.editing;
  $('#edit-hint').textContent = state.adding ? 'Click this object’s outline to add tabs. Choose Cancel Placement or press Escape to finish.' : 'Click Add Tabs, then click this object’s outline. Select a tab on the canvas to edit it.';
  $('#tab-inspector').hidden = !state.editing;
  $('#show-tabs').disabled = state.view === 'material';
  $('#show-tabs').checked = state.view === 'material' || state.showTabs;
  $('#outline-picker').innerHTML = contours.map(c => `<option value="${c.id}">${htmlText(layerName(c.regionId))}${state.artwork.contours.filter(member => member.regionId === c.regionId).length > 1 ? `, Contour ${state.artwork.contours.filter(member => member.regionId === c.regionId).indexOf(c) + 1}` : ''} (${Object.hasOwn(state.tabLayouts, c.id) ? 'Custom' : 'Automatic'})</option>`).join('');
  const contour = selectedContour();
  if (!contour) return;
  const isCustom = Object.hasOwn(state.tabLayouts, contour.id);
  const number = outlineNumber(contour.id);
  updateObjectSettings(contour, isCustom);
  $('#outline-mode').textContent = isCustom ? 'Custom' : 'Automatic';
  $('#outline-mode').classList.toggle('custom', isCustom);
  $('#outline-mode-hint').textContent = isCustom ? 'Hand-placed tabs keep their positions. Tab widths inherit this object’s width unless individually changed.' : 'Editing or dragging a tab preserves this object’s placement as custom.';
  $('#outline-picker').value = contour.id;
  const tabs = state.result.bridges.filter(b => b.contourId === contour.id);
  $('#tab-picker').innerHTML = '<option value="">Select a tab…</option>' + tabs.map((b, i) => `<option value="${b.id}">Tab ${i + 1} (${formatLength(b.width, state)}, ${b.widthOverride == null ? 'Inherited' : 'Override'})</option>`).join('');
  $('#tab-picker').value = state.selectedTab ?? '';
  const bridge = selectedBridge();
  const selection = selectedBridges();
  const multiple = selection.length > 1;
  const selectedObjectCount = new Set(selection.map(tab => tab.contourId)).size;
  if (selectedObjectCount > 1) $('#outline-picker').dataset.displayLabel = 'Multiple';
  else delete $('#outline-picker').dataset.displayLabel;
  $('#tab-scope-title').textContent = multiple ? 'Selected Tabs' : 'Current Tab';
  $('#tab-scope-badge').textContent = multiple ? `${selection.length} tabs` : 'This tab';
  $('#tab-selection-scope').textContent = multiple ? `Changes apply to all ${selection.length} selected tabs ${selectedObjectCount > 1 ? `on ${selectedObjectCount} objects` : 'on this object'}.` : 'Changes here affect only the selected tab.';
  $('#remove-tab').textContent = multiple ? 'Remove Selected Tabs' : 'Remove Tab';
  $('label[for="selected-tab-position"]').textContent = multiple ? 'Position (Move Group)' : 'Position';
  $('#selected-tab-controls').hidden = !bridge;
  $('#selected-tab-actions').hidden = !bridge;
  $('#tab-empty-state').hidden = !!bridge;
  $('#remove-tab').disabled = !bridge;
  $('#inherit-tab-width').disabled = !bridge || bridge.widthOverride == null;
  $('#tab-inspector').classList.toggle('has-selection', !!bridge);
  $('#selected-outline-label').textContent = multiple ? `${selection.length} Tabs Selected` : bridge ? `Object ${number}, Tab ${tabs.indexOf(bridge) + 1}` : `Object ${number}`;
  if (bridge) {
    setLengthValue($('#selected-tab-width'), selection.some(tab => tab.requestedWidth !== bridge.requestedWidth) ? '' : bridge.requestedWidth, state);
    $('#selected-tab-width').placeholder = 'Mixed';
    setLengthValue($('#selected-tab-width-range'), bridge.requestedWidth, state);
    $('#selected-tab-position').value = Number((bridge.position * 100).toFixed(2));
    $('#selected-tab-position-range').value = $('#selected-tab-position').value;
    updateRangePaint();
    $('#tab-width-status').textContent = `${bridge.widthOverride == null ? `Inherits ${formatLength(objectSettings(state, contour.id).tabWidth, state)} from ${state.objectSettings[contour.id]?.tabWidth == null ? 'global defaults through this object' : 'this object'}.` : 'Individual tab width. Object and global widths do not affect this tab.'}${bridge.width < bridge.requestedWidth - 1e-7 ? ` Effective width: ${formatLength(bridge.width, state)} to fit this object.` : ''}`;
    if (multiple) $('#tab-width-status').textContent = selection.every(b => b.requestedWidth === bridge.requestedWidth) ? 'Width applies to all selected tabs. Use Object Width restores each tab’s own inherited width.' : 'Mixed widths. Set a width to apply it to all selected tabs.';
    $('#inherit-tab-width').disabled = selection.every(b => b.widthOverride == null);
  }
  $('#reset-outline').textContent = 'Use Automatic Placement';
  $('#reset-outline').disabled = !isCustom;
}
function addTab(contourId, position) {
  state.selectedContour = contourId;
  mutate(() => {
    const tabs = customizeSelected();
    const id = `tab-${crypto.randomUUID()}`;
    state.showTabs = true; tabs.push({ id, position, widthOverride: null }); selectTab(contourId, id);
  });
}
function removeSelectedTab() {
  const selection = selectedBridges();
  if (!selection.length) return;
  mutate(() => {
    state.showTabs = true;
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
    state.showTabs = true;
    if (property === 'position') applyPositionDelta(gesture.tabs, value - gesture.anchor);
    else for (const ref of selectedBridges()) {
      const contour = state.scaled.contours.find(c => c.id === ref.contourId);
      customizeContour(state.tabLayouts, contour, state).find(t => t.id === ref.id)[property] = value;
    }
  };
  if (live) {
    apply();
    if (property === 'widthOverride') setLengthValue($('#selected-tab-width'), value, state);
    else $('#selected-tab-position').value = Number((value * 100).toFixed(2));
    updateRangePaint();
    livePreview.schedule();
  }
  else { mutate(apply); positionGesture = null; }
}
const regionEditor = createRegionEditor({ state, render, preview: () => livePreview.schedule(), mutate, snapshot, restore, record: before => history.record(before), beginEdit: () => { if (!pendingSettings) pendingSettings = snapshot(); }, commit: commitSettings, save: queueWorkspaceSave, notify, svgPoint, screenUnit });
const bridgeEditor = createBridgeEditor({ state, render, mutate, snapshot, restore, record: before => history.record(before), commit: commitSettings, save: queueWorkspaceSave, notify, svgPoint, screenUnit,
  preview: overrides => livePreview.schedule(overrides),
  runTask(task, payload, label, complete) {
    const viewport = $('#canvas-viewport');
    const view = task === 'snap' ? {
      panX: state.panX, panY: state.panY, zoom: state.zoom,
      scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop, bridgeId: payload.bridge.id,
    } : null;
    snapPreviewView = view;
    busy.run(task, payload, label, result => {
      // Keep this through the follow-up stencil calculation; its final render
      // restores the camera and only reveals a completely off-screen bridge.
      complete(result);
      if (!busy.active) snapPreviewView = null;
    });
  },
});
const livePreview = createLivePreview({ svg: $('#preview-svg'), state, screenUnit, markers: renderTabMarkers, regionMarkers: regions => regionEditor.overlay(regions) });
let rangePointer = null;
document.addEventListener('pointerdown', event => {
  if (event.target.matches('input[type="range"]')) rangePointer = { id: event.pointerId, input: event.target };
}, true);
function finishRangePointer(event) {
  if (!rangePointer || event && rangePointer.id !== event.pointerId) return;
  const { input } = rangePointer; rangePointer = null;
  // Returning to the starting value emits no native change event. Still end
  // its visual preview, after any normal change handler has committed it.
  requestAnimationFrame(() => {
    if (livePreview.active) input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
for (const type of ['pointerup', 'pointercancel']) document.addEventListener(type, finishRangePointer, true);
window.addEventListener('blur', () => finishRangePointer());
const simplifyEditor = createSimplifyEditor({
  state, commit: commitWorkspaceEdits, download: downloadFile,
  apply(source) {
    const artwork = importSvg(source);
    mutate(() => {
      state.artwork = artwork; state.source = source; state.sourceWarnings = artwork.warnings;
      state.activeTool = 'layers';
      state.name = state.name.replace(/(?:-simplified)?\.svg$/i, '') + '-simplified.svg'; state.example = '';
      state.tabLayouts = {}; state.objectSettings = {}; state.hiddenContours = []; state.cutawayContours = []; state.regions = [];
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
function toolAvailable(tool) {
  const visible = state.artwork?.contours.filter(c => !state.hiddenContours.includes(c.id)) ?? [];
  if (tool === 'tabs' || tool === 'regions') return visible.some(c => materialMode(c, state) === 'outline');
  if (tool === 'bridges') return state.regionBridges.length > 0 || visible.some(c => {
    const mode = materialMode(c, state);
    return mode === 'outline' || mode === 'cut' && c.closed;
  });
  return true;
}
function syncEditingFlags() {
  if (!toolAvailable(state.activeTool)) { state.activeTool = 'layers'; state.adding = false; }
  $('#edit-regions').disabled = !toolAvailable('regions');
  $('#edit-regions').title = $('#edit-regions').disabled ? 'Override Regions require a visible Outline object.' : '';
  $('#edit-bridges').disabled = !toolAvailable('bridges');
  $('#edit-bridges').title = $('#edit-bridges').disabled ? 'Bridges require a visible Outline or Cut Away object.' : '';
  for (const [tool, flag] of Object.entries(toolModes)) state[flag] = state.workflowStep === 2 && state.activeTool === tool;
}
function closeActionPanels() {
  document.querySelectorAll('.action-popover:popover-open').forEach(panel => panel.hidePopover());
}
function navigateStep(step) {
  if (![1, 2, 3].includes(step)) return;
  closeActionPanels();
  layerOrdering.cancel(); regionOrdering.cancel();
  commitWorkspaceEdits(); clearGhost();
  bridgeEditor.cancel(); state.adding = false;
  previewPan.reset();
  state.workflowStep = step; state.controlsCollapsed = false;
  syncEditingFlags(); render(); resetInspectorScroll(); queueWorkspaceSave();
}
function activateTool(tool) {
  if (!(tool in toolModes) || !toolAvailable(tool)) return;
  if (state.workflowStep === 2 && state.activeTool === tool) return;
  closeActionPanels();
  layerOrdering.cancel(); regionOrdering.cancel();
  commitWorkspaceEdits(); clearGhost(); bridgeEditor.cancel();
  state.workflowStep = 2; state.activeTool = tool; state.controlsCollapsed = false; state.adding = false;
  if (tool === 'regions' && !state.selectedRegion && !state.drawingRegion) state.regionScope = state.selectedOutlines[0] ?? state.selectedContour ?? 'all';
  previewPan.reset();
  syncEditingFlags(); render(); resetInspectorScroll(); queueWorkspaceSave();
}
function resetInspectorScroll() {
  $('.inspector-body').scrollTop = 0;
}
function announce(message) { $('#announcements').textContent = message; }
for (const [tool, id] of Object.entries({ layers: 'edit-outlines', tabs: 'edit-tabs', bridges: 'edit-bridges', regions: 'edit-regions' })) $(`#${id}`).addEventListener('click', () => activateTool(tool));
document.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => navigateStep(Number(button.dataset.step))));
$('#step-next').addEventListener('click', () => navigateStep(state.workflowStep + 1));
$('#step-back').addEventListener('click', () => navigateStep(state.workflowStep - 1));
$('#toggle-controls').addEventListener('click', () => { state.controlsCollapsed = !state.controlsCollapsed; updateWorkspaceUI(state); queueWorkspaceSave(); });
document.addEventListener('click', event => {
  const trigger = event.target.closest('[popovertarget]');
  const panel = trigger && document.getElementById(trigger.getAttribute('popovertarget'));
  if (panel?.classList.contains('action-popover')) requestAnimationFrame(() => {
    const anchor = trigger.getBoundingClientRect();
    panel.style.left = `${Math.max(16, Math.min(anchor.left, innerWidth - panel.offsetWidth - 16))}px`;
    panel.style.top = `${Math.max(16, Math.min(anchor.bottom + 8, innerHeight - panel.offsetHeight - 16))}px`;
  });
  const tool = event.target.closest('[data-open-tool]');
  if (tool?.id === 'region-channel-summary') {
    state.tabSettingsScope = 'defaults';
    $('#default-channel-settings').open = true;
  }
  if (tool) activateTool(tool.dataset.openTool);
  if (event.target.closest('[data-review-types]')) reviewUncertainArea();
});
function positionOverlayMenu() {
  const panel = $('#preview-options');
  if (!panel.matches(':popover-open')) return;
  const anchor = $('#overlay-toggle').getBoundingClientRect();
  panel.style.left = 'auto';
  panel.style.right = `${Math.max(16, innerWidth - anchor.right)}px`;
  panel.style.top = `${anchor.bottom + 6}px`;
  panel.style.bottom = 'auto';
  panel.style.maxHeight = `${Math.max(0, innerHeight - anchor.bottom - 22)}px`;
  panel.style.overflowY = 'auto';
}
$('#preview-options').addEventListener('toggle', positionOverlayMenu);
window.addEventListener('resize', positionOverlayMenu);
window.addEventListener('scroll', positionOverlayMenu, true);
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
const tabScopeButtons = [...document.querySelectorAll('[data-tab-scope]')];
function changeTabScope(scope) {
  commitSettings();
  if (scope !== 'object' && state.adding) { state.adding = false; clearGhost(); render(); }
  state.tabSettingsScope = scope;
  updateTabScope();
  queueWorkspaceSave();
}
tabScopeButtons.forEach((button, index) => {
  button.addEventListener('click', () => changeTabScope(button.dataset.tabScope));
  button.addEventListener('keydown', event => {
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3 : null;
    if (target == null) return;
    event.preventDefault();
    changeTabScope(tabScopeButtons[target].dataset.tabScope);
    tabScopeButtons[target].focus();
  });
});
function setObjectSetting(key, raw, live = false) {
  const contour = selectedContour();
  if (!contour) return;
  const input = $(`#object-${key}`);
  let value;
  if (input.tagName === 'SELECT') value = raw === 'inherit' ? undefined : raw === 'true';
  else {
    if (raw === '' || !Number.isFinite(Number(raw))) return updateObjectSettings(contour, Object.hasOwn(state.tabLayouts, contour.id));
    value = Math.max(Number(input.min), Math.min(Number(input.max), Number(raw)));
    if (key === 'tabWidth' || key === 'channelWidth') value = toMillimeters(value, state);
    if (key === 'tabCount') value = Math.round(value);
  }
  if (!pendingSettings) pendingSettings = snapshot();
  const settings = state.objectSettings[contour.id] ??= {};
  if (value === undefined) delete settings[key];
  else settings[key] = value;
  if (!Object.keys(settings).length) delete state.objectSettings[contour.id];
  state.showTabs = true;
  updateObjectSettings(contour, Object.hasOwn(state.tabLayouts, contour.id));
  if (live) livePreview.schedule();
  else commitSettings();
}
for (const key of objectSettingKeys) {
  $(`#object-${key}`).addEventListener('change', event => setObjectSetting(key, event.target.value));
  const slider = $(`#object-${key}-range`);
  slider?.addEventListener('input', event => setObjectSetting(key, event.target.value, true));
  slider?.addEventListener('change', commitSettings);
  slider?.addEventListener('blur', commitSettings);
}
document.querySelectorAll('[data-inherit-object]').forEach(button => button.addEventListener('click', () => mutate(() => {
  const settings = state.objectSettings[state.selectedContour];
  if (!settings) return;
  delete settings[button.dataset.inheritObject];
  if (!Object.keys(settings).length) delete state.objectSettings[state.selectedContour];
})));
$('#inherit-object-settings').addEventListener('click', () => mutate(() => { delete state.objectSettings[state.selectedContour]; }));
$('#add-tab').addEventListener('click', () => { state.adding = !state.adding; if (state.adding) state.showTabs = true; render(); });
document.querySelectorAll('input[name="rectangle-selection-scope"]').forEach(input => {
  input.addEventListener('change', e => { state.selectCurrentOutlineOnly = e.target.value === 'selected'; updateTabEditor(); queueWorkspaceSave(); });
});
$('#outline-picker').addEventListener('change', e => { commitSettings(); selectTab(e.target.value, null); render(); });
$('#tab-picker').addEventListener('change', e => { commitSettings(); selectTab(state.selectedContour, e.target.value || null); render(); });
$('#selected-tab-width').addEventListener('change', e => {
  const value = toMillimeters(e.target.value, state);
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
  slider.addEventListener('input', e => updateSelectedTab(property, (property === 'widthOverride' ? toMillimeters(e.target.value, state) : Number(e.target.value) / scale), true));
  slider.addEventListener('change', commitSettings);
  slider.addEventListener('blur', commitSettings);
}
$('#inherit-tab-width').addEventListener('click', () => updateSelectedTab('widthOverride', null));
$('#remove-tab').addEventListener('click', removeSelectedTab);
$('#reset-outline').addEventListener('click', () => mutate(() => { delete state.tabLayouts[state.selectedContour]; state.selectedTab = null; state.showTabs = true; }));
$('#reset-all-tabs').addEventListener('click', () => mutate(() => { state.tabLayouts = {}; state.selectedTab = null; state.showTabs = true; }));
function svgPoint(event) {
  const matrix = $('#preview-svg').getScreenCTM();
  return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : null;
}
function nearestOutline(event) {
  const point = svgPoint(event);
  if (!point) return null;
  let nearest = null;
  for (const contour of channelContours()) {
    if (state.adding && contour.id !== state.selectedContour) continue;
    const projected = nearestOnContour(contour, point);
    if (!nearest || projected.distance < nearest.distance) nearest = { ...projected, contour };
  }
  return nearest && nearest.distance <= screenUnit() * 16 ? nearest : null;
}
let tabPlacementPointer = null;
function clearGhost() { $('#tab-ghost')?.remove(); tabPlacementPointer = null; }
function showGhost(event) {
  clearGhost();
  tabPlacementPointer = { clientX: event.clientX, clientY: event.clientY };
  if (state.view === 'cut' && !state.showTabs) return;
  const nearest = nearestOutline(event);
  if (!nearest) return;
  const ghost = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  ghost.id = 'tab-ghost'; ghost.setAttribute('cx', nearest.point.x); ghost.setAttribute('cy', nearest.point.y);
  ghost.dataset.screenRadius = '6';
  ghost.setAttribute('r', screenUnit() * 6); ghost.setAttribute('fill', '#258477'); ghost.setAttribute('fill-opacity', '0.35');
  ghost.setAttribute('stroke', '#258477'); ghost.setAttribute('stroke-width', '2'); ghost.setAttribute('vector-effect', 'non-scaling-stroke'); ghost.setAttribute('pointer-events', 'none');
  $('#preview-svg').append(ghost);
}
let drag = null, suppressOutlineClick = false;
const preview = $('#preview-svg');
const selectionViewport = $('#canvas-viewport');
const measureTool = createMeasureTool({
  viewport: selectionViewport, svg: preview, overlay: $('#measure-overlay'), state,
  format: value => formatLength(value, state), save: queueWorkspaceSave, modeChanged: () => previewPan.refresh(),
  panOwns: event => previewPan.handlesPointer(event), panning: () => previewPan.panning,
  edit: action => { commitSettings(); const before = snapshot(); action(); history.record(before); },
  begin: () => { commitWorkspaceEdits(); clearGhost(); previewPan.reset(); },
});
const previewDimensions = createPreviewDimensions({
  viewport: selectionViewport, sheet: $('#sheet-wrap'),
  width: $('#dimension-width'), height: $('#dimension-height'),
  getSize: () => state.scaled, format: value => formatLength(value, state), changed: () => measureTool.draw(),
});
const previewPan = createPreviewPan({
  viewport: $('#canvas-viewport'), button: $('#pan-preview'),
  enabled: () => state.zoom >= 1,
  active: () => !document.querySelector('dialog[open]'),
  defaultDrag: () => !measureTool.active && !state.editing && !state.editingOutlines && !state.editingRegions && !state.editingBridges,
  getPosition: () => ({ x: state.panX, y: state.panY }),
  setPosition: ({ x, y }) => { state.panX = x; state.panY = y; fitSheet(); },
  changed: queueWorkspaceSave,
  modeChanged: mode => updatePanHint(state, mode),
});
function drawSelectionBox(start, end) {
  drawMarginSelection(preview, start, end);
  let rect = $('#tab-selection-box');
  if (!rect) {
    rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.id = 'tab-selection-box';
    preview.append(rect);
  }
  for (const [key, value] of Object.entries({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) })) rect.setAttribute(key, value);
}
function selectionBounds(contour) {
  if (!outlineBounds.has(contour)) {
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const p of contour.points) {
      left = Math.min(left, p.x); right = Math.max(right, p.x);
      top = Math.min(top, p.y); bottom = Math.max(bottom, p.y);
    }
    outlineBounds.set(contour, { left, right, top, bottom });
  }
  return { regionId: contour.regionId, ...outlineBounds.get(contour) };
}
function updateLayerSelectionDrag() {
  if (!drag || drag.kind !== 'layers') return;
  if (drag.frame != null) cancelAnimationFrame(drag.frame);
  drag.frame = null;
  if (!drag.pendingPoint) return;
  const point = svgPoint(drag.pendingPoint);
  drag.pendingPoint = null;
  if (!point) return;
  const left = Math.min(drag.start.x, point.x), right = Math.max(drag.start.x, point.x);
  const top = Math.min(drag.start.y, point.y), bottom = Math.max(drag.start.y, point.y);
  // Enclosing any contour still selects its whole source layer.
  const regions = new Set(drag.bounds.filter(b => b.left >= left && b.right <= right && b.top >= top && b.bottom <= bottom).map(b => b.regionId));
  const selected = [...new Set([...drag.previous, ...state.scaled.contours.filter(c => regions.has(c.regionId)).map(c => c.id)])];
  const previous = new Set(state.selectedOutlines);
  if (selected.length !== previous.size || selected.some(id => !previous.has(id))) {
    state.selectedOutlines = selected;
    updateOutlineSelection();
  }
  drawSelectionBox(drag.start, point);
}
selectionViewport.addEventListener('pointerdown', e => {
  if (e.button !== 0 || drag) return;
  if (state.editingOutlines) {
    suppressOutlineClick = false;
    commitSettings();
    drag = { kind: 'layers', pointerId: e.pointerId, x: e.clientX, y: e.clientY, start: svgPoint(e), moved: false,
      outlineId: e.target.closest('[data-visibility-outline]')?.dataset.visibilityOutline, additive: e.shiftKey,
      previousSelection: [...state.selectedOutlines], previous: e.shiftKey ? [...state.selectedOutlines] : [],
      bounds: state.scaled.contours.filter(c => c.points.length && (state.showHiddenOutlines || !state.hiddenContours.includes(c.id))).map(selectionBounds) };
    if (e.isTrusted) preview.setPointerCapture(e.pointerId);
    e.preventDefault();
    return;
  }
  if (!state.editing) return;
  if (state.adding) {
    if (!preview.contains(e.target)) return;
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
    } else { state.showTabs = true; state.tabSettingsScope = 'tab'; state.selectedContour = ref.contourId; state.selectedTab = ref.id; }
  } else { selectTab(outline?.dataset.outline ?? state.selectedContour, null); if (outline) state.tabSettingsScope = 'object'; }
  drag = { kind: marker ? 'tabs' : 'box', pointerId: e.pointerId, x: e.clientX, y: e.clientY, start: svgPoint(e), before: snapshot(), moved: false,
    tabs: selectionPositions(), anchor: selectedBridge()?.position, contourId: state.selectedContour, selectionContour, previous: e.shiftKey ? previous.filter(ref => marker || !selectionContour || ref.contourId === selectionContour) : [] };
  preview.classList.toggle('dragging-object', drag.kind === 'tabs');
  // Capture on the persistent SVG, whose marker children are replaced on render.
  if (e.isTrusted) preview.setPointerCapture(e.pointerId);
  e.preventDefault(); render();
});
preview.addEventListener('click', e => {
  if (state.editingOutlines) {
    if (suppressOutlineClick && e.detail !== 0) { suppressOutlineClick = false; return; }
    const outline = e.target.closest('[data-visibility-outline]');
    selectOutline(outline?.dataset.visibilityOutline, e.shiftKey, true);
    return;
  }
  if (!state.editing || state.adding || e.detail !== 0) return;
  const marker = e.target.closest('[data-tab]');
  if (!marker) return;
  selectTab(marker.dataset.outline, marker.dataset.tab); render();
});
selectionViewport.addEventListener('pointermove', e => {
  if (state.adding) return preview.contains(e.target) ? showGhost(e) : clearGhost();
  if (!drag || drag.pointerId !== e.pointerId) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 3) return;
  if (drag.kind === 'layers') {
    drag.moved = true;
    drag.pendingPoint = { clientX: e.clientX, clientY: e.clientY };
    if (drag.frame == null) drag.frame = requestAnimationFrame(updateLayerSelectionDrag);
    return;
  }
  const point = svgPoint(e); if (!point) return;
  drag.moved = true;
  if (drag.kind === 'box') {
    const start = drag.start;
    const inside = state.result.bridges.filter(b => (!drag.selectionContour || b.contourId === drag.selectionContour) && b.point.x >= Math.min(start.x, point.x) && b.point.x <= Math.max(start.x, point.x) && b.point.y >= Math.min(start.y, point.y) && b.point.y <= Math.max(start.y, point.y));
    state.selectedTabs = [...drag.previous];
    for (const b of inside) if (!state.selectedTabs.some(ref => matchesTab(b, ref))) state.selectedTabs.push({ contourId: b.contourId, id: b.id });
    if (state.selectedTabs.length) { state.showTabs = true; state.tabSettingsScope = 'tab'; }
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
  if (drag.kind === 'layers') {
    if (drag.frame != null) cancelAnimationFrame(drag.frame);
    if (!cancelled && drag.moved) {
      if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) drag.pendingPoint = event;
      updateLayerSelectionDrag();
    }
  }
  const finished = drag; drag = null;
  preview.classList.remove('dragging-object');
  $('#tab-selection-box')?.remove();
  clearMarginSelection(preview);
  if (finished.kind === 'layers') {
    suppressOutlineClick = true;
    if (cancelled) { state.selectedOutlines = finished.previousSelection; updateOutlineSelection(); }
    else if (finished.moved) queueWorkspaceSave();
    else selectOutline(finished.outlineId, finished.additive, true);
  } else if (cancelled && finished.moved) {
    // Tab drags update markers without committing polygon geometry. Force a
    // rebuild even when cancellation restores the previous settings key.
    if (finished.kind === 'tabs') geometryKey = null;
    restore(finished.before);
  }
  else if (finished.moved && finished.kind === 'tabs') history.record(finished.before);
  if (preview.hasPointerCapture(event.pointerId)) preview.releasePointerCapture(event.pointerId);
  if (!cancelled && finished.moved && finished.kind === 'tabs') render();
}
selectionViewport.addEventListener('pointerup', e => finishDrag(e));
selectionViewport.addEventListener('pointercancel', e => finishDrag(e, true));
selectionViewport.addEventListener('lostpointercapture', e => finishDrag(e, true));
preview.addEventListener('pointerleave', clearGhost);
$('#preview-svg').addEventListener('keydown', e => {
  if (state.editingOutlines) {
    const outline = e.target.closest('[data-visibility-outline]');
    if (!outline || !['Enter', ' ', 'Delete', 'Backspace'].includes(e.key)) return;
    e.preventDefault();
    const id = outline.dataset.visibilityOutline;
    if (e.key === 'Enter' || e.key === ' ') selectOutline(id, e.shiftKey, true);
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
    else { state.showTabs = true; state.tabSettingsScope = 'tab'; state.selectedContour = marker.dataset.outline; state.selectedTab = marker.dataset.tab; }
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
    const layerDrag = drag?.kind === 'layers';
    if (drag) finishDrag({ pointerId: drag.pointerId }, true);
    state.adding = false; clearGhost();
    if (!layerDrag) render();
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
    measureTool.reset();
    state.sourceChosen = Boolean(state.source);
    state.workflowStep = 1; state.activeTool = 'layers';
    bridgeEditor.cancel(); Object.assign(state, materialDefaults()); state.selectedRegionBridge = null; state.selectedRegionBridges = [];
    cancelAnimationFrame(renderFrame);
    state.artwork = artwork; state.source = source; state.example = example; state.name = name; state.sourceWarnings = artwork.warnings; state.zoom = 1; state.panX = state.panY = 0; previewPan.reset();
    state.tabLayouts = {}; state.objectSettings = {}; state.hiddenContours = []; state.cutawayContours = []; state.regions = []; state.selectedRegion = null; state.drawingRegion = false; state.regionDraft = []; state.selectedOutlines = []; state.selectedTabs = []; state.selectedContour = artwork.contours[0].id; state.selectedTab = null; state.adding = false;
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
  return structuredClone({ measurements: state.measurements, source: state.source, name: state.name, example: state.example, settings: Object.fromEntries(Object.keys(defaults).map(key => [key, state[key]])), tabLayouts: state.tabLayouts, objectSettings: state.objectSettings, hiddenContours: state.hiddenContours, cutawayContours: state.cutawayContours, regions: state.regions, ...Object.fromEntries(Object.keys(materialDefaults()).map(key => [key, state[key]])) });
}
function syncSourceInputs() {
  $('#filename').textContent = state.name;
  document.querySelectorAll('[data-example]').forEach(b => b.classList.toggle('active', b.dataset.example === state.example));
}
function restore(saved) {
  cancelAnimationFrame(renderFrame); pendingSettings = null; positionGesture = null;
  measureTool.cancelDraft();
  state.measurements = structuredClone(saved.measurements ?? []);
  if (saved.source && saved.source !== state.source) {
    state.artwork = importSvg(saved.source); state.source = saved.source;
    state.sourceWarnings = state.artwork.warnings; state.name = saved.name; state.example = saved.example ?? '';
    state.selectedContour = state.artwork.contours[0].id; state.selectedOutlines = []; state.selectedTabs = [];
    syncSourceInputs();
  }
  Object.assign(state, defaults, saved.settings); state.tabLayouts = structuredClone(saved.tabLayouts);
  state.objectSettings = structuredClone(saved.objectSettings ?? {});
  state.hiddenContours = [...(saved.hiddenContours ?? [])];
  state.cutawayContours = [...(saved.cutawayContours ?? [])];
  for (const [key, value] of Object.entries(materialDefaults(saved))) state[key] = structuredClone(saved[key] ?? value);
  preserveLegacyAreaChoices(saved);
  state.selectedRegionBridge = null; state.selectedRegionBridges = [];
  state.regions = structuredClone(saved.regions ?? []).map((region, index) => ({ ...region, label: region.label ?? `Region ${index + 1}` }));
  state.drawingRegion = false; state.regionDraft = [];
  state.selectedTab = null;
  syncSettingInputs(); render(); updateHistoryButtons();
}
function updateHistoryButtons() {
  if (busy.active) { queueWorkspaceSave(); return; }
  $('#undo').disabled = !history.canUndo; $('#redo').disabled = !history.canRedo;
  queueWorkspaceSave();
}
function commitSettings() {
  livePreview.clear();
  positionGesture = null;
  if (pendingSettings) {
    history.record(pendingSettings); pendingSettings = null;
    scheduleRender();
  }
  queueWorkspaceSave();
}
function mutate(action) {
  commitSettings(); cancelAnimationFrame(renderFrame);
  const before = snapshot(); action();
  if (detectAreas) detectionBefore = before;
  render();
  if (!detectAreas) history.record(before);
}
function scheduleRender() { cancelAnimationFrame(renderFrame); renderFrame = requestAnimationFrame(render); }
function syncSettingInputs() {
  for (const key of Object.keys(defaults)) {
    if ($(`#${key}`)) {
      if ($(`#${key}`).type === 'checkbox') $(`#${key}`).checked = state[key];
      else if (['artworkWidth', 'channelWidth', 'tabWidth', 'margin'].includes(key)) setLengthValue($(`#${key}`), state[key], state);
      else $(`#${key}`).value = state[key];
    }
    if ($(`#${key}-range`)) {
      if (['artworkWidth', 'channelWidth', 'tabWidth', 'margin'].includes(key)) setLengthValue($(`#${key}-range`), state[key], state);
      else $(`#${key}-range`).value = state[key];
    }
  }
  document.querySelectorAll('[data-shape-setting]').forEach(button => {
    const selected = state[button.dataset.shapeSetting] === (button.dataset.rounded === 'true');
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  $('#offset-value').textContent = `${state.tabOffset}%`;
  updateRangePaint();
}
function syncControl(key, value, live = false) {
  const input = $(`#${key}`);
  if (value === '' || !Number.isFinite(Number(value))) { syncSettingInputs(); return; }
  let number = Math.max(Number(input.min), Math.min(Number(input.max), Number(value)));
  if (['artworkWidth', 'channelWidth', 'tabWidth', 'margin'].includes(key)) number = toMillimeters(number, state);
  if (key === 'tabCount') number = Math.round(number);
  if (['tabCount', 'tabOffset', 'tabWidth'].includes(key)) state.showTabs = true;
  if (!pendingSettings) pendingSettings = snapshot();
  state[key] = number;
  syncSettingInputs();
  // Rebuilding geometry locks the controls and ends the native slider drag.
  // Keep values live, then generate once the range emits change on release.
  if (live) livePreview.schedule();
  else commitSettings();
}
$('#artworkHeight').addEventListener('change', e => {
  if (!state.artwork) return;
  const { bounds } = state.artwork;
  const ratio = (bounds.maxY - bounds.minY) / (bounds.maxX - bounds.minX);
  const height = e.target.value;
  syncControl('artworkWidth', height === '' ? '' : Number(height) / ratio);
  // Also restore the derived value when an empty or invalid edit is rejected.
  setLengthValue(e.target, state.artworkWidth * ratio, state);
});
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
    mutate(() => { if (key === 'roundedTabs') state.showTabs = true; state[key] = rounded; syncSettingInputs(); });
  });
});
$('#tabs-minus').addEventListener('click', () => syncControl('tabCount', state.tabCount - 1));
$('#tabs-plus').addEventListener('click', () => syncControl('tabCount', state.tabCount + 1));
$('#reset').addEventListener('click', () => { mutate(() => { Object.assign(state, defaults); state.tabLayouts = {}; state.objectSettings = {}; state.selectedTab = null; state.showTabs = true; syncSettingInputs(); }); notify('Stencil settings and tabs reset. Undo is available.'); });
$('#undo').addEventListener('click', () => { bridgeEditor.finishGesture(); regionEditor.finishGesture(); commitSettings(); history.undo(); });
$('#redo').addEventListener('click', () => { bridgeEditor.finishGesture(); regionEditor.finishGesture(); history.redo(); });
$('#show-tabs').addEventListener('change', e => { state.showTabs = e.target.checked; render(); });
$('#show-bridges').addEventListener('change', e => { state.showBridges = e.target.checked; render(); });
$('#show-original').addEventListener('change', e => { state.showOriginal = e.target.checked; render(); });
function syncPreviewPreferences() {
  configureLengthControls(state);
  document.querySelectorAll('[data-units]').forEach(button => {
    const active = button.dataset.units === state.units;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('#show-grid').checked = state.showGrid;
  $('#grid-spacing-control').hidden = !state.showGrid;
  const gridSlider = $('#grid-spacing');
  const inches = state.units === 'in';
  gridSlider.min = inches ? 0.2 : 4;
  gridSlider.max = inches ? 4 : 101;
  gridSlider.step = inches ? 0.1 : 1;
  gridSlider.value = displayLength(state.gridSpacing, state);
  $('#grid-spacing-value').textContent = formatLength(state.gridSpacing, state);
  $('#grid-spacing').setAttribute('aria-valuetext', formatLength(state.gridSpacing, state));
  updateRangePaint();
}
document.querySelectorAll('[data-units]').forEach(button => button.addEventListener('click', () => {
  commitWorkspaceEdits();
  state.units = button.dataset.units;
  syncPreviewPreferences(); syncSettingInputs(); render(); queueWorkspaceSave();
}));
$('#show-grid').addEventListener('change', e => {
  state.showGrid = e.target.checked; syncPreviewPreferences(); render(); queueWorkspaceSave();
});
$('#grid-spacing').addEventListener('input', e => {
  state.gridSpacing = toMillimeters(Number(e.target.value), state);
  syncPreviewPreferences(); scheduleRender(); queueWorkspaceSave();
});
for (const mode of ['material', 'cut']) $(`#${mode}-view`).addEventListener('click', () => {
  state.view = mode;
  for (const v of ['material', 'cut']) { $(`#${v}-view`).classList.toggle('active', v === mode); $(`#${v}-view`).setAttribute('aria-pressed', v === mode); }
  render();
});
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && !e.altKey && ['+', '=', '-'].includes(e.key) && !document.querySelector('dialog[open]')) {
    e.preventDefault(); e.stopImmediatePropagation(); zoomPreview(e.key === '-' ? -0.25 : 0.25);
  }
}, true);
// Pointer clicks should not leave focus behind for Escape/Space to highlight.
// Keyboard activation retains focus and the visible keyboard navigation ring.
$('.zoom-controls').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (event.detail > 0 && button === document.activeElement) button.blur();
});
$('#zoom-in').addEventListener('click', () => zoomPreview(0.25));
$('#zoom-out').addEventListener('click', () => zoomPreview(-0.25));
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
  notify(`Stencil downloaded — ${formatLength(state.scaled.width, state)} × ${formatLength(state.scaled.height, state)}.`);
});
$('#export-session').addEventListener('click', () => {
  if (!state.source) return;
  commitWorkspaceEdits();
  const session = { format: 'stencil-studio-session', exportedAt: new Date().toISOString(), ...captureWorkspace() };
  downloadFile(JSON.stringify(session, null, 2) + '\n', 'application/json', state.name.replace(/\.svg$/i, '') + '-session.json');
  notify('Session exported with the original SVG, settings, edits, rulers, and undo history.');
});
$('#help').addEventListener('click', () => $('#help-dialog').showModal());
for (const id of ['close-help', 'got-it']) $(`#${id}`).addEventListener('click', () => $('#help-dialog').close());
$('#help-dialog').addEventListener('click', e => { if (e.target === $('#help-dialog')) { const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close(); } });
new ResizeObserver(scheduleRender).observe($('#canvas-viewport'));
let workspaceSaveTimer;
let storageWarningShown = false;
let lastSavedDocument = null;
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
  const ui = Object.fromEntries(['measureSnap', 'units', 'showGrid', 'gridSpacing', 'view', 'showTabs', 'showOriginal', 'zoom', 'panX', 'panY', 'editing', 'adding', 'selectedContour', 'selectedTab', 'selectedTabs', 'tabSettingsScope', 'selectCurrentOutlineOnly', 'editingOutlines', 'selectedOutlines', 'showHiddenOutlines', 'editingRegions', 'selectedRegion', 'drawingRegion', 'regionDraft', 'regionWidth', 'regionTaperLength', 'regionRoundedTabs', 'regionRoundedChannelCorners', 'regionScope'].map(key => [key, state[key]]));
  const viewport = $('#canvas-viewport');
  Object.assign(ui, { workflowStep: state.workflowStep, activeTool: state.activeTool, showBridges: state.showBridges, reviewingTypes: state.reviewingTypes, reviewRegion: state.reviewRegion, sourceChosen: state.sourceChosen, editingBridges: state.editingBridges, selectedRegionBridge: state.selectedRegionBridge, selectedRegionBridges: state.selectedRegionBridges });
  return {
    version: 1, source: state.source, name: state.name, example: state.example,
    document: snapshot(), ui, history: history.serialize(),
    scroll: { x: window.scrollX, y: window.scrollY, canvasX: viewport.scrollLeft, canvasY: viewport.scrollTop },
    focus: document.activeElement?.id || null,
  };
}
function workspaceDocumentSignature(saved) {
  return JSON.stringify([saved.source, saved.name, saved.example, saved.document, saved.history, saved.ui?.measurements]);
}
function saveWorkspace(force = false) {
  clearTimeout(workspaceSaveTimer);
  if (!state.source || busy.active && !force) return;
  const saved = captureWorkspace();
  const signature = workspaceDocumentSignature(saved);
  let result;
  try {
    // Every open tab flushes during a code reload. A tab with no document
    // edits must not overwrite newer work saved by another tab, even if its
    // focus, selection, or scroll position has changed.
    if (signature === lastSavedDocument) {
      const latest = localStorage.getItem(storageKey());
      if (latest && workspaceDocumentSignature(JSON.parse(latest)) !== signature) return;
    }
    result = writeWorkspace(localStorage, saved, storageKey());
    if (result.saved) lastSavedDocument = signature;
  }
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
    Object.assign(state, saved.document.settings, saved.ui, { artwork, source: saved.source, name: saved.name, example: saved.example, sourceWarnings: artwork.warnings, tabLayouts: saved.document.tabLayouts, objectSettings: saved.document.objectSettings ?? {}, selectedContour });
    state.measurements = structuredClone(saved.document.measurements ?? saved.ui.measurements ?? []);
    state.hiddenContours = (saved.document.hiddenContours ?? []).filter(id => contourIds.has(id));
    state.regions = structuredClone(saved.document.regions ?? []).map((region, index) => ({ ...region, label: region.label ?? `Region ${index + 1}` }));
    state.cutawayContours = (saved.document.cutawayContours ?? []).filter(id => artwork.contours.some(c => c.id === id && c.closed));
    for (const [key, value] of Object.entries(materialDefaults(saved.document))) state[key] = structuredClone(saved.document[key] ?? value);
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
    syncPreviewPreferences(); syncSettingInputs();
    // Older snapshots share the workspace source. Bind it now so Undo can
    // cross a later artwork replacement without losing that original SVG.
    history.hydrate(Object.fromEntries(['past', 'future'].map(key => [key, saved.history[key].map(entry => ({ source: saved.source, name: saved.name, example: saved.example ?? '', measurements: structuredClone(state.measurements), ...entry }))])));
    lastSavedDocument = workspaceDocumentSignature(captureWorkspace());
    if (!state.areaSuggestions) refreshAreaSuggestions();
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
  // Persist edits on reload even if their preview is still being calculated.
  saveWorkspace(true);
}
window.addEventListener('stencil:before-reload', flushWorkspace);
window.addEventListener('pagehide', flushWorkspace);
window.addEventListener('beforeunload', flushWorkspace);
window.addEventListener('scroll', queueWorkspaceSave, { passive: true });
$('#canvas-viewport').addEventListener('scroll', queueWorkspaceSave, { passive: true });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushWorkspace(); });

installCustomSelects($('#app'), (select, value) => {
  if (!value || !state.scaled || !state.result) return;
  let paths = [], point = null;
  if (select.id === 'bridge-picker') {
    const bridge = state.result.regionBridges?.find(bridge => bridge.id === value);
    if (bridge) paths = [bridge.polygon];
  } else if (select.id === 'tab-picker') {
    const tab = state.result.bridges.find(tab => tab.id === value && tab.contourId === state.selectedContour);
    if (tab) { paths = tab.segments; point = tab.point; }
  } else if (select.id === 'region-picker') {
    const region = state.scaled.regions?.find(region => region.id === value);
    if (region) paths = [region.points];
  } else {
    let ids = [];
    if (['outline-picker', 'region-scope'].includes(select.id)) ids = value === 'all' ? state.scaled.contours.map(c => c.id) : [value];
    else if (select.dataset.treatmentOutline) {
      const contour = state.artwork.contours.find(c => c.id === select.dataset.treatmentOutline);
      ids = state.artwork.contours.filter(c => c.regionId === contour?.regionId).map(c => c.id);
    } else if (select.id === 'selected-layer-treatment') ids = state.selectedOutlines;
    else if (select.id === 'review-treatment') ids = state.artwork.contours.filter(c => c.regionId === state.reviewRegion).map(c => c.id);
    paths = state.scaled.contours.filter(c => ids.includes(c.id)).map(c => c.points);
  }
  const points = paths.flat();
  if (!points.length) return;
  const bounds = points.reduce((b, p) => ({ minX: Math.min(b.minX, p.x), minY: Math.min(b.minY, p.y), maxX: Math.max(b.maxX, p.x), maxY: Math.max(b.maxY, p.y) }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const center = point ?? {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
  fitSheet(center);
  const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  overlay.classList.add('dropdown-preview');
  overlay.setAttribute('aria-hidden', 'true');
  for (const points of paths) {
    const path = document.createElementNS(overlay.namespaceURI, 'path');
    path.setAttribute('d', pathData(points, select.id !== 'tab-picker'));
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    overlay.append(path);
  }
  $('#preview-svg').append(overlay);
  return () => overlay.remove();
});
