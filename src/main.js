import { scaleRegions } from './regions.js';
import { createRegionEditor } from './region-editor.js';
import { importSvg, scaleArtwork, examples } from './import-svg.js';
import { generateStencil, pathData, exportSvg } from './geometry.js';
import { customizeContour, nearestOnContour } from './tab-layout.js';
import { workspaceKey, readWorkspace, writeWorkspace } from './workspace-storage.js';

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
const defaults = { artworkWidth: 150, channelWidth: 1.5, tabWidth: 3, tabCount: 4, tabOffset: 0, margin: 8, roundedTabs: false };
const state = { ...defaults, artwork: null, source: null, example: '', name: 'Bloom.svg', view: 'material', showTabs: true, showOriginal: false, zoom: 1, sourceWarnings: [], result: null, scaled: null, tabLayouts: {}, hiddenContours: [], cutawayContours: [], regions: [], editingRegions: false, selectedRegion: null, drawingRegion: false, regionDraft: [], regionWidth: 0.8, regionTaperLength: 5, regionScope: 'outline-0', editingOutlines: false, selectedOutlines: [], showHiddenOutlines: true, editing: false, adding: false, selectedContour: null, selectedTab: null, selectedTabs: [], selectCurrentOutlineOnly: true };
const $ = s => document.querySelector(s);
const outlineThumbnails = new WeakMap();

