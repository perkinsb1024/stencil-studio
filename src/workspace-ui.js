import { displayLength, formatLength, setLengthValue, unitScale } from './units.js';
import { isAutomaticSuggestion } from './area-suggestions.js';
import { pendingTypeReviews } from './type-review.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const plural = (number, singular, multiple = `${singular}s`) => `${number} ${number === 1 ? singular : multiple}`;
function markup(element, value) { if (element.uiMarkup !== value) { element.innerHTML = value; element.uiMarkup = value; } }
export function issueTool(message) {
  return /bridge|unsupported|connect|retained|sheet/i.test(message) ? 'bridges' : /tab/i.test(message) ? 'tabs' : /channel|region|width/i.test(message) ? 'regions' : 'layers';
}

export function updatePanHint(state, mode = $('#pan-preview').getAttribute('aria-pressed') === 'true') {
  let hint = 'Drag to select or edit. Zoom in to pan the canvas.';
  if (state.zoom >= 1) {
    if (state.workflowStep !== 2) hint = 'Drag to pan the zoomed canvas.';
    else if (mode) hint = 'Pan is on. Drag to move the canvas. Tap Space to turn Pan off and edit.';
    else hint = 'Drag to select or edit. Tap Space to toggle Pan, or hold Space and drag to pan.';
  }
  if ($('#canvas-viewport').classList.contains('measuring')) {
    hint = state.zoom < 1 ? 'Click two points to measure. Zoom to 100% to pan.'
      : mode ? 'Pan is on. Drag to move the canvas. Tap Space to return to measuring.'
      : 'Click two points to measure. Tap Space to toggle Pan, or hold Space and drag to pan.';
  }
  $('#move-view-hint').textContent = hint;
}

