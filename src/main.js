import { importSvg, scaleArtwork, examples } from './import-svg.js';
import { generateStencil, pathData, exportSvg } from './geometry.js';
import { customizeContour, nearestOnContour } from './tab-layout.js';

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
const defaults = { artworkWidth: 150, channelWidth: 1.5, tabWidth: 3, tabCount: 4, tabOffset: 0, margin: 8 };
const state = { ...defaults, artwork: null, name: 'Bloom.svg', view: 'material', showTabs: true, showOriginal: false, zoom: 1, sourceWarnings: [], result: null, scaled: null, tabLayouts: {}, editing: false, adding: false, selectedContour: null, selectedTab: null };
const $ = s => document.querySelector(s);

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
          <button class="small-button" id="reset-all-tabs" disabled>Reset all to automatic</button>

        </section>
        <section class="control-section output-section"><div class="section-heading"><span class="step">03</span><h2>Ready for your cutter</h2></div><button id="download" class="download-button">${icon('download')}<span>Download stencil</span><span class="download-type">.svg</span></button><p class="export-note">Closed vector paths · actual-size export</p></section>
        <div class="privacy-note">Your files stay on your device.</div>
      </aside>
      <section class="preview-panel" aria-label="Stencil preview">
        <div class="preview-toolbar"><div class="preview-heading"><span class="live-dot"></span><h2>Live preview</h2></div><div class="view-switch" role="group" aria-label="Preview mode"><button id="material-view" class="active" aria-pressed="true">Stencil</button><button id="cut-view" aria-pressed="false">Cut paths</button></div></div>
        <div class="preview-options"><label class="check-label"><input type="checkbox" id="show-tabs" checked /><span>Highlight tabs</span><span class="swatch amber"></span></label><label class="check-label"><input type="checkbox" id="show-original" /><span>Original outline</span></label><span class="preview-units">UNITS: MM</span></div>
        <div class="tab-edit-toolbar" role="group" aria-label="Tab editing">
          <button id="edit-tabs" class="small-button" aria-pressed="false">Edit tabs</button>
          <button id="add-tab" class="small-button" aria-pressed="false" hidden>Add tab</button>
          <span class="edit-spacer"></span>
          <button id="undo" class="small-button" aria-label="Undo last change" title="Undo (⌘/Ctrl Z)" disabled>Undo</button>
          <button id="redo" class="small-button" aria-label="Redo last change" title="Redo (⌘/Ctrl Shift Z)" disabled>Redo</button>
        </div>
        <p class="edit-hint" id="edit-hint" role="status" hidden></p>
        <section class="tab-inspector" id="tab-inspector" aria-label="Selected tab editor" hidden>
          <div class="tab-inspector-heading"><strong id="selected-outline-label">Tab editing</strong><span id="outline-mode" class="mode-badge"></span></div>
          <div class="tab-pickers">
            <div><label for="outline-picker">Outline</label><select id="outline-picker" aria-label="Select outline"></select></div>
            <div><label for="tab-picker">Tab</label><select id="tab-picker" aria-label="Select tab"></select></div>
          </div>
          <div class="tab-selection-area">
            <div id="tab-empty-state"><strong>Select a tab in the preview</strong><span>Or choose one above to adjust its width and position.</span></div>
            <div id="selected-tab-controls" hidden>
              <div class="control tab-width-control"><div class="control-label"><label for="selected-tab-width">Width</label><div class="number-unit"><input id="selected-tab-width" type="number" min="0.5" max="15" step="0.1" /><span>mm</span></div></div><input id="selected-tab-width-range" type="range" min="0.5" max="15" step="0.1" aria-label="Selected tab width slider" /><p id="tab-width-status" class="control-hint"></p></div>
              <div class="control tab-position-control"><div class="control-label"><label for="selected-tab-position">Position</label><div class="number-unit"><input id="selected-tab-position" type="number" min="0" max="100" step="0.1" /><span>%</span></div></div><input id="selected-tab-position-range" type="range" min="0" max="100" step="0.1" aria-label="Selected tab position slider" /></div>
            </div>
          </div>
          <div class="outline-actions"><button id="inherit-tab-width" class="small-button" disabled>Use default width</button><button id="remove-tab" class="small-button danger" disabled>Remove selected tab</button><button id="add-to-outline" class="small-button">Add tab to this outline</button><button id="reset-outline" class="small-button" title="Clears this outline’s custom positions and width overrides. Undo is available.">Reset outline to automatic</button></div>
          <p class="control-hint" id="outline-mode-hint"></p>
        </section>
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
  <dialog id="help-dialog"><button id="close-help" class="icon-button dialog-close" aria-label="Close help">${icon('close')}</button><div class="eyebrow">A QUICK FIELD GUIDE</div><h2>A cut above.</h2><p>Make a reusable outline stencil in three steps.</p><ol><li><strong>Bring your vectors.</strong><span>Upload an SVG with paths or shapes. Convert text, masks, and clipping to plain paths in your drawing app first.</span></li><li><strong>Make room for the cut.</strong><span>Channel width sets the strip of material to remove along each outline. Tabs leave small uncut bridges that hold the inner pieces in place.</span></li><li><strong>Send it to your cutter.</strong><span>Download the SVG, import it into your cutter’s software, and cut the edges of the black shapes. Match the imported size to the SVG dimensions.</span></li></ol><div class="help-tip"><strong>Before the big cut</strong><p>Black areas come out; light areas stay. Amber squares mark automatic tabs; teal circles mark custom tabs. Both are preview-only. Use Edit tabs to add, remove, move, or resize individual tabs. Editing makes that outline custom; automatic placement then affects only other outlines. Default width still applies unless a tab has a width override. Inspect small details and overlapping outlines, and test-cut a sample for your material. The sheet boundary is not exported as a cut.</p></div><button id="got-it" class="download-button">Got it ${icon('check')}</button></dialog>