document.querySelector('#app').innerHTML = `
  <header class="app-header">
    <a class="brand" href="./" aria-label="Stencil Studio home"><span>stencil<span class="brand-light">studio</span><span class="brand-dot">.</span></span></a>
    <div class="header-right"><button class="text-button" id="help">${icon('help')} How it works</button></div>
  </header>
  <main>
    <section class="intro"><h1>Make the cut<span>.</span></h1></section>
    <div class="workspace">
      <aside class="inspector" aria-label="Stencil settings">
        <section class="control-section source-section"><div class="section-heading"><span class="step">01</span><h2>Your artwork</h2><span class="format-tag">SVG</span></div>
          <input type="file" id="file-input" accept=".svg,image/svg+xml" hidden />
          <button class="upload-zone" id="upload">${icon('upload')}<strong>Drop your SVG here</strong><span>or click to browse · up to 3 MB</span></button>
          <div class="current-file">${icon('file')}<div><strong id="filename">Bloom.svg</strong><span id="source-info">2 vector contours</span></div><span class="file-check">${icon('check')}</span></div>
          <div class="examples"><span>Try a sample</span><button data-example="bloom" class="active" title="Bloom example">Bloom</button><button data-example="orbit" title="Orbit example">Orbit</button><button data-example="arch" title="Arch example">Arch</button></div>
        </section>
        <section class="control-section"><div class="section-heading"><span class="step">02</span><h2>Shape your stencil</h2><button class="icon-button reset" id="reset" title="Reset settings" aria-label="Reset settings">${icon('reset')}</button></div>
          <div class="control"><div class="control-label"><label for="artworkWidth">Artwork width</label><div class="number-unit"><input id="artworkWidth" type="number" min="10" max="1000" step="1" value="150" /><span>mm</span></div></div><p class="control-hint">Height scales with your artwork.</p></div>
          <div class="control"><div class="control-label"><label for="channelWidth">Channel width</label><div class="number-unit"><input id="channelWidth" type="number" min="0.2" max="12" step="0.1" value="1.5" /><span>mm</span></div></div><input type="range" id="channelWidth-range" aria-label="Channel width slider" min="0.2" max="12" step="0.1" value="1.5" /><div class="range-labels"><span>Fine</span><span>Bold</span></div></div>
          <div class="tab-divider"><span>RETAINING TABS</span><span class="tiny-bridge"><i></i><i></i></span></div>
          <div class="control"><div class="control-label"><label for="tabWidth">Default tab width</label><div class="number-unit"><input id="tabWidth" type="number" min="0.5" max="15" step="0.1" value="3" /><span>mm</span></div></div><input type="range" id="tabWidth-range" aria-label="Default tab width slider" min="0.5" max="15" step="0.1" value="3" /></div>
          <div class="control"><div class="control-label"><label for="tabCount">Automatic tabs per outline</label><div class="stepper"><button id="tabs-minus" aria-label="Fewer tabs">${icon('minus')}</button><input type="number" id="tabCount" min="1" max="24" step="1" value="4" /><button id="tabs-plus" aria-label="More tabs">${icon('plus')}</button></div></div></div>
          <div class="control position-control"><div class="control-label"><label for="tabOffset">Automatic tab position</label><output id="offset-value">0%</output></div><input type="range" id="tabOffset" min="0" max="100" step="1" value="0" aria-label="Automatic tab position" /><p class="control-hint">Slide automatic tabs around closed outlines.</p></div>
          <p class="control-hint" id="automatic-scope"></p>
          <div class="control"><label class="check-label"><input type="checkbox" id="roundedTabs" /><span>Rounded tab ends</span></label><p class="control-hint">Round the cut-channel ends beside tabs, keeping the tab gap.</p></div>
          <button class="small-button" id="reset-all-tabs" disabled>Reset all to automatic</button>

        </section>
        <section class="control-section output-section"><div class="section-heading"><span class="step">03</span><h2>Ready for your cutter</h2></div><button id="download" class="download-button">${icon('download')}<span>Download stencil</span><span class="download-type">.svg</span></button><p class="export-note">Closed vector paths · actual-size export</p><button id="export-session" class="small-button session-export">${icon('download')}<span>Export session</span><span class="session-type">.json</span></button><p class="export-note">Original SVG · settings · edits · undo history</p></section>
        <div class="privacy-note">Your files stay on your device.</div>
      </aside>
      <section class="preview-panel" aria-label="Stencil preview">
        <div class="preview-toolbar"><div class="preview-heading"><span class="live-dot"></span><h2>Live preview</h2></div><div class="view-switch" role="group" aria-label="Preview mode"><button id="material-view" class="active" aria-pressed="true">Stencil</button><button id="cut-view" aria-pressed="false">Cut paths</button></div></div>
        <div class="preview-options"><label class="check-label"><input type="checkbox" id="show-tabs" checked /><span>Highlight tabs</span><span class="swatch amber"></span></label><label class="check-label"><input type="checkbox" id="show-original" /><span>Original outline</span></label><span class="preview-units">UNITS: MM</span></div>
        <div class="tab-edit-toolbar" role="group" aria-label="Editing mode">
          <button id="edit-outlines" class="small-button" aria-pressed="false" aria-controls="outline-inspector" aria-expanded="false">Edit outlines</button>
          <button id="edit-tabs" class="small-button" aria-pressed="false" aria-controls="tab-inspector" aria-expanded="false">Edit tabs</button>
          <button id="edit-regions" class="small-button" aria-pressed="false" aria-controls="region-inspector" aria-expanded="false">Edit regions</button>
          <span class="edit-spacer"></span>
          <button id="undo" class="small-button" aria-label="Undo last change" title="Undo (⌘/Ctrl Z)" disabled>Undo</button>
          <button id="redo" class="small-button" aria-label="Redo last change" title="Redo (⌘/Ctrl Shift Z)" disabled>Redo</button>
        </div>
        <section class="outline-inspector editing-panel" id="outline-inspector" aria-label="Outline editor" hidden>
          <div class="tab-inspector-heading"><strong>Outline settings</strong><span id="outline-count" role="status"></span></div>
          <p class="edit-hint">Select an outline in the preview or list; Shift selects several. Uncheck Visible or choose Hide selected to leave it out of the stencil and download. Enable Full cut-away on a closed outline to remove its entire interior along a single boundary, with no channel width or tabs. Your tab edits are preserved.</p>
          <div class="outline-actions"><button id="hide-outlines" class="small-button" disabled>Hide selected</button><button id="show-outlines" class="small-button" disabled>Show selected</button><button id="keep-only-outlines" class="small-button" disabled>Show only selected</button><button id="show-all-outlines" class="small-button" disabled>Show all outlines</button></div>
          <label class="check-label hidden-outline-toggle"><input type="checkbox" id="show-hidden-outlines" checked /><span>Show hidden outlines as dashed guides</span></label>
          <div id="outline-list" class="outline-list" role="group" aria-label="Outlines"></div>
        </section>
        <section class="tab-inspector editing-panel" id="tab-inspector" aria-label="Selected tab editor" hidden>
          <div class="tab-inspector-heading"><strong id="selected-outline-label">Tab editing</strong><span id="outline-mode" class="mode-badge"></span></div>
          <p class="edit-hint" id="edit-hint" role="status" hidden></p>
          <div class="tab-pickers">
            <div><label for="outline-picker">Outline</label><select id="outline-picker" aria-label="Select outline"></select></div>
            <div><label for="tab-picker">Tab</label><select id="tab-picker" aria-label="Select tab"></select></div>
          </div>
          <fieldset class="selection-scope">
            <legend>Drag a rectangle to select tabs on:</legend>
            <div class="selection-scope-options">
              <label><input type="radio" name="rectangle-selection-scope" id="selected-layer-only" value="selected" checked /><span>Selected layer only</span></label>
              <label><input type="radio" name="rectangle-selection-scope" id="all-layers" value="all" /><span>All layers</span></label>
            </div>
          </fieldset>
          <div class="tab-selection-area">
            <div id="tab-empty-state"><strong>Select a tab in the preview</strong><span>Or choose one above to adjust its width and position.</span></div>
            <div id="selected-tab-controls" hidden>
              <div class="control tab-width-control"><div class="control-label"><label for="selected-tab-width">Width</label><div class="number-unit"><input id="selected-tab-width" type="number" min="0.5" max="15" step="0.1" /><span>mm</span></div></div><input id="selected-tab-width-range" type="range" min="0.5" max="15" step="0.1" aria-label="Selected tab width slider" /><p id="tab-width-status" class="control-hint"></p></div>
              <div class="control tab-position-control"><div class="control-label"><label for="selected-tab-position">Position</label><div class="number-unit"><input id="selected-tab-position" type="number" min="0" max="100" step="0.1" /><span>%</span></div></div><input id="selected-tab-position-range" type="range" min="0" max="100" step="0.1" aria-label="Selected tab position slider" /></div>
            </div>
          </div>
          <div class="outline-actions"><button id="inherit-tab-width" class="small-button" disabled>Use default width</button><button id="remove-tab" class="small-button danger" disabled>Remove selected tab</button><button id="add-tab" class="small-button" aria-pressed="false" hidden>Add tab</button><button id="reset-outline" class="small-button" title="Clears this outline’s custom positions and width overrides. Undo is available.">Reset outline to automatic</button></div>
          <p class="control-hint" id="outline-mode-hint"></p>
        </section>
        <section class="region-inspector editing-panel" id="region-inspector" aria-label="Channel width regions" hidden>
          <div class="tab-inspector-heading"><strong>Channel width regions</strong><span id="region-count" role="status"></span></div>
          <p class="edit-hint" id="region-hint" role="status"></p>
          <div class="region-fields">
            <div class="region-picker-field"><label for="region-picker">Region · later regions override earlier ones</label><select id="region-picker" aria-label="Select region"></select></div>
            <div class="region-scope-field"><label for="region-scope">Apply to</label><div class="region-scope-picker"><select id="region-scope" aria-label="Region layers"></select><button id="select-region-layer" class="small-button" aria-pressed="false" aria-describedby="region-hint">Select</button></div></div>
            <div class="control region-width-control"><label for="region-width">Channel width (mm)</label><input id="region-width" type="number" min="0.2" max="12" step="0.1" value="0.8" /><input id="region-width-range" type="range" min="0.2" max="12" step="0.1" value="0.8" aria-label="Region channel width slider" /></div>
            <div class="control region-width-control"><label for="region-taper-length">Taper length (mm)</label><input id="region-taper-length" type="number" min="0.1" max="50" step="0.1" value="5" aria-describedby="region-taper-hint" /><input id="region-taper-length-range" type="range" min="0.1" max="50" step="0.1" value="5" aria-label="Region taper length slider" aria-describedby="region-taper-hint" /></div>
          </div>
          <p class="control-hint" id="region-taper-hint">Taper length sets the transition distance outside the region boundary.</p>
          <div class="region-actions"><button id="draw-region" class="small-button">Draw polygon</button><button id="finish-region" class="small-button" hidden>Finish polygon</button><button id="cancel-region" class="small-button" hidden>Cancel drawing</button><button id="remove-region" class="small-button" disabled>Remove region</button></div>
        </section>
        <p id="outlines-empty" class="outlines-empty" role="status" hidden>All outlines are hidden. Use Edit outlines to show them again. Nothing will be exported.</p>
        <div class="canvas-area" id="canvas-area">
          <div class="canvas-viewport" id="canvas-viewport">
            <div class="canvas-corner top-left"></div><div class="canvas-corner bottom-right"></div>
            <div class="sheet-wrap" id="sheet-wrap"><svg id="preview-svg" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Generated stencil with cut channels and retaining tabs"></svg><div class="dimension-width" id="dimension-width">150 mm</div><div class="dimension-height" id="dimension-height">150 mm</div></div>
          </div>
          <div class="canvas-bottom-bar">
            <div class="canvas-label"><span class="status-dot"></span> LIVE VECTOR PREVIEW</div>
            <div class="zoom-controls"><button id="zoom-out" aria-label="Zoom out">${icon('minus')}</button><span id="zoom-label">100%</span><button id="zoom-in" aria-label="Zoom in">${icon('plus')}</button><span class="zoom-divider"></span><button id="zoom-fit" title="Fit to view" aria-label="Fit to view">${icon('fit')}</button></div>
          </div>
        </div>
        <div class="preview-footer"><div class="legend"><span><i class="legend-cut"></i> Cut away</span><span><i class="legend-material"></i> Keep material</span><span><i class="legend-tab"></i> Automatic tab</span><span><i class="legend-custom-tab"></i> Custom tab</span></div><span id="cut-count">8 cut regions</span></div>
      </section>
    </div>
  </main>
  <div id="notice" class="notice" role="status" hidden></div>
  <dialog id="help-dialog"><button id="close-help" class="icon-button dialog-close" aria-label="Close help">${icon('close')}</button><div class="eyebrow">A QUICK FIELD GUIDE</div><h2>A cut above.</h2><p>Make a reusable outline stencil in three steps.</p><ol><li><strong>Bring your vectors.</strong><span>Upload an SVG with paths or shapes. Convert text, masks, and clipping to plain paths in your drawing app first.</span></li><li><strong>Make room for the cut.</strong><span>Channel width sets the strip of material to remove along each outline. Tabs leave small uncut bridges that hold the inner pieces in place.</span></li><li><strong>Send it to your cutter.</strong><span>Download the SVG, import it into your cutter’s software, and cut the edges of the black shapes. Match the imported size to the SVG dimensions.</span></li></ol><div class="help-tip"><strong>Before the big cut</strong><p>Black areas come out; light areas stay. Amber squares mark automatic tabs; teal circles mark custom tabs. Both are preview-only. Use Edit outlines to hide or show outlines or enable Full cut-away on a closed outline. Full cut-aways remove the entire interior at the original boundary without channel width or tabs. Tab edits are preserved when switching back. Hidden outlines are left out of the download. Use Edit regions to draw polygons with a different channel width for one outline or all layers. Drag a region or its corners to adjust it. Use Edit tabs to add, remove, move, or resize individual tabs. Editing makes that outline custom; automatic placement then affects only other outlines. Default width still applies unless a tab has a width override. Inspect small details and overlapping outlines, and test-cut a sample for your material. The sheet boundary is not exported as a cut.</p></div><button id="got-it" class="download-button">Got it ${icon('check')}</button></dialog>
`;