export function updateWorkspaceUI(state) {
  const step = state.workflowStep;
  $('.workspace').dataset.workflowStep = step;
  $('.workspace').classList.toggle('controls-collapsed', state.controlsCollapsed);
  for (const button of document.querySelectorAll('[data-step]')) {
    if (Number(button.dataset.step) === step) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  }
  for (const [id, number] of [['artwork-step', 1], ['shape-step', 2], ['export-step', 3]]) $(`#${id}`).hidden = step !== number;
  const showHeader = step >= 1 && step <= 3;
  $('#shape-header').hidden = !showHeader;
  $('#shape-header h1').textContent = ({ 1: 'Your Artwork', 2: 'Shape Your Stencil', 3: 'Review & Export' })[step];
  const documentBar = $('.document-bar');
  const header = $('.size-section .section-heading');
  for (const selector of ['.document-title', '.history-actions']) {
    const control = $(selector);
    if (showHeader) {
      if (control.parentElement !== header) header.insertBefore(control, header.querySelector('[popovertarget="stencil-settings"]'));
    } else if (control.parentElement !== documentBar) documentBar.append(control);
  }
  documentBar.hidden = showHeader;
  $('.tab-edit-toolbar').hidden = step !== 2;
  $('#step-back').hidden = step === 1;
  $('#step-next').hidden = step === 3;
  const toolName = { layers: 'Objects', tabs: 'Tabs', bridges: 'Bridges', regions: 'Override Regions' }[state.activeTool];
  $('#step-back').textContent = step === 3 ? `Back to ${toolName}` : 'Back to Artwork';
  $('#step-next').textContent = step === 2 ? 'Continue to Review' : `Continue to ${toolName}`;
  $('#pan-preview').hidden = step !== 2;
  $('#pan-preview').title = state.zoom >= 1 ? 'Toggle between dragging to pan and editing artwork' : 'Zoom to 100% to pan while editing';
  updatePanHint(state);
  $('#region-channel-summary').textContent = `Default channel width: ${formatLength(state.channelWidth, state)}`;
  $('#toggle-controls').hidden = step !== 2;
  $('#toggle-controls').textContent = state.controlsCollapsed ? 'Show Controls' : 'Inspect Canvas';
  $('#toggle-controls').setAttribute('aria-expanded', !state.controlsCollapsed);
  $('#document-name').textContent = state.name;
  $('#document-name').title = state.name;
  $('#filename').title = state.name;
  $('#sample-badge').hidden = !state.example;
  $('#upload strong').textContent = state.sourceChosen ? 'Drop an SVG to replace artwork' : 'Drop your SVG here';
  $('#replace-note').hidden = !state.sourceChosen;
  const totalLayers = new Set(state.artwork.contours.map(c => c.regionId)).size;
  const visibleLayers = new Set(state.artwork.contours.filter(c => !state.hiddenContours.includes(c.id)).map(c => c.regionId)).size;
  $('#source-info').textContent = `${visibleLayers} of ${totalLayers} objects visible\n${displayLength(state.artworkWidth, state)} × ${formatLength(state.scaled.artworkHeight, state)}`;
  const heightInput = $('#artworkHeight');
  const aspectRatio = state.scaled.artworkHeight / state.artworkWidth;
  setLengthValue(heightInput, state.scaled.artworkHeight, state);
  heightInput.min = 10 * aspectRatio / unitScale(state);
  heightInput.max = 1000 * aspectRatio / unitScale(state);
  const pending = pendingTypeReviews(state);
  const automatic = Object.entries(state.areaSuggestions?.byRegion ?? {}).filter(([id, value]) => isAutomaticSuggestion(value) && !state.areaOverrides[id]).length;
  const basis = state.areaSuggestionBasis;
  const stale = basis ? Object.keys(basis).some(key => basis[key] !== state[key]) : state.areaSuggestions && state.areaSuggestions.artworkWidth !== state.artworkWidth;
  $('#detection-summary').textContent = !state.areaSuggestions ? 'Object types have not been checked.' : `${plural(automatic, 'type')} assigned automatically. ${pending.length ? `${plural(pending.length, 'object')} need type review.` : 'No object types need review.'}${stale ? ' Settings changed; reapply automatic types to refresh suggestions.' : ''}`;
  for (const action of document.querySelectorAll('[data-review-types]')) action.hidden = !!state.areaSuggestions && !pending.length;
  const sourceWarnings = state.sourceWarnings.filter(message => message !== 'Open paths are included as channels with square ends.');
  $('#import-issues').hidden = !sourceWarnings.length;
  markup($('#import-issues'), sourceWarnings.map(message => `<p>${escape(message)}</p>`).join(''));
  const tabCount = state.result.bridges.length, bridgeCount = state.regionBridges.length, cuts = state.result.paths.length;
  markup($('#cut-count'), [[cuts, 'Cut Boundary', 'Cut Boundaries'], [tabCount, 'Tab'], [bridgeCount, 'Bridge']].map(([number, singular, multiple]) => `<span class="count-pill ${number ? '' : 'zero'}">${plural(number, singular, multiple)}</span>`).join(''));
  markup($('#preview-legend'), `<span><i class="legend-cut"></i>${state.view === 'cut' ? 'Cut Boundaries' : 'Cut Away'}</span>${state.view === 'material' ? '<span><i class="legend-material"></i>Retained Material</span>' : ''}${(state.view === 'material' || state.showTabs) && !state.editingOutlines && tabCount ? '<span><i class="legend-tab"></i>Automatic Tab</span><span><i class="legend-custom-tab"></i>Custom Tab</span>' : ''}${(state.view === 'material' || state.showBridges) && bridgeCount ? '<span><i class="legend-bridge legend-automatic-bridge"></i>Automatic Bridge</span><span><i class="legend-bridge legend-custom-bridge"></i>Custom Bridge</span><span><i class="legend-bridge legend-invalid-bridge"></i>Invalid Bridge</span>' : ''}`);
  $('#show-bridges').checked = state.view === 'material' || state.showBridges;
  $('#show-bridges').disabled = state.view === 'material';
  $('#highlight-hint').textContent = state.view === 'material' ? 'Highlights stay on in Stencil view. Switch to Cut Paths to hide them.' : 'Turn off both highlights to inspect cut paths without tab or bridge guides, even while editing.';
  $('#outlines-empty').hidden = visibleLayers !== 0;
  $('#no-cuts').hidden = visibleLayers === 0 || cuts > 0;
  const warnings = [...new Set(state.result.warnings)];
  const reviewWarning = step === 2 && warnings.length > 0;
  $('#step-next').classList.toggle('has-warning', reviewWarning);
  if (reviewWarning) {
    $('#step-next').title = `Review ${plural(warnings.length, 'issue')} before cutting.`;
    $('#step-next').setAttribute('aria-describedby', 'geometry-issue-summary');
  } else {
    $('#step-next').removeAttribute('title');
    $('#step-next').removeAttribute('aria-describedby');
  }
  $('#geometry-issues').hidden = !warnings.length;
  const unsupported = state.result.unsupported?.length ?? 0;
  $('#geometry-issue-summary').textContent = unsupported ? `${plural(unsupported, 'Unconnected Region')} — Review Issues` : `Review ${plural(warnings.length, 'Issue')}`;
  $('#geometry-issue-summary').classList.toggle('has-warning', unsupported > 0);
  markup($('#geometry-issue-list'), warnings.map(message => `<li><p>${escape(message)}</p><button class="text-button" data-open-tool="${issueTool(message)}">${{ layers: 'Edit Objects', tabs: 'Edit Tabs', bridges: 'Edit Bridges', regions: 'Edit Override Regions' }[issueTool(message)]}</button></li>`).join(''));
  $('#canvas-context').textContent = step === 2 ? { layers: 'Select an Object', tabs: state.adding ? 'Click to Add Tabs' : 'Select or Drag Tabs', bridges: 'Connect Retained Material', regions: state.drawingRegion ? `${state.regionDraft.length} Corners` : 'Adjust Local Widths' }[state.activeTool] : step === 3 ? 'Inspect Before Cutting' : 'Your Artwork Preview';
  markup($('#export-dimensions'), `<div><dt>Artwork Size</dt><dd>${displayLength(state.artworkWidth, state)} × ${formatLength(state.scaled.artworkHeight, state)}</dd></div><div><dt>Sheet Size</dt><dd>${displayLength(state.scaled.width, state)} × ${formatLength(state.scaled.height, state)}</dd></div><div><dt>File Type</dt><dd>SVG</dd></div>`);
  $('#download').disabled = !cuts;
  $('#download-reason').hidden = !!cuts;
  $('#download-reason').textContent = visibleLayers ? 'No cut paths to download. Choose an object type that creates cuts.' : 'Show an object to create cut paths. You can still export this session.';
  if (step === 3) {
    const problems = (state.result.unsupported?.length ?? 0) || (state.result.narrowConnections ?? 0) || state.result.regionBridges?.some(bridge => !bridge.valid) || state.result.components?.filter(component => component.sheetConnected).length > 1;
    $('#review-support').classList.toggle('has-issues', Boolean(problems));
    $('#review-support').textContent = !state.result.components ? 'Material Has Not Been Checked' : problems ? 'Material Needs Attention' : state.result.components.length ? 'All Material Connected' : 'No Retained Material';
    markup($('#review-issues'), `${pending.length ? `<div class="review-issue"><strong>${plural(pending.length, 'Object Type')} Need Review</strong><p>Uncertain proposals are still using their current types.</p><button class="small-button" data-review-types>Review Object Types</button></div>` : ''}${stale ? '<div class="review-issue"><p>Type suggestions were made with earlier settings. Your current choices are preserved.</p><button class="small-button" data-open-tool="layers">Review Object Settings</button></div>' : ''}${warnings.map(message => `<div class="review-issue"><p>${escape(message)}</p><button class="small-button" data-open-tool="${issueTool(message)}">${{ layers: 'Edit Objects', tabs: 'Edit Tabs', bridges: 'Edit Bridges', regions: 'Edit Override Regions' }[issueTool(message)]}</button></div>`).join('')}`);
  }
}