`;

let noticeTimer;
function notify(message, kind = 'success') {
  const el = $('#notice');
  clearTimeout(noticeTimer); el.textContent = message; el.className = `notice ${kind}`; el.hidden = false;
  if (kind !== 'warning') noticeTimer = setTimeout(() => { el.hidden = true; }, 6000);
}

function render() {
  if (!state.artwork) return;
  state.scaled = scaleArtwork(state.artwork, state.artworkWidth, Math.max(state.margin, state.channelWidth / 2 + 2));
  state.result = generateStencil(state.scaled.contours, state);
  const { width, height, contours, artworkHeight } = state.scaled;
  updateTabEditor();
  const svg = $('#preview-svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.style.aspectRatio = `${width} / ${height}`;
  fitSheet();
  const cuts = state.result.paths.map(p => pathData(p)).join('');
  svg.innerHTML = `<rect width="${width}" height="${height}" fill="#fffef9"/><path class="cut-shape" d="${cuts}" fill="${state.view === 'material' ? '#502c6c' : 'none'}" stroke="${state.view === 'cut' ? '#502c6c' : 'none'}" stroke-width="0.14" fill-rule="evenodd"/>`;
  if (state.showOriginal) svg.innerHTML += `<g fill="none" stroke="#6f8bca" stroke-width="0.18" stroke-dasharray="1 0.7">${contours.map(c => `<path d="${pathData(c.points, c.closed)}"/>`).join('')}</g>`;
  if (state.editing) svg.innerHTML += `<g class="outline-hit-targets" fill="none" stroke="transparent" stroke-width="18" vector-effect="non-scaling-stroke">${contours.map(c => `<path data-outline="${c.id}" d="${pathData(c.points, c.closed)}" vector-effect="non-scaling-stroke"/>`).join('')}</g>`;
  if (state.editing && state.selectedContour) {
    const selected = contours.find(c => c.id === state.selectedContour);
    if (selected) svg.innerHTML += `<path d="${pathData(selected.points, selected.closed)}" fill="none" stroke="#258477" stroke-width="1" stroke-dasharray="3 4" vector-effect="non-scaling-stroke" pointer-events="none" opacity="0.6"/>`;
  }
  if (state.showTabs || state.editing) svg.innerHTML += renderTabMarkers();
  svg.classList.toggle('editing-tabs', state.editing);
  svg.classList.toggle('adding-tab', state.adding);
  $('#dimension-width').textContent = `${width.toFixed(1)} mm`;
  $('#dimension-height').textContent = `${height.toFixed(1)} mm`;
  $('#cut-count').textContent = `${state.result.paths.length} cut regions · ${state.result.bridges.length} tabs`;
  $('#source-info').textContent = `${state.artwork.contours.length} contours · ${state.artworkWidth} × ${artworkHeight.toFixed(1)} mm`;
  $('#offset-value').textContent = `${state.tabOffset}%`;
  fitSheet();
  const warnings = [...state.sourceWarnings, ...state.result.warnings];
  $('#download').disabled = state.result.paths.length === 0;
  if (warnings.length) notify(warnings.join(' '), 'warning');
  else if ($('#notice').classList.contains('warning')) $('#notice').hidden = true;
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
}

function selectedContour() { return state.scaled?.contours.find(c => c.id === state.selectedContour); }
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
    const selected = b.contourId === state.selectedContour && b.id === state.selectedTab && state.editing;
    const color = b.custom ? '#258477' : '#c3963e';
    const label = `${b.custom ? 'Custom' : 'Automatic'} tab, outline ${state.scaled.contours.findIndex(c => c.id === b.contourId) + 1}, ${b.width.toFixed(1)} mm${b.widthOverride == null ? ', default width' : ', width override'}`;
    return `<g data-tab="${b.id}" data-outline="${b.contourId}" class="tab-marker ${selected ? 'selected' : ''}" ${state.editing ? `tabindex="0" role="button" aria-label="${label}" aria-pressed="${selected}"` : ''}>
      <title>${label}</title>
      <path d="${b.segments.map(p => pathData(p, false)).join('')}" fill="none" stroke="${color}" stroke-width="${state.channelWidth + 0.65}" opacity="0.65"/>
      ${b.custom ? `<circle cx="${b.point.x}" cy="${b.point.y}" r="${radius}"` : `<rect x="${b.point.x - radius}" y="${b.point.y - radius}" width="${radius * 2}" height="${radius * 2}"`} fill="${color}" stroke="#fffef9" stroke-width="1" vector-effect="non-scaling-stroke"/>
      ${selected ? `<circle cx="${b.point.x}" cy="${b.point.y}" r="${radius + screenUnit() * 4}" fill="none" stroke="#502c6c" stroke-width="2" vector-effect="non-scaling-stroke"/>` : ''}
      ${state.editing ? `<circle cx="${b.point.x}" cy="${b.point.y}" r="${screenUnit() * 12}" fill="transparent"/>` : ''}
    </g>`;
  }).join('')}</g>`;
}
function updateTabEditor() {
  const contours = state.scaled.contours;
  const automatic = contours.filter(c => !Object.hasOwn(state.tabLayouts, c.id)).length;
  const custom = contours.length - automatic;
  $('#automatic-scope').textContent = `Placement applies to ${automatic} automatic outline${automatic === 1 ? '' : 's'} · ${custom} custom. Default width applies unless overridden.`;
  for (const id of ['tabCount', 'tabOffset', 'tabs-minus', 'tabs-plus']) $(`#${id}`).disabled = automatic === 0;
  $('#reset-all-tabs').disabled = custom === 0;
  $('#edit-tabs').textContent = state.editing ? 'Done editing' : 'Edit tabs';
  $('#edit-tabs').setAttribute('aria-pressed', state.editing);
  $('#add-tab').hidden = !state.editing;
  $('#add-tab').setAttribute('aria-pressed', state.adding);
  $('#add-tab').textContent = state.adding ? 'Cancel adding' : 'Add tab';
  $('#edit-hint').hidden = !state.editing;
  $('#edit-hint').textContent = state.adding ? 'Click an outline to add a tab at the previewed position. Esc cancels.' : 'Select a tab to adjust its width or remove it. Drag along its outline to move it. Tab and Enter also select tabs.';
  $('#tab-inspector').hidden = !state.editing;
  $('#show-tabs').disabled = state.editing;
  $('#show-tabs').checked = state.editing || state.showTabs;
  const contour = selectedContour();
  if (!contour) return;
  const isCustom = Object.hasOwn(state.tabLayouts, contour.id);
  const outlineNumber = contours.indexOf(contour) + 1;
  $('#outline-mode').textContent = isCustom ? 'Custom' : 'Automatic';
  $('#outline-mode').classList.toggle('custom', isCustom);
  $('#outline-mode-hint').textContent = isCustom ? 'Custom placement is preserved. Widths follow the default unless overridden.' : 'Editing a tab makes this outline custom and preserves its placement.';
  $('#outline-picker').innerHTML = contours.map((c, i) => `<option value="${c.id}">Outline ${i + 1} · ${Object.hasOwn(state.tabLayouts, c.id) ? 'Custom' : 'Automatic'}</option>`).join('');
  $('#outline-picker').value = contour.id;
  const tabs = state.result.bridges.filter(b => b.contourId === contour.id);
  $('#tab-picker').innerHTML = '<option value="">Select a tab…</option>' + tabs.map((b, i) => `<option value="${b.id}">Tab ${i + 1} · ${b.width.toFixed(1)} mm${b.widthOverride == null ? ' · Default' : ' · Override'}</option>`).join('');
  $('#tab-picker').value = state.selectedTab ?? '';
  const bridge = selectedBridge();
  $('#selected-tab-controls').hidden = !bridge;
  $('#tab-empty-state').hidden = !!bridge;
  $('#remove-tab').disabled = !bridge;
  $('#inherit-tab-width').disabled = !bridge || bridge.widthOverride == null;
  $('#tab-inspector').classList.toggle('has-selection', !!bridge);
  $('#selected-outline-label').textContent = bridge ? `Selected tab · Outline ${outlineNumber} · Tab ${tabs.indexOf(bridge) + 1}` : `Tab editing · Outline ${outlineNumber}`;
  if (bridge) {
    $('#selected-tab-width').value = bridge.requestedWidth;
    $('#selected-tab-width-range').value = bridge.requestedWidth;
    $('#selected-tab-position').value = Number((bridge.position * 100).toFixed(2));
    $('#selected-tab-position-range').value = $('#selected-tab-position').value;
    updateRangePaint();
    $('#tab-width-status').textContent = `${bridge.widthOverride == null ? 'Uses default width.' : 'Individual width override.'}${bridge.width < bridge.requestedWidth - 1e-7 ? ` Effective width: ${bridge.width.toFixed(2)} mm to fit this outline.` : ''}`;
    $('#inherit-tab-width').disabled = bridge.widthOverride == null;
  }
  $('#reset-outline').disabled = !isCustom;
}
function addTab(contourId, position) {
  state.selectedContour = contourId;
  mutate(() => {
    const tabs = customizeSelected();
    const id = `tab-${crypto.randomUUID()}`;
    tabs.push({ id, position, widthOverride: null }); state.selectedTab = id;
    state.adding = false;
  });
}
function removeSelectedTab() {
  if (!selectedBridge()) return;
  mutate(() => {
    const tabs = customizeSelected();
    tabs.splice(tabs.findIndex(t => t.id === state.selectedTab), 1); state.selectedTab = null;
  });
}
function updateSelectedTab(property, value, live = false) {
  if (!selectedBridge()) return;
  const apply = () => {
    const tab = customizeSelected().find(t => t.id === state.selectedTab);
    tab[property] = value;
  };
  if (live) {
    // Capture the layout before the first input, including automatic mode and
    // width inheritance, so one undo restores the whole slider gesture.
    if (!pendingSettings) pendingSettings = snapshot();
    apply(); scheduleRender();
  } else mutate(apply);
}
$('#edit-tabs').addEventListener('click', () => {
  state.editing = !state.editing; state.adding = false; render();
});
$('#add-tab').addEventListener('click', () => { state.adding = !state.adding; render(); });
$('#outline-picker').addEventListener('change', e => { state.selectedContour = e.target.value; state.selectedTab = null; render(); });
$('#tab-picker').addEventListener('change', e => { state.selectedTab = e.target.value || null; render(); });
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
$('#add-to-outline').addEventListener('click', () => {
  const contour = selectedContour();
  if (!contour) return;
  const positions = state.result.bridges.filter(b => b.contourId === contour.id).map(b => b.position).sort((a, b) => a - b);
  // Keyboard-accessible placement in the largest free interval; position can be edited numerically.
  const edges = contour.closed && positions.length ? [...positions, positions[0] + 1] : [0, ...positions, 1];
  let position = 0.5, largest = -1;
  for (let i = 1; i < edges.length; i++) if (edges[i] - edges[i - 1] > largest) {
    largest = edges[i] - edges[i - 1]; position = ((edges[i] + edges[i - 1]) / 2) % 1;
  }
  addTab(contour.id, position);
});