let noticeTimer;
function notify(message, kind = 'success') {
  const el = $('#notice');
  clearTimeout(noticeTimer); el.textContent = message; el.className = `notice ${kind}`; el.hidden = false;
  if (kind !== 'warning') noticeTimer = setTimeout(() => { el.hidden = true; }, 6000);
}

function render() {
  if (!state.artwork) return;
  const padding = Math.max(state.margin, Math.max(state.channelWidth, ...state.regions.map(r => r.width)) / 2 + 2);
  state.scaled = { ...scaleArtwork(state.artwork, state.artworkWidth, padding), padding, regions: scaleRegions(state.regions, state.artworkWidth, padding) };
  state.result = generateStencil(state.scaled.contours, { ...state, regions: state.scaled.regions });
  const { width, height, contours, artworkHeight } = state.scaled;
  const visible = visibleContours();
  const tabContours = channelContours();
  if (!tabContours.some(c => c.id === state.selectedContour)) selectTab(tabContours[0]?.id ?? null, null);
  if (!tabContours.length) { state.editing = false; state.adding = false; }
  // Drop selections removed by resets, undo, or changes to automatic placement.
  state.selectedTabs = state.selectedTab == null ? [] : state.selectedTabs.filter(ref => state.result.bridges.some(b => matchesTab(b, ref)));
  if (state.selectedTabs.length && !selectedBridge()) {
    state.selectedContour = state.selectedTabs[0].contourId; state.selectedTab = state.selectedTabs[0].id;
  }
  updateTabEditor();
  updateOutlineEditor();
  regionEditor.update();
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
  svg.classList.toggle('editing-tabs', state.editing);
  svg.classList.toggle('editing-outlines', state.editingOutlines);
  svg.classList.toggle('adding-tab', state.adding);
  $('#dimension-width').textContent = `${width.toFixed(1)} mm`;
  $('#dimension-height').textContent = `${height.toFixed(1)} mm`;
  $('#cut-count').textContent = `${state.result.paths.length} cut regions · ${state.result.bridges.length} tabs`;
  $('#source-info').textContent = `${visible.length} of ${contours.length} outlines visible · ${state.artworkWidth} × ${artworkHeight.toFixed(1)} mm`;
  $('#outlines-empty').hidden = visible.length > 0;
  $('#offset-value').textContent = `${state.tabOffset}%`;
  fitSheet();
  updateModeCarets();
  const warnings = [...state.sourceWarnings.filter(w => w !== 'Open paths are included as channels with square ends.' || visible.some(c => !c.closed)), ...state.result.warnings];
  $('#download').disabled = state.result.paths.length === 0;
  if (warnings.length) notify(warnings.join(' '), 'warning');
  else if ($('#notice').classList.contains('warning')) $('#notice').hidden = true;
}

function visibleContours() { return state.scaled.contours.filter(c => !state.hiddenContours.includes(c.id)); }
function channelContours() { return visibleContours().filter(c => !state.cutawayContours.includes(c.id)); }
function outlineNumber(id) { return state.artwork.contours.findIndex(c => c.id === id) + 1; }
function pointToMode(panelId, buttonId) {
  const panel = $(`#${panelId}`), button = $(`#${buttonId}`);
  if (panel.hidden) return;
  const bounds = button.getBoundingClientRect();
  panel.style.setProperty('--mode-caret-left', `${bounds.left + bounds.width / 2 - panel.getBoundingClientRect().left - parseFloat(getComputedStyle(panel).borderLeftWidth)}px`);
}
function renderOutlineTargets() {
  return `<g class="outline-visibility-targets">${state.scaled.contours.map(c => {
    const hidden = state.hiddenContours.includes(c.id), selected = state.selectedOutlines.includes(c.id);
    if (hidden && !state.showHiddenOutlines) return '';
    return `<g data-visibility-outline="${c.id}" class="visibility-outline ${hidden ? 'is-hidden' : ''} ${selected ? 'selected' : ''}" tabindex="0" role="button" aria-label="Outline ${outlineNumber(c.id)}, ${hidden ? 'hidden' : 'visible'}" aria-pressed="${selected}">
      <path class="outline-guide" d="${pathData(c.points, c.closed)}" fill="none" vector-effect="non-scaling-stroke" pointer-events="none"/>
      <path d="${pathData(c.points, c.closed)}" fill="none" stroke="transparent" stroke-width="18" vector-effect="non-scaling-stroke" pointer-events="stroke"/>
    </g>`;
  }).join('')}</g>`;
}
function selectOutline(id, additive = false) {
  if (!id) { if (!additive) state.selectedOutlines = []; }
  else if (additive) state.selectedOutlines = state.selectedOutlines.includes(id) ? state.selectedOutlines.filter(value => value !== id) : [...state.selectedOutlines, id];
  else state.selectedOutlines = [id];
  render();
}
function setOutlineVisibility(ids, visible) {
  mutate(() => {
    const hidden = new Set(state.hiddenContours);
    for (const id of ids) { if (visible) hidden.delete(id); else hidden.add(id); }
    state.hiddenContours = state.artwork.contours.filter(c => hidden.has(c.id)).map(c => c.id);
  });
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
  $('#edit-outlines').textContent = state.editingOutlines ? 'Done editing' : 'Edit outlines';
  $('#edit-outlines').setAttribute('aria-pressed', state.editingOutlines);
  $('#edit-outlines').setAttribute('aria-expanded', state.editingOutlines);
  $('#outline-inspector').hidden = !state.editingOutlines;
  $('#outline-count').textContent = `${visibleContours().length} of ${state.scaled.contours.length} visible`;
  $('#show-hidden-outlines').checked = state.showHiddenOutlines;
  const selected = state.selectedOutlines;
  $('#hide-outlines').disabled = !selected.some(id => !state.hiddenContours.includes(id));
  $('#show-outlines').disabled = !selected.some(id => state.hiddenContours.includes(id));
  $('#keep-only-outlines').disabled = selected.length === 0;
  $('#show-all-outlines').disabled = state.hiddenContours.length === 0;
  // Retain the list DOM across unrelated renders (including viewport resizing).
  const list = $('#outline-list');
  const key = JSON.stringify([state.hiddenContours, state.cutawayContours, selected]);
  if (list.artwork !== state.artwork || list.visibilityKey !== key) {
    const focus = list.contains(document.activeElement) ? document.activeElement.id : null;
    list.innerHTML = state.artwork.contours.map(c => {
      const hidden = state.hiddenContours.includes(c.id), active = selected.includes(c.id), number = outlineNumber(c.id);
      return `<div class="outline-row ${active ? 'selected' : ''} ${hidden ? 'is-hidden' : ''}">
        <button id="select-${c.id}" class="outline-select" data-select-outline="${c.id}" aria-pressed="${active}">${outlineThumbnail(c)}<span>Outline ${number}<small>${hidden ? 'Hidden' : 'Visible'} · ${c.closed ? 'Closed' : 'Open'}</small></span></button>
        <label class="check-label cutaway-toggle" title="${c.closed ? 'Remove the entire interior with no channel width or tabs' : 'Full cut-aways require a closed outline'}"><input id="cutaway-${c.id}" type="checkbox" data-cutaway-outline="${c.id}" aria-label="Outline ${number} full cut-away" ${state.cutawayContours.includes(c.id) ? 'checked' : ''} ${c.closed ? '' : 'disabled'} /><span>Full cut-away</span></label>
        <label class="check-label"><input id="visible-${c.id}" type="checkbox" data-visible-outline="${c.id}" aria-label="Outline ${number} visible" ${hidden ? '' : 'checked'} /><span>Visible</span></label>
      </div>`;
    }).join('');
    list.artwork = state.artwork; list.visibilityKey = key;
    if (focus) document.getElementById(focus)?.focus({ preventScroll: true });
  }
  pointToMode('outline-inspector', 'edit-outlines');
  pointToMode('tab-inspector', 'edit-tabs');
  pointToMode('region-inspector', 'edit-regions');
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
  wrap.style.transform = `scale(${state.zoom})`;
  $('#zoom-label').textContent = `${Math.round(state.zoom * 100)}%`;
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
  if (wasAutomatic) notify('This outline now uses custom tab placement. Default width still applies.');
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
    const label = `${b.custom ? 'Custom' : 'Automatic'} tab, outline ${state.scaled.contours.findIndex(c => c.id === b.contourId) + 1}, ${b.width.toFixed(1)} mm${b.widthOverride == null ? ', default width' : ', width override'}`;
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
  $('#automatic-scope').textContent = `Placement applies to ${automatic} automatic outline${automatic === 1 ? '' : 's'} · ${custom} custom. Default width applies unless overridden.`;
  for (const id of ['tabCount', 'tabOffset', 'tabs-minus', 'tabs-plus']) $(`#${id}`).disabled = automatic === 0;
  $('#reset-all-tabs').disabled = Object.keys(state.tabLayouts).length === 0;
  $('#edit-tabs').textContent = state.editing ? 'Done editing' : 'Edit tabs';
  $('#edit-tabs').setAttribute('aria-pressed', state.editing);
  $('#edit-tabs').setAttribute('aria-expanded', state.editing);
  $('#edit-tabs').disabled = contours.length === 0;
  $('#add-tab').hidden = !state.editing;
  $('#add-tab').setAttribute('aria-pressed', state.adding);
  $('#add-tab').textContent = state.adding ? 'Done adding' : 'Add tab';
  $('#edit-hint').hidden = !state.editing;
  $('#edit-hint').textContent = state.adding ? 'Click outlines to keep adding tabs at the previewed positions. Click Done adding or press Escape to finish.' : `Drag a tab along its outline to move it. Drag empty space to select tabs ${state.selectCurrentOutlineOnly ? 'on the current outline' : 'across outlines'}; Shift adds to the selection. Width applies to all selected tabs; position moves them together.`;
  $('#tab-inspector').hidden = !state.editing;
  $('#show-tabs').disabled = state.editing || state.editingOutlines;
  $('#show-tabs').checked = !state.editingOutlines && (state.editing || state.showTabs);
  $('#outline-picker').innerHTML = contours.map(c => `<option value="${c.id}">Outline ${outlineNumber(c.id)} · ${Object.hasOwn(state.tabLayouts, c.id) ? 'Custom' : 'Automatic'}</option>`).join('');
  const contour = selectedContour();
  if (!contour) return;
  const isCustom = Object.hasOwn(state.tabLayouts, contour.id);
  const number = outlineNumber(contour.id);
  $('#outline-mode').textContent = isCustom ? 'Custom' : 'Automatic';
  $('#outline-mode').classList.toggle('custom', isCustom);
  $('#outline-mode-hint').textContent = isCustom ? 'Custom placement is preserved. Widths follow the default unless overridden.' : 'Editing a tab makes this outline custom and preserves its placement.';
  $('#outline-picker').value = contour.id;
  const tabs = state.result.bridges.filter(b => b.contourId === contour.id);
  $('#tab-picker').innerHTML = '<option value="">Select a tab…</option>' + tabs.map((b, i) => `<option value="${b.id}">Tab ${i + 1} · ${b.width.toFixed(1)} mm${b.widthOverride == null ? ' · Default' : ' · Override'}</option>`).join('');
  $('#tab-picker').value = state.selectedTab ?? '';
  const bridge = selectedBridge();
  const selection = selectedBridges();
  const multiple = selection.length > 1;
  $('#remove-tab').textContent = multiple ? 'Remove selected tabs' : 'Remove selected tab';
  $('label[for="selected-tab-position"]').textContent = multiple ? 'Position (move group)' : 'Position';
  $('#selected-tab-controls').hidden = !bridge;
  $('#tab-empty-state').hidden = !!bridge;
  $('#remove-tab').disabled = !bridge;
  $('#inherit-tab-width').disabled = !bridge || bridge.widthOverride == null;
  $('#tab-inspector').classList.toggle('has-selection', !!bridge);
  $('#selected-outline-label').textContent = multiple ? `${selection.length} tabs selected` : bridge ? `Selected tab · Outline ${number} · Tab ${tabs.indexOf(bridge) + 1}` : `Tab editing · Outline ${number}`;
  if (bridge) {
    $('#selected-tab-width').value = bridge.requestedWidth;
    $('#selected-tab-width-range').value = bridge.requestedWidth;
    $('#selected-tab-position').value = Number((bridge.position * 100).toFixed(2));
    $('#selected-tab-position-range').value = $('#selected-tab-position').value;
    updateRangePaint();
    $('#tab-width-status').textContent = `${bridge.widthOverride == null ? 'Uses default width.' : 'Individual width override.'}${bridge.width < bridge.requestedWidth - 1e-7 ? ` Effective width: ${bridge.width.toFixed(2)} mm to fit this outline.` : ''}`;
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
function toggleEditing(mode) {
  regionEditor.finishGesture();
  if (drag) finishDrag({ pointerId: drag.pointerId }, true);
  commitSettings(); clearGhost();
  const enabled = !state[mode];
  state.editing = mode === 'editing' && enabled;
  state.editingOutlines = mode === 'editingOutlines' && enabled;
  state.editingRegions = mode === 'editingRegions' && enabled;
  if (state.editingRegions && !state.selectedRegion && !state.drawingRegion) state.regionScope = state.selectedOutlines[0] ?? state.selectedContour ?? 'all';
  state.adding = false;
  render();
}
$('#edit-regions').addEventListener('click', () => toggleEditing('editingRegions'));
$('#edit-tabs').addEventListener('click', () => toggleEditing('editing'));
$('#edit-outlines').addEventListener('click', () => toggleEditing('editingOutlines'));
$('#outline-list').addEventListener('click', e => {
  const button = e.target.closest('[data-select-outline]');
  if (button) selectOutline(button.dataset.selectOutline, e.shiftKey);
});
$('#outline-list').addEventListener('change', e => {
  if (e.target.matches('[data-cutaway-outline]')) mutate(() => {
    const cutaways = new Set(state.cutawayContours);
    if (e.target.checked) cutaways.add(e.target.dataset.cutawayOutline);
    else cutaways.delete(e.target.dataset.cutawayOutline);
    state.cutawayContours = state.artwork.contours.filter(c => c.closed && cutaways.has(c.id)).map(c => c.id);
  });
  if (e.target.matches('[data-visible-outline]')) setOutlineVisibility([e.target.dataset.visibleOutline], e.target.checked);
});
$('#show-hidden-outlines').addEventListener('change', e => { state.showHiddenOutlines = e.target.checked; render(); });
$('#hide-outlines').addEventListener('click', () => setOutlineVisibility(state.selectedOutlines, false));
$('#show-outlines').addEventListener('click', () => setOutlineVisibility(state.selectedOutlines, true));
$('#show-all-outlines').addEventListener('click', () => setOutlineVisibility(state.hiddenContours, true));
$('#keep-only-outlines').addEventListener('click', () => mutate(() => {
  state.hiddenContours = state.artwork.contours.filter(c => !state.selectedOutlines.includes(c.id)).map(c => c.id);
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
let drag = null;
const preview = $('#preview-svg');
function drawSelectionBox(start, end) {
  $('#tab-selection-box')?.remove();
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.id = 'tab-selection-box';
  for (const [key, value] of Object.entries({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) })) rect.setAttribute(key, value);
  preview.append(rect);
}
preview.addEventListener('pointerdown', e => {
  if (!state.editing || e.button !== 0 || drag) return;
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
  if (drag.kind === 'box') {
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
  if (cancelled && finished.moved) restore(finished.before);
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
    e.preventDefault(); regionEditor.finishGesture(); commitSettings(); if (e.shiftKey) history.redo(); else history.undo();
  }
});

function loadSource(source, name, example = '') {
  try {
    const artwork = importSvg(source);
    cancelAnimationFrame(renderFrame);
    state.artwork = artwork; state.source = source; state.example = example; state.name = name; state.sourceWarnings = artwork.warnings; state.zoom = 1;
    state.tabLayouts = {}; state.hiddenContours = []; state.cutawayContours = []; state.regions = []; state.selectedRegion = null; state.drawingRegion = false; state.regionDraft = []; state.selectedOutlines = []; state.selectedTabs = []; state.selectedContour = artwork.contours[0].id; state.selectedTab = null; state.adding = false;
    history.clear(); pendingSettings = null;
    $('#filename').textContent = name;
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
window.addEventListener('drop', e => e.preventDefault());
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
  return structuredClone({ settings: Object.fromEntries(Object.keys(defaults).map(key => [key, state[key]])), tabLayouts: state.tabLayouts, hiddenContours: state.hiddenContours, cutawayContours: state.cutawayContours, regions: state.regions });
}
function restore(saved) {
  cancelAnimationFrame(renderFrame); pendingSettings = null; positionGesture = null;
  Object.assign(state, defaults, saved.settings); state.tabLayouts = structuredClone(saved.tabLayouts);
  state.hiddenContours = [...(saved.hiddenContours ?? [])];
  state.cutawayContours = [...(saved.cutawayContours ?? [])];
  state.regions = structuredClone(saved.regions ?? []);
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
$('#roundedTabs').addEventListener('change', e => mutate(() => { state.roundedTabs = e.target.checked; }));
$('#tabs-minus').addEventListener('click', () => syncControl('tabCount', state.tabCount - 1));
$('#tabs-plus').addEventListener('click', () => syncControl('tabCount', state.tabCount + 1));
$('#reset').addEventListener('click', () => { mutate(() => { Object.assign(state, defaults); state.tabLayouts = {}; state.selectedTab = null; syncSettingInputs(); }); notify('Stencil settings and tabs reset. Undo is available.'); });
$('#undo').addEventListener('click', () => { regionEditor.finishGesture(); commitSettings(); history.undo(); });
$('#redo').addEventListener('click', () => { regionEditor.finishGesture(); history.redo(); });
$('#show-tabs').addEventListener('change', e => { state.showTabs = e.target.checked; render(); });
$('#show-original').addEventListener('change', e => { state.showOriginal = e.target.checked; render(); });
for (const mode of ['material', 'cut']) $(`#${mode}-view`).addEventListener('click', () => {
  state.view = mode;
  for (const v of ['material', 'cut']) { $(`#${v}-view`).classList.toggle('active', v === mode); $(`#${v}-view`).setAttribute('aria-pressed', v === mode); }
  render();
});
$('#zoom-in').addEventListener('click', () => { state.zoom = Math.min(3, state.zoom + 0.25); fitSheet(); });
$('#zoom-out').addEventListener('click', () => { state.zoom = Math.max(0.25, state.zoom - 0.25); fitSheet(); });
$('#zoom-fit').addEventListener('click', () => { state.zoom = 1; fitSheet(); });
function downloadFile(data, type, filename) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('#download').addEventListener('click', () => {
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
function updateModeCarets() {
  pointToMode('outline-inspector', 'edit-outlines');
  pointToMode('tab-inspector', 'edit-tabs');
  pointToMode('region-inspector', 'edit-regions');
}
const modeObserver = new ResizeObserver(updateModeCarets);
for (const id of ['edit-tabs', 'edit-outlines', 'edit-regions', 'tab-inspector', 'outline-inspector', 'region-inspector']) modeObserver.observe($(`#${id}`));
window.addEventListener('resize', updateModeCarets);
document.fonts.ready.then(updateModeCarets);
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
  const ui = Object.fromEntries(['view', 'showTabs', 'showOriginal', 'zoom', 'editing', 'adding', 'selectedContour', 'selectedTab', 'selectedTabs', 'selectCurrentOutlineOnly', 'editingOutlines', 'selectedOutlines', 'showHiddenOutlines', 'editingRegions', 'selectedRegion', 'drawingRegion', 'regionDraft', 'regionWidth', 'regionTaperLength', 'regionScope'].map(key => [key, state[key]]));
  const viewport = $('#canvas-viewport');
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
    state.regions = structuredClone(saved.document.regions ?? []);
    state.cutawayContours = (saved.document.cutawayContours ?? []).filter(id => artwork.contours.some(c => c.id === id && c.closed));
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
    history.hydrate(saved.history);
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