function svgPoint(event) {
  const matrix = $('#preview-svg').getScreenCTM();
  return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : null;
}
function nearestOutline(event) {
  const point = svgPoint(event);
  if (!point) return null;
  let nearest = null;
  for (const contour of state.scaled.contours) {
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
$('#preview-svg').addEventListener('pointerdown', e => {
  if (!state.editing || e.button !== 0 || drag) return;
  if (state.adding) {
    const nearest = nearestOutline(e);
    if (nearest) { e.preventDefault(); addTab(nearest.contour.id, nearest.position); }
    return;
  }
  const marker = e.target.closest('[data-tab]');
  const outline = e.target.closest('[data-outline]');
  if (outline) state.selectedContour = outline.dataset.outline;
  state.selectedTab = marker?.dataset.tab ?? null;
  if (marker) {
    commitSettings();
    drag = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, before: snapshot(), moved: false, contourId: state.selectedContour, tabId: state.selectedTab };
    $('#preview-svg').setPointerCapture(e.pointerId); e.preventDefault();
  }
  render();
});
$('#preview-svg').addEventListener('click', e => {
  // Accessibility APIs can activate a button without pointer events.
  if (!state.editing || state.adding || e.detail !== 0) return;
  const marker = e.target.closest('[data-tab]');
  if (!marker) return;
  state.selectedContour = marker.dataset.outline; state.selectedTab = marker.dataset.tab; render();
});
$('#preview-svg').addEventListener('pointermove', e => {
  if (state.adding) return showGhost(e);
  if (!drag || drag.pointerId !== e.pointerId) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 3) return;
  const point = svgPoint(e); if (!point) return;
  const contour = state.scaled.contours.find(c => c.id === drag.contourId);
  if (!contour) return;
  const tab = customizeSelected().find(t => t.id === drag.tabId);
  tab.position = nearestOnContour(contour, point).position; drag.moved = true;
  render();
});
function finishDrag(event, cancelled = false) {
  if (!drag || drag.pointerId !== event.pointerId) return;
  const finished = drag; drag = null;
  if (cancelled && finished.moved) restore(finished.before);
  else if (finished.moved) history.record(finished.before);
  if ($('#preview-svg').hasPointerCapture(event.pointerId)) $('#preview-svg').releasePointerCapture(event.pointerId);
}
$('#preview-svg').addEventListener('pointerup', e => finishDrag(e));
$('#preview-svg').addEventListener('pointercancel', e => finishDrag(e, true));
$('#preview-svg').addEventListener('pointerleave', clearGhost);
$('#preview-svg').addEventListener('keydown', e => {
  const marker = e.target.closest('[data-tab]');
  if (!marker || !state.editing) return;
  if (['Enter', ' ', 'Delete', 'Backspace', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault(); state.selectedContour = marker.dataset.outline; state.selectedTab = marker.dataset.tab;
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
document.addEventListener('keydown', e => {
  if (e.target.closest('input, select, textarea, [contenteditable="true"]')) return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault(); commitSettings(); if (e.shiftKey) history.redo(); else history.undo();
  } else if (e.key === 'Escape') {
    if (drag) { const saved = drag.before; drag = null; restore(saved); }
    state.adding = false; clearGhost(); render();
  }
});

function loadSource(source, name, example = '') {
  try {
    const artwork = importSvg(source);
    cancelAnimationFrame(renderFrame);
    state.artwork = artwork; state.name = name; state.sourceWarnings = artwork.warnings; state.zoom = 1;
    state.tabLayouts = {}; state.selectedContour = artwork.contours[0].id; state.selectedTab = null; state.adding = false;
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
    get canUndo() { return past.length > 0; }, get canRedo() { return future.length > 0; },
  };
}
function snapshot() {
  return structuredClone({ settings: Object.fromEntries(Object.keys(defaults).map(key => [key, state[key]])), tabLayouts: state.tabLayouts });
}
function restore(saved) {
  cancelAnimationFrame(renderFrame); pendingSettings = null;
  Object.assign(state, saved.settings); state.tabLayouts = structuredClone(saved.tabLayouts);
  state.selectedTab = null; state.adding = false;
  syncSettingInputs(); render(); updateHistoryButtons();
}
function updateHistoryButtons() {
  $('#undo').disabled = !history.canUndo; $('#redo').disabled = !history.canRedo;
}
function commitSettings() { if (pendingSettings) { history.record(pendingSettings); pendingSettings = null; } }
function mutate(action) {
  commitSettings(); cancelAnimationFrame(renderFrame);
  const before = snapshot(); action(); render(); history.record(before);
}
function scheduleRender() { cancelAnimationFrame(renderFrame); renderFrame = requestAnimationFrame(render); }
function syncSettingInputs() {
  for (const key of Object.keys(defaults)) {
    if ($(`#${key}`)) $(`#${key}`).value = state[key];
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
$('#tabs-minus').addEventListener('click', () => syncControl('tabCount', state.tabCount - 1));
$('#tabs-plus').addEventListener('click', () => syncControl('tabCount', state.tabCount + 1));
$('#reset').addEventListener('click', () => { mutate(() => { Object.assign(state, defaults); state.tabLayouts = {}; state.selectedTab = null; syncSettingInputs(); }); notify('Stencil settings and tabs reset. Undo is available.'); });
$('#undo').addEventListener('click', () => { commitSettings(); history.undo(); });
$('#redo').addEventListener('click', () => history.redo());
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
$('#download').addEventListener('click', () => {
  if (!state.result?.paths.length) return;
  const data = exportSvg(state.result, state.scaled.width, state.scaled.height, state.name.replace(/\.svg$/i, '') + ' stencil');
  const url = URL.createObjectURL(new Blob([data], { type: 'image/svg+xml' }));
  const link = document.createElement('a'); link.href = url; link.download = state.name.replace(/\.svg$/i, '') + '-stencil.svg'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify(`Stencil downloaded — ${state.scaled.width.toFixed(1)} × ${state.scaled.height.toFixed(1)} mm.`);
});
$('#help').addEventListener('click', () => $('#help-dialog').showModal());
for (const id of ['close-help', 'got-it']) $(`#${id}`).addEventListener('click', () => $('#help-dialog').close());
$('#help-dialog').addEventListener('click', e => { if (e.target === $('#help-dialog')) { const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close(); } });
new ResizeObserver(scheduleRender).observe($('#canvas-viewport'));
updateRangePaint();
loadSource(examples.bloom.svg, examples.bloom.name, 'bloom');
